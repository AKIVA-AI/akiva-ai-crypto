"""
Opportunity Scanner - multi-timeframe screening for spot, futures, and arbitrage.
"""

from __future__ import annotations

from typing import Dict, List, Optional
from uuid import uuid4

import structlog

from app.core.strategy_registry import StrategyDefinition, strategy_registry
from app.models.domain import Book, OrderSide, TradeIntent
from app.models.opportunity import Opportunity, OpportunityType, SignalStack
from app.services.arbitrage_engine import ArbitrageEngine
from app.services.enhanced_signal_engine import enhanced_signal_engine
from app.services.market_data import market_data_service

logger = structlog.get_logger()


class OpportunityScanner:
    """Generate ranked opportunities and convert to trade intents."""

    def __init__(
        self,
        registry=strategy_registry,
        market_data=market_data_service,
        arbitrage_engine: Optional[ArbitrageEngine] = None,
    ):
        self.registry = registry
        self.market_data = market_data
        self.arbitrage_engine = arbitrage_engine or ArbitrageEngine(
            price_provider=self._price_provider
        )

    async def scan(self, books: List[Book]) -> List[Opportunity]:
        opportunities: List[Opportunity] = []
        strategies = self.registry.get_enabled_strategies()

        for strategy in strategies:
            if strategy.type in ("spot", "futures"):
                opportunities.extend(await self._scan_directional(strategy))
            elif strategy.type == "arbitrage":
                opportunities.extend(await self._scan_arbitrage(strategy))

        opportunities.sort(key=self._score_opportunity, reverse=True)
        max_opps = self.registry.scanner_config.max_opportunities
        return opportunities[:max_opps]

    async def generate_intents(self, books: List[Book]) -> List[TradeIntent]:
        opportunities = await self.scan(books)
        top_k = self.registry.scanner_config.top_k
        intents: List[TradeIntent] = []

        for opportunity in opportunities[:top_k]:
            strategy = self._find_strategy_for_opportunity(opportunity)
            if not strategy:
                continue
            book = self._select_book(strategy, books)
            if not book:
                continue
            intent = self._convert_opportunity_to_intent(opportunity, strategy, book)
            intents.append(intent)

        return intents

    async def _scan_directional(
        self, strategy: StrategyDefinition
    ) -> List[Opportunity]:
        opportunities: List[Opportunity] = []
        for instrument in strategy.universe:
            stack = await self._build_signal_stack(instrument, strategy)
            if not stack:
                continue
            if stack.confidence < strategy.min_confidence:
                continue
            if (
                strategy.min_edge_bps
                and stack.expected_edge_bps < strategy.min_edge_bps
            ):
                continue

            snapshot = await self.market_data.get_price(
                strategy.venue_routing[0] if strategy.venue_routing else "coinbase",
                instrument,
            )
            data_quality = (
                snapshot.get("data_quality", "derived") if snapshot else "unavailable"
            )

            direction = (
                OrderSide.BUY if stack.fast_direction == "bullish" else OrderSide.SELL
            )
            opportunities.append(
                Opportunity(
                    type=OpportunityType.FUTURES
                    if strategy.type == "futures"
                    else OpportunityType.SPOT,
                    instrument=instrument,
                    direction=direction,
                    venue=(
                        strategy.venue_routing[0]
                        if strategy.venue_routing
                        else "coinbase"
                    ),
                    confidence=stack.confidence,
                    expected_edge_bps=stack.expected_edge_bps,
                    horizon_minutes=strategy.expected_holding_minutes,
                    data_quality=data_quality,
                    signal_stack=stack,
                    explanation=stack.explanation,
                    metadata={
                        "strategy": strategy.name,
                        "strategy_type": strategy.type,
                        "timeframes": stack.model_dump(),
                    },
                )
            )

        return opportunities

    async def _scan_arbitrage(self, strategy: StrategyDefinition) -> List[Opportunity]:
        opportunities: List[Opportunity] = []
        venues = strategy.venue_routing or ["coinbase"]

        for instrument in strategy.universe:
            if "|" in instrument:
                spot, perp = instrument.split("|", 1)
                opps = await self.arbitrage_engine.scan_basis(
                    spot_instrument=spot,
                    perp_instrument=perp,
                    venues=venues,
                    min_profit_bps=strategy.min_edge_bps or 8.0,
                )
                for opp in opps:
                    opp.metadata.setdefault("strategy", strategy.name)
                    opp.metadata.setdefault("strategy_type", strategy.type)
                opportunities.extend(opps)
            else:
                opps = await self.arbitrage_engine.scan_cross_venue(
                    instrument=instrument,
                    venues=venues,
                    min_profit_bps=strategy.min_edge_bps or 5.0,
                )
                for opp in opps:
                    opp.metadata.setdefault("strategy", strategy.name)
                    opp.metadata.setdefault("strategy_type", strategy.type)
                opportunities.extend(opps)

        return opportunities

    async def _build_signal_stack(
        self,
        instrument: str,
        strategy: StrategyDefinition,
    ) -> Optional[SignalStack]:
        if not strategy.timeframes:
            return None

        fast = await enhanced_signal_engine.fetch_market_data(
            instrument, timeframe=strategy.timeframes.fast, limit=50
        )
        medium = await enhanced_signal_engine.fetch_market_data(
            instrument, timeframe=strategy.timeframes.medium, limit=80
        )
        slow = await enhanced_signal_engine.fetch_market_data(
            instrument, timeframe=strategy.timeframes.slow, limit=120
        )

        if fast is None or medium is None or slow is None:
            return None

        fast_signal = self._trend_signal(fast)
        medium_signal = self._trend_signal(medium)
        slow_signal = self._trend_signal(slow)

        directions = {
            fast_signal["direction"],
            medium_signal["direction"],
            slow_signal["direction"],
        }
        if "neutral" in directions or len(directions) > 1:
            return None

        confidence = min(
            1.0,
            (
                fast_signal["confidence"]
                + medium_signal["confidence"]
                + slow_signal["confidence"]
            )
            / 3,
        )
        expected_edge_bps = (
            fast_signal["strength_bps"]
            + medium_signal["strength_bps"]
            + slow_signal["strength_bps"]
        ) / 3

        return SignalStack(
            fast_timeframe=strategy.timeframes.fast,
            medium_timeframe=strategy.timeframes.medium,
            slow_timeframe=strategy.timeframes.slow,
            fast_direction=fast_signal["direction"],
            medium_direction=medium_signal["direction"],
            slow_direction=slow_signal["direction"],
            confidence=confidence,
            expected_edge_bps=expected_edge_bps,
            explanation=f"Aligned trend across {strategy.timeframes.fast}/{strategy.timeframes.medium}/{strategy.timeframes.slow}",
        )

    def _trend_signal(self, df) -> Dict:
        closes = df["close"].values
        if len(closes) < 10:
            return {"direction": "neutral", "confidence": 0.0, "strength_bps": 0.0}
        current = closes[-1]
        sma = closes[-10:].mean()
        delta = (current - sma) / sma
        strength_bps = abs(delta) * 10000
        if abs(delta) < 0.0005:
            return {
                "direction": "neutral",
                "confidence": 0.0,
                "strength_bps": strength_bps,
            }
        direction = "bullish" if delta > 0 else "bearish"
        confidence = min(1.0, abs(delta) * 200)
        return {
            "direction": direction,
            "confidence": confidence,
            "strength_bps": strength_bps,
        }

    async def _price_provider(self, venue: str, instrument: str) -> Optional[Dict]:
        return await self.market_data.get_price(venue, instrument)

    def _score_opportunity(self, opportunity: Opportunity) -> float:
        return opportunity.expected_edge_bps * opportunity.confidence

    def _find_strategy_for_opportunity(
        self, opportunity: Opportunity
    ) -> Optional[StrategyDefinition]:
        strategies = self.registry.get_enabled_strategies()
        for strategy in strategies:
            if strategy.name == opportunity.metadata.get("strategy"):
                return strategy
            if strategy.type == opportunity.type.value:
                return strategy
        return strategies[0] if strategies else None

    def _select_book(
        self, strategy: StrategyDefinition, books: List[Book]
    ) -> Optional[Book]:
        if strategy.book_id:
            return next((b for b in books if b.id == strategy.book_id), None)
        if strategy.book_type:
            return next(
                (
                    b
                    for b in books
                    if (
                        (
                            hasattr(b.type, "value")
                            and b.type.value == strategy.book_type
                        )
                        or str(b.type).lower() == strategy.book_type
                    )
                ),
                None,
            )
        return books[0] if books else None

    def _convert_opportunity_to_intent(
        self,
        opportunity: Opportunity,
        strategy: StrategyDefinition,
        book: Book,
    ) -> TradeIntent:
        position_size = book.capital_allocated * strategy.max_risk_per_trade
        max_loss = position_size * 0.02

        metadata = {
            "opportunity_id": str(opportunity.id),
            "strategy": strategy.name,
            "strategy_type": strategy.type,
            "expected_edge_bps": opportunity.expected_edge_bps,
            "data_quality": opportunity.data_quality,
            "explanation": opportunity.explanation,
        }
        if opportunity.signal_stack:
            metadata["signal_stack"] = opportunity.signal_stack.model_dump()
        if opportunity.execution_plan:
            metadata["execution_plan"] = opportunity.execution_plan.model_dump()

        return TradeIntent(
            id=uuid4(),
            book_id=book.id,
            strategy_id=strategy.id,
            instrument=opportunity.instrument,
            direction=opportunity.direction,
            target_exposure_usd=position_size,
            max_loss_usd=max_loss,
            horizon_minutes=opportunity.horizon_minutes,
            confidence=opportunity.confidence,
            metadata=metadata,
        )


opportunity_scanner = OpportunityScanner()
