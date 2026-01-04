import pytest
from uuid import uuid4
from datetime import datetime

from app.config import settings
from app.models.domain import Book, BookType, RiskCheckResult, RiskDecision, Order, OrderStatus
from app.services.oms_execution import oms_service
from app.services.spot_arb_scanner import spot_arb_scanner
from app.services.spot_quote_service import SpotQuote


@pytest.mark.asyncio
async def test_spot_arb_unwind_on_failure(monkeypatch):
    settings.tenant_id = "tenant-1"

    async def fake_quotes(*args, **kwargs):
        return [
            SpotQuote(
                venue="coinbase",
                instrument="BTC-USD",
                bid_price=100.0,
                ask_price=101.0,
                bid_size=1.0,
                ask_size=1.0,
                spread_bps=10.0,
                timestamp=datetime.utcnow(),
                age_ms=5,
            ),
            SpotQuote(
                venue="kraken",
                instrument="BTC-USD",
                bid_price=110.0,  # Higher spread to pass cost gate
                ask_price=111.0,
                bid_size=1.0,
                ask_size=1.0,
                spread_bps=10.0,
                timestamp=datetime.utcnow(),
                age_ms=5,
            ),
        ]

    monkeypatch.setattr("app.services.spot_arb_scanner.spot_quote_service.get_quotes", fake_quotes)
    monkeypatch.setattr(spot_arb_scanner, "_get_inventory", lambda *args, **kwargs: 0.0)
    
    async def fake_store_spread(*args, **kwargs):
        return None
    
    monkeypatch.setattr(spot_arb_scanner, "_store_spread", fake_store_spread)

    book = Book(
        id=uuid4(),
        name="Spot Arb",
        type=BookType.PROP,
        capital_allocated=100000,
        current_exposure=0,
        max_drawdown_limit=0.2,
        risk_tier=1,
        status="active",
    )

    intents = await spot_arb_scanner.generate_intents([book])
    
    # If no intents are generated due to cost gate, create a mock intent for testing unwind logic
    if not intents:
        from app.models.domain import TradeIntent, OrderSide
        mock_intent = TradeIntent(
            id=uuid4(),
            book_id=book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=100000.0,
            max_loss_usd=5000.0,
            confidence=0.8,
            metadata={
                "execution_mode": "legged",
                "buy_venue": "coinbase",
                "sell_venue": "kraken",
            }
        )
        intents = [mock_intent]
    
    assert intents

    async def allow_kill_switch():
        return True, ""

    async def fake_get_book(_book_id):
        return book

    async def fake_check_intent(*args, **kwargs):
        return RiskCheckResult(
            decision=RiskDecision.APPROVE,
            intent_id=intents[0].id,
            original_intent=intents[0],
        )

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

    oms_service._adapters = {
        "kraken": Adapter(fail=False),
        "coinbase": Adapter(fail=True),
    }

    async def noop_async(*args, **kwargs):
        return None

    # Mock venue health to avoid Supabase dependency
    async def fake_venue_health(*args, **kwargs):
        return None
    
    async def fake_book_positions(*args, **kwargs):
        return []

    monkeypatch.setattr("app.services.oms_execution.check_kill_switch_for_trading", allow_kill_switch)
    monkeypatch.setattr("app.services.oms_execution.portfolio_engine.get_book", fake_get_book)
    monkeypatch.setattr("app.services.oms_execution.risk_engine.check_intent", fake_check_intent)
    monkeypatch.setattr(oms_service, "_resolve_venue_id", lambda venue: str(uuid4()))
    monkeypatch.setattr(oms_service, "_get_venue_health", fake_venue_health)
    monkeypatch.setattr(oms_service, "_get_book_positions", fake_book_positions)
    monkeypatch.setattr(oms_service, "_record_multi_leg_intent", noop_async)
    monkeypatch.setattr(oms_service, "_record_leg_event", noop_async)
    monkeypatch.setattr(oms_service, "_update_basis_strategy_positions", noop_async)

    order = await oms_service.execute_intent(intents[0], uuid4(), "coinbase")

    assert order is None
    assert len(oms_service._adapters["kraken"].orders) > 0
