"""
Basis Opportunity Scanner - builds multi-leg trade intents for cash-and-carry.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import structlog

from app.config import settings
from app.database import get_supabase
from app.models.basis import BasisHedgePolicy
from app.models.domain import Book, OrderSide, TradeIntent
from app.models.opportunity import ExecutionLeg, ExecutionMode, ExecutionPlan
from app.services.basis_edge_model import BasisEdgeModel
from app.services.basis_quote_service import BasisQuoteService

logger = structlog.get_logger()


@dataclass
class BasisScannerConfig:
    strategy_name: str
    book_type: str
    spot_venue: str
    deriv_venue: str
    instruments: List[str]
    open_threshold_bps: float
    close_threshold_bps: float
    min_expected_return_bps: float
    max_spread_bps: float
    min_volume_24h: float
    max_holding_minutes: int
    allow_reverse_carry: bool
    hedge_policy: BasisHedgePolicy


class BasisOpportunityScanner:
    """Scan for basis opportunities and emit multi-leg trade intents."""

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or (settings.CONFIG_DIR / "basis_arbitrage.json")
        self.config = self._load_config()
        self.edge_model = BasisEdgeModel()
        self.quote_service = BasisQuoteService()

    def _load_config(self) -> BasisScannerConfig:
        if not self.config_path.exists():
            raise FileNotFoundError(f"Missing basis config: {self.config_path}")
        with open(self.config_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        hedge_policy = BasisHedgePolicy(**raw.get("hedge_policy", {}))
        return BasisScannerConfig(
            strategy_name=raw["strategy_name"],
            book_type=raw["book_type"],
            spot_venue=raw["spot_venue"],
            deriv_venue=raw["deriv_venue"],
            instruments=raw["instruments"],
            open_threshold_bps=raw["open_threshold_bps"],
            close_threshold_bps=raw["close_threshold_bps"],
            min_expected_return_bps=raw["min_expected_return_bps"],
            max_spread_bps=raw["max_spread_bps"],
            min_volume_24h=raw["min_volume_24h"],
            max_holding_minutes=raw["max_holding_minutes"],
            allow_reverse_carry=raw.get("allow_reverse_carry", False),
            hedge_policy=hedge_policy,
        )

    async def generate_intents(self, books: List[Book]) -> List[TradeIntent]:
        tenant_id = settings.tenant_id
        if not tenant_id:
            logger.warning("basis_scanner_missing_tenant")
            return []

        book = next(
            (
                b
                for b in books
                if (
                    (hasattr(b.type, "value") and b.type.value == self.config.book_type)
                    or str(b.type).lower() == self.config.book_type
                )
            ),
            None,
        )
        if not book and books:
            book = books[0]
        if not book:
            return []

        strategy_id = uuid5(NAMESPACE_URL, self.config.strategy_name)
        quotes = await self.quote_service.build_quotes(
            instruments=self.config.instruments,
            spot_venue=self.config.spot_venue,
            deriv_venue=self.config.deriv_venue,
            tenant_id=tenant_id,
        )

        intents: List[TradeIntent] = []
        for quote in quotes:
            funding_bps = await self._get_funding_bps(
                tenant_id, quote.instrument, self.config.deriv_venue
            )
            if funding_bps is None:
                funding_bps = 0.0

            spread_bps = max(
                (quote.spot_ask - quote.spot_bid) / quote.spot_bid * 10000,
                (quote.perp_ask - quote.perp_bid) / quote.perp_bid * 10000,
            )
            if spread_bps > self.config.max_spread_bps:
                continue

            if quote.metadata.get("spot_mid", 0) <= 0:
                continue

            edge_result = self.edge_model.compute_expected_return(
                expected_funding_bps=funding_bps,
                basis_bps_mid=quote.basis_bps_mid,
            )

            if edge_result.expected_return_bps < self.config.min_expected_return_bps:
                continue

            intent = self._build_cash_and_carry_intent(
                book=book,
                strategy_id=strategy_id,
                quote=quote,
                edge_result=edge_result,
                tenant_id=tenant_id,
            )
            if intent:
                intents.append(intent)

            if self.config.allow_reverse_carry:
                reverse_intent = self._build_reverse_carry_intent(
                    book=book,
                    strategy_id=strategy_id,
                    quote=quote,
                    edge_result=edge_result,
                    tenant_id=tenant_id,
                )
                if reverse_intent:
                    intents.append(reverse_intent)

        return intents

    def _build_cash_and_carry_intent(
        self,
        book: Book,
        strategy_id: UUID,
        quote,
        edge_result,
        tenant_id: str,
    ) -> Optional[TradeIntent]:
        if quote.basis_bps_bid < self.config.open_threshold_bps:
            return None

        position_size = book.capital_allocated * 0.02
        max_loss = position_size * 0.02

        plan = ExecutionPlan(
            mode=ExecutionMode.LEGGED,
            legs=[
                ExecutionLeg(
                    venue=quote.deriv_venue,
                    instrument=quote.instrument,
                    side=OrderSide.SELL,
                    size=0.0,
                    order_type="market",
                    max_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
                    leg_type="derivative",
                ),
                ExecutionLeg(
                    venue=quote.spot_venue,
                    instrument=quote.instrument,
                    side=OrderSide.BUY,
                    size=0.0,
                    order_type="market",
                    max_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
                    leg_type="spot",
                ),
            ],
            max_leg_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
            max_time_between_legs_ms=self.config.hedge_policy.max_time_between_legs_ms,
            unwind_on_fail=self.config.hedge_policy.unwind_on_fail,
            metadata={"execution_style": "deriv_first"},
        )

        metadata = {
            "tenant_id": tenant_id,
            "strategy": self.config.strategy_name,
            "strategy_type": "basis",
            "expected_edge_bps": edge_result.expected_return_bps,
            "edge_inputs": edge_result.inputs.__dict__,
            "basis_bps": quote.basis_bps_bid,
            "basis_z": quote.basis_z,
            "funding_rate_bps": edge_result.inputs.expected_funding_bps,
            "execution_plan": plan.dict(),
            "hedge_policy": self.config.hedge_policy.__dict__,
        }

        return TradeIntent(
            id=uuid4(),
            book_id=book.id,
            strategy_id=strategy_id,
            instrument=quote.instrument,
            direction=OrderSide.BUY,
            target_exposure_usd=position_size,
            max_loss_usd=max_loss,
            horizon_minutes=self.config.max_holding_minutes,
            confidence=min(1.0, edge_result.expected_return_bps / 50.0),
            metadata=metadata,
        )

    def _build_reverse_carry_intent(
        self,
        book: Book,
        strategy_id: UUID,
        quote,
        edge_result,
        tenant_id: str,
    ) -> Optional[TradeIntent]:
        if quote.basis_bps_ask > -self.config.open_threshold_bps:
            return None

        position_size = book.capital_allocated * 0.01
        max_loss = position_size * 0.03

        plan = ExecutionPlan(
            mode=ExecutionMode.LEGGED,
            legs=[
                ExecutionLeg(
                    venue=quote.spot_venue,
                    instrument=quote.instrument,
                    side=OrderSide.SELL,
                    size=0.0,
                    order_type="market",
                    max_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
                    leg_type="spot",
                ),
                ExecutionLeg(
                    venue=quote.deriv_venue,
                    instrument=quote.instrument,
                    side=OrderSide.BUY,
                    size=0.0,
                    order_type="market",
                    max_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
                    leg_type="derivative",
                ),
            ],
            max_leg_slippage_bps=self.config.hedge_policy.max_leg_slippage_bps,
            max_time_between_legs_ms=self.config.hedge_policy.max_time_between_legs_ms,
            unwind_on_fail=self.config.hedge_policy.unwind_on_fail,
            metadata={"execution_style": "spot_first"},
        )

        metadata = {
            "tenant_id": tenant_id,
            "strategy": f"{self.config.strategy_name}_reverse",
            "strategy_type": "basis",
            "expected_edge_bps": edge_result.expected_return_bps,
            "edge_inputs": edge_result.inputs.__dict__,
            "basis_bps": quote.basis_bps_ask,
            "basis_z": quote.basis_z,
            "funding_rate_bps": edge_result.inputs.expected_funding_bps,
            "execution_plan": plan.dict(),
            "hedge_policy": self.config.hedge_policy.__dict__,
        }

        return TradeIntent(
            id=uuid4(),
            book_id=book.id,
            strategy_id=strategy_id,
            instrument=quote.instrument,
            direction=OrderSide.SELL,
            target_exposure_usd=position_size,
            max_loss_usd=max_loss,
            horizon_minutes=self.config.max_holding_minutes,
            confidence=min(1.0, edge_result.expected_return_bps / 50.0),
            metadata=metadata,
        )

    async def _get_funding_bps(
        self, tenant_id: str, instrument: str, venue: str
    ) -> Optional[float]:
        try:
            supabase = get_supabase()
            venue_row = (
                supabase.table("venues")
                .select("id")
                .ilike("name", venue)
                .single()
                .execute()
            )
            if not venue_row.data:
                return None
            venue_id = venue_row.data["id"]
            instrument_row = (
                supabase.table("instruments")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("venue_id", venue_id)
                .ilike("venue_symbol", instrument)
                .single()
                .execute()
            )
            if not instrument_row.data:
                return None
            instrument_id = instrument_row.data["id"]

            result = (
                supabase.table("funding_rates")
                .select("funding_rate")
                .eq("tenant_id", tenant_id)
                .eq("venue_id", venue_id)
                .eq("instrument_id", instrument_id)
                .order("funding_time", desc=True)
                .limit(1)
                .execute()
            )

            if result.data:
                return float(result.data[0]["funding_rate"]) * 10000
        except Exception as exc:
            logger.warning("funding_rate_fetch_failed", error=str(exc))
        return None


basis_opportunity_scanner = BasisOpportunityScanner()
