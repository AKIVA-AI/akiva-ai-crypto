"""
Tests for exchange venue adapters (D7/D12/D14 testing).
Covers paper-mode simulation for all adapter implementations.
"""

from uuid import uuid4

import pytest
from app.adapters.coinbase_adapter import CoinbaseAdapter
from app.adapters.dex_adapter import DEXAdapter
from app.adapters.kraken_adapter import KrakenAdapter
from app.adapters.mexc_adapter import MEXCAdapter
from app.models.domain import Order, OrderSide, OrderStatus, VenueStatus


def _make_order(**kwargs) -> Order:
    """Create a test order with defaults."""
    defaults = {
        "book_id": uuid4(),
        "instrument": "BTC-USD",
        "side": OrderSide.BUY,
        "size": 0.1,
        "price": 50_000.0,
    }
    defaults.update(kwargs)
    return Order(**defaults)


class TestKrakenAdapter:
    @pytest.mark.asyncio
    async def test_connect_paper(self):
        adapter = KrakenAdapter()
        assert await adapter.connect() is True
        assert adapter._connected is True

    @pytest.mark.asyncio
    async def test_place_order_paper(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        order = _make_order()
        result = await adapter.place_order(order)
        assert result.status in (OrderStatus.FILLED, OrderStatus.OPEN)
        assert result.filled_price is not None
        assert result.venue_order_id is not None
        assert result.venue_order_id.startswith("kraken-paper-")

    @pytest.mark.asyncio
    async def test_cancel_order_paper(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        assert await adapter.cancel_order("test-order-id") is True

    @pytest.mark.asyncio
    async def test_get_balance_paper(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        balance = await adapter.get_balance()
        assert "USD" in balance
        assert "BTC" in balance

    @pytest.mark.asyncio
    async def test_get_positions_paper(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        positions = await adapter.get_positions()
        assert isinstance(positions, list)

    @pytest.mark.asyncio
    async def test_health_check_connected(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        health = await adapter.health_check()
        assert health.status == VenueStatus.HEALTHY
        assert health.name == "kraken"

    @pytest.mark.asyncio
    async def test_health_check_disconnected(self):
        adapter = KrakenAdapter()
        health = await adapter.health_check()
        assert health.status == VenueStatus.DOWN

    def test_nonce_monotonic(self):
        adapter = KrakenAdapter()
        n1 = adapter._get_nonce()
        n2 = adapter._get_nonce()
        assert n2 > n1

    def test_pair_map_exists(self):
        assert "BTC-USD" in KrakenAdapter.PAIR_MAP
        assert "ETH-USD" in KrakenAdapter.PAIR_MAP

    @pytest.mark.asyncio
    async def test_sell_order_slippage(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        order = _make_order(side=OrderSide.SELL)
        result = await adapter.place_order(order)
        assert result.filled_price is not None
        assert result.filled_price <= order.price * 1.01  # reasonable slippage

    @pytest.mark.asyncio
    async def test_disconnect(self):
        adapter = KrakenAdapter()
        await adapter.connect()
        await adapter.disconnect()
        assert adapter._connected is False


class TestCoinbaseAdapter:
    @pytest.mark.asyncio
    async def test_connect_paper(self):
        adapter = CoinbaseAdapter()
        assert await adapter.connect() is True

    @pytest.mark.asyncio
    async def test_place_order_paper(self):
        adapter = CoinbaseAdapter()
        await adapter.connect()
        order = _make_order()
        result = await adapter.place_order(order)
        assert result.status in (OrderStatus.FILLED, OrderStatus.OPEN)
        assert result.venue_order_id is not None

    @pytest.mark.asyncio
    async def test_get_balance(self):
        adapter = CoinbaseAdapter()
        await adapter.connect()
        balance = await adapter.get_balance()
        assert isinstance(balance, dict)
        assert len(balance) > 0

    @pytest.mark.asyncio
    async def test_health_check(self):
        adapter = CoinbaseAdapter()
        await adapter.connect()
        health = await adapter.health_check()
        assert health.name == "coinbase"


class TestMEXCAdapter:
    @pytest.mark.asyncio
    async def test_connect_paper(self):
        adapter = MEXCAdapter()
        assert await adapter.connect() is True

    @pytest.mark.asyncio
    async def test_place_order_paper(self):
        adapter = MEXCAdapter()
        await adapter.connect()
        order = _make_order()
        result = await adapter.place_order(order)
        assert result.status in (OrderStatus.FILLED, OrderStatus.OPEN)

    @pytest.mark.asyncio
    async def test_get_balance(self):
        adapter = MEXCAdapter()
        await adapter.connect()
        balance = await adapter.get_balance()
        assert isinstance(balance, dict)

    @pytest.mark.asyncio
    async def test_health_check(self):
        adapter = MEXCAdapter()
        await adapter.connect()
        health = await adapter.health_check()
        assert "mexc" in health.name


class TestDEXAdapter:
    @pytest.mark.asyncio
    async def test_connect_paper(self):
        adapter = DEXAdapter()
        assert await adapter.connect() is True

    @pytest.mark.asyncio
    async def test_place_order_paper(self):
        adapter = DEXAdapter()
        await adapter.connect()
        order = _make_order()
        result = await adapter.place_order(order)
        assert result.status in (OrderStatus.FILLED, OrderStatus.OPEN)

    @pytest.mark.asyncio
    async def test_get_balance(self):
        adapter = DEXAdapter()
        await adapter.connect()
        balance = await adapter.get_balance()
        assert isinstance(balance, dict)

    @pytest.mark.asyncio
    async def test_health_check(self):
        adapter = DEXAdapter()
        await adapter.connect()
        health = await adapter.health_check()
        assert "dex" in health.name
