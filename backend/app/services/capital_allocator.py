"""
Capital Allocator Service - dynamic allocation across strategy types.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

import structlog

from app.config import settings
from app.database import audit_log, get_supabase
from app.models.domain import Book, TradeIntent
from app.services.market_data import market_data_service
from app.services.reconciliation import recon_service
from app.services.regime_detection_service import RegimeState, regime_detection_service
from app.services.strategy_metrics_service import strategy_metrics_service

logger = structlog.get_logger()


@dataclass
class AllocationConfig:
    base_weights: Dict[str, float]
    max_strategy_weight: float
    min_strategy_weight: float
    drawdown_throttle: float
    sharpe_floor: float
    cooldown_minutes: int
    risk_bias_scalars: Dict[str, float]


@dataclass
class AllocationResult:
    strategy_id: str
    allocation_pct: float
    allocated_capital: float
    risk_multiplier: float
    leverage_cap: float
    enabled: bool
    rationale: Dict


class CapitalAllocatorService:
    """Allocator that controls strategy capital and risk multipliers."""

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or (
            settings.CONFIG_DIR / "capital_allocator.json"
        )
        self.config = self._load_config()

    def _load_config(self) -> AllocationConfig:
        with open(self.config_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return AllocationConfig(
            base_weights=raw["base_weights"],
            max_strategy_weight=raw["max_strategy_weight"],
            min_strategy_weight=raw["min_strategy_weight"],
            drawdown_throttle=raw["drawdown_throttle"],
            sharpe_floor=raw["sharpe_floor"],
            cooldown_minutes=raw["cooldown_minutes"],
            risk_bias_scalars=raw["risk_bias_scalars"],
        )

    async def run_allocation(
        self, books: List[Book], total_capital: float
    ) -> List[AllocationResult]:
        tenant_id = settings.tenant_id
        if not tenant_id:
            return []

        if not self._data_quality_ok():
            logger.warning("allocator_data_quality_degraded")
            return []

        await strategy_metrics_service.refresh(tenant_id)
        regime = await regime_detection_service.detect()

        strategies = self._load_strategies(tenant_id)
        if not strategies:
            return []

        performance = self._load_latest_performance(tenant_id)
        risk = self._load_latest_risk(tenant_id)

        allocations = self.compute_allocations(
            strategies=strategies,
            performance=performance,
            risk=risk,
            regime=regime,
            total_capital=total_capital,
            config=self.config,
        )

        await self._store_allocations(tenant_id, allocations, regime)
        return allocations

    def apply_allocations(self, intents: List[TradeIntent]) -> List[TradeIntent]:
        tenant_id = settings.tenant_id
        if not tenant_id or not intents:
            return intents

        allocation_map = self._load_allocation_map(tenant_id)
        if not allocation_map:
            return intents

        adjusted: List[TradeIntent] = []
        for intent in intents:
            allocation = allocation_map.get(str(intent.strategy_id))
            if (
                not allocation
                or allocation["allocation_pct"] <= 0
                or not allocation["enabled"]
            ):
                continue

            max_notional = allocation["allocated_capital"]
            if allocation["max_notional"] > 0:
                max_notional = min(max_notional, allocation["max_notional"])

            if (
                allocation["min_notional"] > 0
                and max_notional < allocation["min_notional"]
            ):
                continue

            original = intent.target_exposure_usd
            intent.target_exposure_usd = (
                min(original, max_notional) * allocation["risk_multiplier"]
            )
            if original > 0:
                scale = intent.target_exposure_usd / original
                intent.max_loss_usd = intent.max_loss_usd * scale

            intent.metadata["allocation_pct"] = allocation["allocation_pct"]
            intent.metadata["risk_multiplier"] = allocation["risk_multiplier"]
            intent.metadata["allocator_decision_id"] = allocation["decision_id"]
            adjusted.append(intent)

        return adjusted

    @staticmethod
    def compute_allocations(
        strategies: List[Dict],
        performance: Dict[str, Dict],
        risk: Dict[str, Dict],
        regime: RegimeState,
        total_capital: float,
        config: AllocationConfig,
    ) -> List[AllocationResult]:
        allocation_scores: Dict[str, float] = {}
        rationale: Dict[str, Dict] = {}

        for strategy in strategies:
            strategy_id = strategy["id"]
            strategy_type = strategy["strategy_type"]
            base_weight = config.base_weights.get(strategy_type, 0.1)

            perf = performance.get(strategy_id, {})
            risk_metrics = risk.get(strategy_id, {})
            sharpe = float(perf.get("sharpe", 0))
            drawdown = float(perf.get("max_drawdown", 0))

            perf_multiplier = 1.0
            if sharpe < config.sharpe_floor:
                perf_multiplier *= 0.7
            if drawdown > config.drawdown_throttle:
                perf_multiplier *= 0.6

            regime_multiplier = 1.0
            if regime.volatility == "high_vol" and strategy_type in (
                "basis",
                "spot_arb",
            ):
                regime_multiplier *= 1.2
            if regime.volatility == "high_vol" and strategy_type in (
                "futures_scalp",
                "spot",
            ):
                regime_multiplier *= 0.6
            if regime.direction == "range_bound" and strategy_type == "futures_scalp":
                regime_multiplier *= 1.1
            if (
                regime.direction in ("trending_up", "trending_down")
                and strategy_type == "spot"
            ):
                regime_multiplier *= 1.1

            risk_bias_scalar = config.risk_bias_scalars.get(regime.risk_bias, 1.0)
            score = base_weight * perf_multiplier * regime_multiplier * risk_bias_scalar

            cluster = risk_metrics.get("correlation_cluster")
            if cluster:
                cluster_penalty = 0.05
                score = max(0.0, score - cluster_penalty)

            allocation_scores[strategy_id] = score
            rationale[strategy_id] = {
                "base_weight": base_weight,
                "perf_multiplier": perf_multiplier,
                "regime_multiplier": regime_multiplier,
                "risk_bias": regime.risk_bias,
                "cluster": cluster,
            }

        total_score = sum(allocation_scores.values()) or 1.0
        results: List[AllocationResult] = []
        for strategy in strategies:
            strategy_id = strategy["id"]
            weight = allocation_scores[strategy_id] / total_score
            weight = min(config.max_strategy_weight, max(0.0, weight))
            weight = weight if weight >= config.min_strategy_weight else 0.0

            allocated_capital = total_capital * weight
            risk_multiplier = 1.0 if weight > 0 else 0.0
            leverage_cap = 1.0

            results.append(
                AllocationResult(
                    strategy_id=strategy_id,
                    allocation_pct=weight,
                    allocated_capital=allocated_capital,
                    risk_multiplier=risk_multiplier,
                    leverage_cap=leverage_cap,
                    enabled=weight > 0,
                    rationale=rationale[strategy_id],
                )
            )

        return results

    def _load_strategies(self, tenant_id: str) -> List[Dict]:
        supabase = get_supabase()
        result = (
            supabase.table("strategies")
            .select(
                "id, strategy_type, enabled, max_notional, min_notional, capacity_estimate"
            )
            .eq("tenant_id", tenant_id)
            .execute()
        )
        return result.data or []

    def _load_latest_performance(self, tenant_id: str) -> Dict[str, Dict]:
        supabase = get_supabase()
        rows = (
            supabase.table("strategy_performance")
            .select("strategy_id, sharpe, max_drawdown")
            .eq("tenant_id", tenant_id)
            .order("ts", desc=True)
            .execute()
        )
        perf = {}
        for row in rows.data:
            if row["strategy_id"] not in perf:
                perf[row["strategy_id"]] = row
        return perf

    def _load_latest_risk(self, tenant_id: str) -> Dict[str, Dict]:
        supabase = get_supabase()
        rows = (
            supabase.table("strategy_risk_metrics")
            .select("strategy_id, correlation_cluster")
            .eq("tenant_id", tenant_id)
            .order("ts", desc=True)
            .execute()
        )
        risk = {}
        for row in rows.data:
            if row["strategy_id"] not in risk:
                risk[row["strategy_id"]] = row
        return risk

    async def _store_allocations(
        self, tenant_id: str, allocations: List[AllocationResult], regime: RegimeState
    ) -> None:
        supabase = get_supabase()
        decision_id = str(uuid4())
        snapshot = []
        for allocation in allocations:
            supabase.table("strategy_allocations").upsert(
                {
                    "tenant_id": tenant_id,
                    "strategy_id": allocation.strategy_id,
                    "allocated_capital": allocation.allocated_capital,
                    "allocation_pct": allocation.allocation_pct,
                    "leverage_cap": allocation.leverage_cap,
                    "risk_multiplier": allocation.risk_multiplier,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).execute()
            supabase.table("strategies").update(
                {
                    "enabled": allocation.enabled,
                }
            ).eq("id", allocation.strategy_id).execute()
            snapshot.append(
                {
                    "strategy_id": allocation.strategy_id,
                    "allocation_pct": allocation.allocation_pct,
                    "allocated_capital": allocation.allocated_capital,
                    "risk_multiplier": allocation.risk_multiplier,
                }
            )

        supabase.table("allocator_decisions").insert(
            {
                "tenant_id": tenant_id,
                "decision_id": decision_id,
                "regime_state": {
                    "direction": regime.direction,
                    "volatility": regime.volatility,
                    "liquidity": regime.liquidity,
                    "risk_bias": regime.risk_bias,
                },
                "allocation_snapshot_json": snapshot,
                "rationale_json": [a.rationale for a in allocations],
                "ts": datetime.utcnow().isoformat(),
            }
        ).execute()

        for allocation in allocations:
            allocation.rationale["decision_id"] = decision_id

        await audit_log(
            action="allocator_decision",
            resource_type="allocator",
            resource_id=decision_id,
            after_state={"allocations": snapshot},
        )

    def _load_allocation_map(self, tenant_id: str) -> Dict[str, Dict]:
        supabase = get_supabase()
        allocations = (
            supabase.table("strategy_allocations")
            .select(
                "strategy_id, allocation_pct, allocated_capital, risk_multiplier, leverage_cap"
            )
            .eq("tenant_id", tenant_id)
            .execute()
        )
        strategies = (
            supabase.table("strategies")
            .select("id, enabled, max_notional, min_notional")
            .eq("tenant_id", tenant_id)
            .execute()
        )

        strategy_map = {row["id"]: row for row in strategies.data}
        allocation_map = {}
        decision = (
            supabase.table("allocator_decisions")
            .select("decision_id")
            .eq("tenant_id", tenant_id)
            .order("ts", desc=True)
            .limit(1)
            .execute()
        )
        decision_id = decision.data[0]["decision_id"] if decision.data else None

        for row in allocations.data:
            strat = strategy_map.get(row["strategy_id"], {})
            allocation_map[row["strategy_id"]] = {
                "allocation_pct": float(row.get("allocation_pct", 0)),
                "allocated_capital": float(row.get("allocated_capital", 0)),
                "risk_multiplier": float(row.get("risk_multiplier", 1)),
                "enabled": strat.get("enabled", True),
                "max_notional": float(strat.get("max_notional", 0)),
                "min_notional": float(strat.get("min_notional", 0)),
                "decision_id": decision_id,
            }
        return allocation_map

    def _data_quality_ok(self) -> bool:
        if any(count >= 3 for count in recon_service._mismatch_counts.values()):
            return False
        for venue in ["coinbase", "kraken", "bybit"]:
            quality = market_data_service.check_data_quality(venue)
            if quality.get("stale"):
                return False
        return True


capital_allocator_service = CapitalAllocatorService()
