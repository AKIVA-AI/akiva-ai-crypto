from uuid import uuid4

import pytest
from app.models.domain import Order, OrderSide, OrderStatus, TradeIntent
from app.models.opportunity import ExecutionLeg, ExecutionMode, ExecutionPlan
from app.services.arbitrage_engine import ArbitrageEngine
from app.services.execution_planner import ExecutionPlanner


@pytest.mark.asyncio
async def test_cross_venue_opportunity_generation():
    async def price_provider(venue, instrument):
        if venue == "venue_a":
            return {"bid": 100.0, "ask": 101.0, "mid": 100.5}
        if venue == "venue_b":
            return {"bid": 103.0, "ask": 104.0, "mid": 103.5}
        return None

    engine = ArbitrageEngine(price_provider=price_provider)
    opportunities = await engine.scan_cross_venue(
        instrument="BTC-USD",
        venues=["venue_a", "venue_b"],
        min_profit_bps=50,
    )

    assert opportunities
    assert opportunities[0].expected_edge_bps > 0
    assert opportunities[0].execution_plan is not None


@pytest.mark.asyncio
async def test_legged_execution_unwinds_on_failure(monkeypatch):
    class Adapter:
        def __init__(self, fail=False):
            self.fail = fail
            self.orders = []

        async def place_order(self, order: Order) -> Order:
            if self.fail:
                raise RuntimeError("leg failed")
            order.status = OrderStatus.FILLED
            order.filled_size = order.size
            self.orders.append(order)
            return order

    adapters = {
        "venue_a": Adapter(fail=False),
        "venue_b": Adapter(fail=True),
    }

    planner = ExecutionPlanner()
    intent = TradeIntent(
        id=uuid4(),
        book_id=uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-USD",
        direction=OrderSide.BUY,
        target_exposure_usd=1000,
        max_loss_usd=50,
        confidence=0.9,
    )

    plan = ExecutionPlan(
        mode=ExecutionMode.LEGGED,
        legs=[
            ExecutionLeg(
                venue="venue_a", instrument="BTC-USD", side=OrderSide.BUY, size=1.0
            ),
            ExecutionLeg(
                venue="venue_b", instrument="BTC-USD", side=OrderSide.SELL, size=1.0
            ),
        ],
        max_time_between_legs_ms=10_000,
        unwind_on_fail=True,
    )

    saved_orders = []

    async def save_order(order):
        saved_orders.append(order)

    async def noop_alert(*args, **kwargs):
        return None

    async def noop_audit(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.execution_planner.create_alert", noop_alert)
    monkeypatch.setattr("app.services.execution_planner.audit_log", noop_audit)

    orders = await planner.execute_plan(intent, plan, adapters, save_order)

    assert len(adapters["venue_a"].orders) == 2
    assert saved_orders
    assert orders == []
