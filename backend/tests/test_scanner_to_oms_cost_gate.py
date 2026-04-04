from uuid import uuid4

import pytest
from app.core.strategy_registry import (
    ScannerConfig,
    StrategyDefinition,
    StrategyTimeframes,
)
from app.models.domain import Book, BookType, OrderSide, RiskCheckResult, RiskDecision
from app.models.opportunity import SignalStack
from app.services.market_data import market_data_service
from app.services.oms_execution import oms_service
from app.services.opportunity_scanner import OpportunityScanner


class StubRegistry:
    def __init__(self, strategies, scanner_config):
        self._strategies = strategies
        self._scanner_config = scanner_config

    def get_enabled_strategies(self):
        return self._strategies

    @property
    def scanner_config(self):
        return self._scanner_config


@pytest.mark.asyncio
async def test_scanner_to_oms_rejects_on_cost_gate(monkeypatch):
    strategy = StrategyDefinition(
        name="test_spot_strategy",
        type="spot",
        enabled=True,
        universe=["BTC-USD"],
        timeframes=StrategyTimeframes(fast="1m", medium="5m", slow="1h"),
        min_confidence=0.1,
        max_risk_per_trade=0.01,
        expected_holding_minutes=30,
        venue_routing=["coinbase"],
        book_type="hedge",
    )
    registry = StubRegistry([strategy], ScannerConfig(top_k=1, max_opportunities=5))
    scanner = OpportunityScanner(registry=registry, market_data=market_data_service)

    async def fake_signal_stack(instrument, _strategy):
        return SignalStack(
            fast_timeframe="1m",
            medium_timeframe="5m",
            slow_timeframe="1h",
            fast_direction="bullish",
            medium_direction="bullish",
            slow_direction="bullish",
            confidence=0.2,
            expected_edge_bps=4,
            explanation="low edge stack",
        )

    monkeypatch.setattr(scanner, "_build_signal_stack", fake_signal_stack)

    book_id = uuid4()
    book = Book(
        id=book_id,
        name="Test Book",
        type=BookType.HEDGE,
        capital_allocated=100000,
        current_exposure=0,
        max_drawdown_limit=0.2,
        risk_tier=1,
        status="active",
    )

    intents = await scanner.generate_intents([book])
    assert intents

    async def allow_kill_switch():
        return True, "ok"

    async def fake_get_book(book_id):
        return book

    async def fake_check_intent(*args, **kwargs):
        return RiskCheckResult(
            decision=RiskDecision.APPROVE,
            intent_id=intents[0].id,
            original_intent=intents[0],
        )

    async def fake_positions(*args, **kwargs):
        return []

    async def fake_health(*args, **kwargs):
        return None

    async def noop_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "app.services.oms_execution.check_kill_switch_for_trading", allow_kill_switch
    )
    monkeypatch.setattr(
        "app.services.oms_execution.portfolio_engine.get_book", fake_get_book
    )
    monkeypatch.setattr(
        "app.services.oms_execution.risk_engine.check_intent", fake_check_intent
    )
    monkeypatch.setattr("app.services.oms_execution.audit_log", noop_audit)
    monkeypatch.setattr(oms_service, "_get_book_positions", fake_positions)
    monkeypatch.setattr(oms_service, "_get_venue_health", fake_health)

    market_data_service.update_price(
        venue="coinbase",
        instrument="BTC-USD",
        bid=100.0,
        ask=101.0,
        last=100.5,
        volume_24h=1000000,
    )

    order = await oms_service.execute_intent(intents[0], uuid4(), "coinbase")

    assert order is None
