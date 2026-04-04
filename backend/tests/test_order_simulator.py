from datetime import datetime, timezone

from app.services.order_simulator import OrderSimulator


def test_market_order_fills():
    simulator = OrderSimulator(slippage_bps=5.0, fee_bps=10.0)
    order = simulator.submit_order(
        instrument="BTC-USD",
        side="buy",
        order_type="market",
        quantity=1.0,
    )

    simulator.process_order(
        order.id, market_price=100.0, timestamp=datetime.now(timezone.utc)
    )
    updated = simulator.get_order(order.id)

    assert updated is not None
    assert updated.status == "filled"
    assert updated.filled_quantity == 1.0
    assert updated.avg_fill_price > 100.0
    assert updated.fees > 0.0


def test_limit_order_no_fill():
    simulator = OrderSimulator(slippage_bps=0.0, fee_bps=0.0)
    order = simulator.submit_order(
        instrument="BTC-USD",
        side="buy",
        order_type="limit",
        quantity=1.0,
        limit_price=90.0,
    )

    simulator.process_order(order.id, market_price=100.0)
    updated = simulator.get_order(order.id)

    assert updated is not None
    assert updated.status == "new"
    assert updated.filled_quantity == 0.0


def test_stop_order_triggers():
    simulator = OrderSimulator(slippage_bps=0.0, fee_bps=0.0)
    order = simulator.submit_order(
        instrument="BTC-USD",
        side="buy",
        order_type="stop",
        quantity=1.0,
        stop_price=105.0,
    )

    simulator.process_order(order.id, market_price=106.0)
    updated = simulator.get_order(order.id)

    assert updated is not None
    assert updated.status == "filled"
    assert updated.avg_fill_price == 106.0


def test_partial_fill():
    simulator = OrderSimulator(slippage_bps=0.0, fee_bps=0.0)
    order = simulator.submit_order(
        instrument="BTC-USD",
        side="sell",
        order_type="market",
        quantity=10.0,
    )

    simulator.process_order(order.id, market_price=100.0, liquidity=4.0)
    updated = simulator.get_order(order.id)

    assert updated is not None
    assert updated.status == "partially_filled"
    assert updated.filled_quantity == 4.0
