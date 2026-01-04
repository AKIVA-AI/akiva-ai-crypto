import pytest
from uuid import uuid4

from app.models.domain import Order, OrderSide, OrderStatus, TradeIntent
from app.models.opportunity import ExecutionLeg, ExecutionPlan, ExecutionMode
from app.services.execution_planner import ExecutionPlanner


@pytest.mark.asyncio
async def test_spot_arb_unwind_on_failure(monkeypatch):
    """Test spot arbitrage unwind logic when one leg fails."""
    
    class Adapter:
        def __init__(self, fail=False):
            self.fail = fail
            self.orders = []

        async def place_order(self, order: Order) -> Order:
            # Always add the order to track it, even if it fails
            self.orders.append(order)
            if self.fail:
                order.status = OrderStatus.REJECTED
                raise RuntimeError("leg failed")
            order.status = OrderStatus.FILLED
            order.filled_size = order.size
            return order

    # Set up adapters for spot arb venues (matching working test pattern)
    adapters = {
        "venue_a": Adapter(fail=False),  # This should succeed and get unwind orders
        "venue_b": Adapter(fail=True),  # This will fail
    }

    # Create execution planner
    planner = ExecutionPlanner()
    
    # Create spot arb intent (matching working test pattern)
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

    # Create spot arb execution plan with unwind on failure (matching working test pattern)
    plan = ExecutionPlan(
        mode=ExecutionMode.LEGGED,
        legs=[
            ExecutionLeg(venue="venue_a", instrument="BTC-USD", side=OrderSide.BUY, size=1.0),
            ExecutionLeg(venue="venue_b", instrument="BTC-USD", side=OrderSide.SELL, size=1.0),
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

    # Mock alert and audit functions
    monkeypatch.setattr("app.services.execution_planner.create_alert", noop_alert)
    monkeypatch.setattr("app.services.execution_planner.audit_log", noop_audit)

    # Execute the plan - this should trigger unwind when coinbase fails
    orders = await planner.execute_plan(intent, plan, adapters, save_order)

    # Verify unwind behavior:
    # - venue_b should have 1 order (the failed one)
    # - venue_a should have 2 orders (original + unwind)
    assert len(adapters["venue_b"].orders) == 1
    assert len(adapters["venue_a"].orders) == 2
    assert saved_orders
    assert orders == []  # Execution should return empty list on failure
