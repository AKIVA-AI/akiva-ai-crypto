"""
Cross-Venue Spot Arbitrage Scanner.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import NAMESPACE_URL, uuid4, uuid5

import structlog

from app.config import settings
from app.database import get_supabase
from app.models.domain import Book, OrderSide, TradeIntent
from app.models.opportunity import ExecutionLeg, ExecutionMode, ExecutionPlan
from app.services.spot_arb_edge_model import SpotArbEdgeModel
from app.services.spot_quote_service import SpotQuote, spot_quote_service

logger = structlog.get_logger()


@dataclass
class SpotArbScannerConfig:
    strategy_name: str
    book_type: str
    venues: List[str]
    instruments: List[str]
    max_notional_usd: float
    min_size: float
    min_net_edge_bps: float
    max_spread_bps: float
    max_quote_age_ms: int
    execution_mode_preference: str
    inventory_buffer_pct: float


class SpotArbScanner:
    """Scan for cross-venue spot arbitrage opportunities."""

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or (settings.CONFIG_DIR / "spot_arbitrage.json")
        self.config = self._load_config()
        self.edge_model = SpotArbEdgeModel()
        self._inventory_cache: Dict[Tuple[str, str], float] = {}

    def _load_config(self) -> SpotArbScannerConfig:
        if not self.config_path.exists():
            raise FileNotFoundError(f"Missing spot arb config: {self.config_path}")
        with open(self.config_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return SpotArbScannerConfig(
            strategy_name=raw["strategy_name"],
            book_type=raw["book_type"],
            venues=raw["venues"],
            instruments=raw["instruments"],
            max_notional_usd=raw["max_notional_usd"],
            min_size=raw["min_size"],
            min_net_edge_bps=raw["min_net_edge_bps"],
            max_spread_bps=raw["max_spread_bps"],
            max_quote_age_ms=raw["max_quote_age_ms"],
            execution_mode_preference=raw["execution_mode_preference"],
            inventory_buffer_pct=raw["inventory_buffer_pct"],
        )

    async def generate_intents(self, books: List[Book]) -> List[TradeIntent]:
        tenant_id = settings.tenant_id
        if not tenant_id:
            logger.warning("spot_arb_missing_tenant")
            return []

        book = self._select_book(books)
        if not book:
            return []

        quotes = await spot_quote_service.get_quotes(
            self.config.venues, self.config.instruments
        )
        quote_map = self._group_quotes(quotes)
        intents: List[TradeIntent] = []

        for instrument, venue_quotes in quote_map.items():
            for buy_venue, buy_quote in venue_quotes.items():
                for sell_venue, sell_quote in venue_quotes.items():
                    if buy_venue == sell_venue:
                        continue
                    if buy_quote.ask_price <= 0 or sell_quote.bid_price <= 0:
                        continue
                    if buy_quote.spread_bps > self.config.max_spread_bps:
                        continue
                    if sell_quote.spread_bps > self.config.max_spread_bps:
                        continue
                    if buy_quote.age_ms > self.config.max_quote_age_ms:
                        continue
                    if sell_quote.age_ms > self.config.max_quote_age_ms:
                        continue

                    edge = self.edge_model.compute(
                        buy_ask=buy_quote.ask_price,
                        sell_bid=sell_quote.bid_price,
                    )
                    if edge.net_edge_bps < self.config.min_net_edge_bps:
                        continue

                    size = self._calculate_size(buy_quote.ask_price)
                    if size < self.config.min_size:
                        continue

                    execution_mode = self._determine_execution_mode(
                        tenant_id, sell_venue, instrument, size
                    )
                    latency_score = max(buy_quote.age_ms, sell_quote.age_ms)
                    liquidity_score = min(buy_quote.ask_size, sell_quote.bid_size)
                    plan = self._build_execution_plan(
                        buy_venue=buy_venue,
                        sell_venue=sell_venue,
                        instrument=instrument,
                        size=size,
                        execution_mode=execution_mode,
                    )

                    intent = TradeIntent(
                        id=uuid4(),
                        book_id=book.id,
                        strategy_id=uuid5(NAMESPACE_URL, self.config.strategy_name),
                        instrument=instrument,
                        direction=OrderSide.BUY,
                        target_exposure_usd=size * buy_quote.ask_price,
                        max_loss_usd=size * buy_quote.ask_price * 0.01,
                        horizon_minutes=5,
                        confidence=min(1.0, edge.net_edge_bps / 50.0),
                        metadata={
                            "tenant_id": tenant_id,
                            "strategy": self.config.strategy_name,
                            "strategy_type": "spot_arb",
                            "edge_inputs": edge.inputs.__dict__,
                            "net_edge_bps": edge.net_edge_bps,
                            "executable_spread_bps": edge.executable_spread_bps,
                            "latency_score": latency_score,
                            "liquidity_score": liquidity_score,
                            "execution_plan": plan.model_dump(),
                            "execution_mode": execution_mode,
                            "buy_venue": buy_venue,
                            "sell_venue": sell_venue,
                        },
                    )
                    intents.append(intent)
                    await self._store_spread(
                        tenant_id,
                        instrument,
                        buy_venue,
                        sell_venue,
                        edge,
                        buy_quote,
                        sell_quote,
                    )

        return intents

    def _select_book(self, books: List[Book]) -> Optional[Book]:
        for book in books:
            if (
                hasattr(book.type, "value")
                and book.type.value.lower() == self.config.book_type
            ) or (str(book.type).lower() == self.config.book_type):
                return book
        return books[0] if books else None

    def _group_quotes(self, quotes: List[SpotQuote]) -> Dict[str, Dict[str, SpotQuote]]:
        grouped: Dict[str, Dict[str, SpotQuote]] = {}
        for quote in quotes:
            grouped.setdefault(quote.instrument, {})[quote.venue] = quote
        return grouped

    def _calculate_size(self, price: float) -> float:
        if price <= 0:
            return 0.0
        return self.config.max_notional_usd / price

    def _determine_execution_mode(
        self, tenant_id: str, venue: str, instrument: str, size: float
    ) -> str:
        if self.config.execution_mode_preference != "inventory":
            return "legged"
        inventory = self._get_inventory(tenant_id, venue, instrument)
        buffer = size * (1 + self.config.inventory_buffer_pct)
        return "inventory" if inventory >= buffer else "legged"

    def _get_inventory(self, tenant_id: str, venue: str, instrument: str) -> float:
        cache_key = (venue, instrument)
        if cache_key in self._inventory_cache:
            return self._inventory_cache[cache_key]
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
                return 0.0
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
                return 0.0
            instrument_id = instrument_row.data["id"]
            inventory = (
                supabase.table("venue_inventory")
                .select("available_qty")
                .eq("tenant_id", tenant_id)
                .eq("venue_id", venue_id)
                .eq("instrument_id", instrument_id)
                .single()
                .execute()
            )
            if inventory.data:
                value = float(inventory.data.get("available_qty", 0))
                self._inventory_cache[cache_key] = value
                return value
        except Exception as exc:
            logger.warning("spot_arb_inventory_lookup_failed", error=str(exc))
        return 0.0

    def _build_execution_plan(
        self,
        buy_venue: str,
        sell_venue: str,
        instrument: str,
        size: float,
        execution_mode: str,
    ) -> ExecutionPlan:
        legs = [
            ExecutionLeg(
                venue=sell_venue,
                instrument=instrument,
                side=OrderSide.SELL,
                size=size,
                order_type="market",
                leg_type="spot",
            ),
            ExecutionLeg(
                venue=buy_venue,
                instrument=instrument,
                side=OrderSide.BUY,
                size=size,
                order_type="market",
                leg_type="spot",
            ),
        ]
        return ExecutionPlan(
            mode=ExecutionMode.LEGGED,
            legs=legs,
            metadata={"execution_mode": execution_mode, "leg_order": "sell_then_buy"},
        )

    async def _store_spread(
        self,
        tenant_id: str,
        instrument: str,
        buy_venue: str,
        sell_venue: str,
        edge,
        buy_quote: SpotQuote,
        sell_quote: SpotQuote,
    ) -> None:
        try:
            supabase = get_supabase()
            buy_venue_id = (
                supabase.table("venues")
                .select("id")
                .ilike("name", buy_venue)
                .single()
                .execute()
            )
            sell_venue_id = (
                supabase.table("venues")
                .select("id")
                .ilike("name", sell_venue)
                .single()
                .execute()
            )
            if not buy_venue_id.data or not sell_venue_id.data:
                return
            venue_id = buy_venue_id.data["id"]
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
                return
            instrument_id = instrument_row.data["id"]
            supabase.table("arb_spreads").insert(
                {
                    "tenant_id": tenant_id,
                    "instrument_id": instrument_id,
                    "buy_venue_id": buy_venue_id.data["id"],
                    "sell_venue_id": sell_venue_id.data["id"],
                    "executable_spread_bps": edge.executable_spread_bps,
                    "net_edge_bps": edge.net_edge_bps,
                    "liquidity_score": min(buy_quote.ask_size, sell_quote.bid_size),
                    "latency_score": max(buy_quote.age_ms, sell_quote.age_ms),
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.warning("arb_spread_store_failed", error=str(exc))


spot_arb_scanner = SpotArbScanner()
