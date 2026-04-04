from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from app.models.domain import Book, BookType, OrderSide, TradeIntent
from app.services.risk_engine import RiskEngine


@pytest.fixture
def risk_engine():
    return RiskEngine()


@pytest.fixture
def sample_intent():
    return TradeIntent(
        id=uuid4(),
        book_id=uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-USD",
        direction=OrderSide.BUY,
        target_exposure_usd=10_000,
        max_loss_usd=500,
        confidence=0.8,
        metadata={"strategy_type": "spot_arb", "tenant_id": str(uuid4())},
    )


@pytest.fixture
def sample_book():
    return Book(
        id=uuid4(),
        name="Test Book",
        type=BookType.PROP,
        capital_allocated=1_000_000,
        current_exposure=100_000,
        max_drawdown_limit=10,
        risk_tier=1,
        status="active",
    )


@pytest.mark.asyncio
async def test_get_daily_pnl_sums_realized_and_unrealized(
    monkeypatch, risk_engine, sample_book
):
    positions_result = SimpleNamespace(
        data=[
            {"unrealized_pnl": 100, "realized_pnl": -25},
            {"unrealized_pnl": 50, "realized_pnl": 10},
        ]
    )
    execute_chain = MagicMock(return_value=positions_result)
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute = execute_chain
    monkeypatch.setattr("app.services.risk_engine.get_supabase", lambda: supabase)

    pnl = await risk_engine._get_daily_pnl(sample_book.id)

    assert pnl == 135


@pytest.mark.asyncio
async def test_get_daily_pnl_returns_zero_on_supabase_error(
    monkeypatch, risk_engine, sample_book
):
    monkeypatch.setattr(
        "app.services.risk_engine.get_supabase",
        lambda: (_ for _ in ()).throw(RuntimeError("db unavailable")),
    )

    pnl = await risk_engine._get_daily_pnl(sample_book.id)

    assert pnl == 0.0


@pytest.mark.asyncio
async def test_spot_arb_limits_rejects_notional_and_open_intent_caps(
    monkeypatch, risk_engine, sample_intent
):
    over_limit_intent = sample_intent.model_copy(
        update={"target_exposure_usd": risk_engine.config.max_notional_per_arb + 1}
    )
    assert (
        await risk_engine._check_spot_arb_limits(over_limit_intent)
        == f"Spot arb notional exceeds limit {risk_engine.config.max_notional_per_arb}"
    )

    open_count = SimpleNamespace(count=risk_engine.config.max_open_arbs, data=[])
    total_notional = SimpleNamespace(data=[])
    execute_results = [open_count, total_notional]
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.side_effect = execute_results
    monkeypatch.setattr("app.services.risk_engine.get_supabase", lambda: supabase)

    assert (
        await risk_engine._check_spot_arb_limits(sample_intent)
        == "Max open arb intents reached"
    )


@pytest.mark.asyncio
async def test_spot_arb_limits_rejects_total_notional_and_db_errors(
    monkeypatch, risk_engine, sample_intent
):
    open_count = SimpleNamespace(count=1, data=[])
    total_notional = SimpleNamespace(
        data=[
            {"legs_json": {"notional_usd": risk_engine.config.max_total_arb_notional}},
            {"legs_json": {"notional_usd": 1}},
        ]
    )
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.side_effect = [
        open_count,
        total_notional,
    ]
    monkeypatch.setattr("app.services.risk_engine.get_supabase", lambda: supabase)

    assert (
        await risk_engine._check_spot_arb_limits(sample_intent)
        == "Total arb notional exceeds limit"
    )

    monkeypatch.setattr(
        "app.services.risk_engine.get_supabase",
        lambda: (_ for _ in ()).throw(RuntimeError("db unavailable")),
    )
    assert (
        await risk_engine._check_spot_arb_limits(sample_intent)
        == "Spot arb limit check failed"
    )


@pytest.mark.asyncio
async def test_activate_circuit_breaker_emits_alert_and_audit(monkeypatch, risk_engine):
    create_alert = AsyncMock()
    audit_log = AsyncMock()
    monkeypatch.setattr("app.services.risk_engine.create_alert", create_alert)
    monkeypatch.setattr("app.services.risk_engine.audit_log", audit_log)

    book_id = uuid4()
    await risk_engine.activate_circuit_breaker("latency", "Latency spike", book_id)
    await risk_engine.deactivate_circuit_breaker("latency")

    assert risk_engine._circuit_breakers["latency"] is False
    create_alert.assert_awaited_once()
    audit_log.assert_any_await(
        action="circuit_breaker_activated",
        resource_type="circuit_breaker",
        resource_id="latency",
        severity="critical",
        book_id=str(book_id),
        after_state={
            "active": True,
            "reason": "Latency spike",
            "prev_state": "closed",
            "new_state": "open",
        },
    )
    audit_log.assert_any_await(
        action="circuit_breaker_deactivated",
        resource_type="circuit_breaker",
        resource_id="latency",
        after_state={
            "active": False,
            "reason": "Manual deactivation",
            "prev_state": "open",
            "new_state": "closed",
        },
    )


@pytest.mark.asyncio
async def test_activate_kill_switch_updates_book_and_global_paths(
    monkeypatch, risk_engine, sample_book
):
    create_alert = AsyncMock()
    audit_log = AsyncMock()
    monkeypatch.setattr("app.services.risk_engine.create_alert", create_alert)
    monkeypatch.setattr("app.services.risk_engine.audit_log", audit_log)

    execute = MagicMock()
    update_chain = MagicMock()
    update_chain.eq.return_value.execute = execute
    table_chain = MagicMock()
    table_chain.update.return_value = update_chain

    supabase = MagicMock()
    supabase.table.return_value = table_chain
    monkeypatch.setattr("app.services.risk_engine.get_supabase", lambda: supabase)

    await risk_engine.activate_kill_switch(
        book_id=sample_book.id,
        user_id="operator-1",
        reason="Book breach",
    )
    await risk_engine.activate_kill_switch(
        user_id="operator-1",
        reason="Global breach",
    )

    assert risk_engine._circuit_breakers["global"] is True
    assert create_alert.await_count == 2
    audit_log.assert_any_await(
        action="kill_switch_activated",
        resource_type="kill_switch",
        resource_id=str(sample_book.id),
        user_id="operator-1",
        severity="critical",
        after_state={"active": True, "reason": "Book breach"},
    )
    audit_log.assert_any_await(
        action="kill_switch_activated",
        resource_type="kill_switch",
        resource_id="global",
        user_id="operator-1",
        severity="critical",
        after_state={"active": True, "reason": "Global breach"},
    )
