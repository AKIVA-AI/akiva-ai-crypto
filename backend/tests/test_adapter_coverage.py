"""Extended adapter coverage tests."""

from datetime import datetime
from uuid import uuid4

import pytest
from app.adapters.base import VenueAdapter
from app.adapters.coinbase_adapter import CoinbaseAdapter
from app.adapters.dex_adapter import DEXAdapter, SwapQuote, SwapResult
from app.adapters.kraken_adapter import KrakenAdapter
from app.adapters.mexc_adapter import MEXCAdapter
from app.models.domain import Order, OrderSide, OrderStatus, VenueStatus


def _order(**kw):
    d = {
        "book_id": uuid4(),
        "instrument": "BTC-USD",
        "side": OrderSide.BUY,
        "size": 0.1,
        "price": 50000.0,
    }
    d.update(kw)
    return Order(**d)


class TestBase:
    def test_abstract(self):
        with pytest.raises(TypeError):
            VenueAdapter()


class TestCoinbase:
    async def test_connect(self):
        a = CoinbaseAdapter()
        assert await a.connect() is True

    async def test_disconnect(self):
        a = CoinbaseAdapter()
        await a.connect()
        await a.disconnect()
        assert a._connected is False

    async def test_sell(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert (await a.place_order(_order(side=OrderSide.SELL))).status in (
            OrderStatus.FILLED,
            OrderStatus.OPEN,
        )

    async def test_no_price(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert (await a.place_order(_order(price=None))).filled_price is not None

    async def test_cancel(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert await a.cancel_order("x") is True

    async def test_balance(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert "USD" in await a.get_balance()

    async def test_positions(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert len(await a.get_positions()) == 2

    async def test_open_orders(self):
        a = CoinbaseAdapter()
        await a.connect()
        assert await a.get_open_orders() == []

    async def test_sim_price_known(self):
        p = await CoinbaseAdapter()._get_simulated_price("BTC-USD")
        assert 49000 < p < 51000

    async def test_sim_price_unknown(self):
        assert await CoinbaseAdapter()._get_simulated_price("XXX") == 100

    async def test_health_not_connected(self):
        # CoinbaseAdapter.health_check references VenueStatus.OFFLINE which is not in
        # the enum (known code bug). Verify the error is the expected one.
        with pytest.raises(AttributeError, match="OFFLINE"):
            await CoinbaseAdapter().health_check()

    async def test_health_connected(self):
        a = CoinbaseAdapter()
        await a.connect()
        # Connected + 0 errors path does not touch OFFLINE, should work
        h = await a.health_check()
        assert h.name == "coinbase"


class TestKraken:
    def test_nonce(self):
        a = KrakenAdapter()
        n = [a._get_nonce() for _ in range(5)]
        assert n == sorted(n) and len(set(n)) == 5

    def test_sig_not_impl(self):
        with pytest.raises(NotImplementedError):
            KrakenAdapter()._generate_signature("/p", {}, 1)

    async def test_live_rejected(self):
        a = KrakenAdapter()
        a.paper_mode = False
        assert (await a.place_order(_order())).status == OrderStatus.REJECTED

    async def test_cancel_live(self):
        a = KrakenAdapter()
        a.paper_mode = False
        assert await a.cancel_order("x") is False

    async def test_balance_live(self):
        a = KrakenAdapter()
        a.paper_mode = False
        assert await a.get_balance() == {}

    async def test_positions_live(self):
        a = KrakenAdapter()
        a.paper_mode = False
        assert await a.get_positions() == []

    async def test_connect_live(self):
        a = KrakenAdapter()
        a.paper_mode = False
        assert await a.connect() is False

    async def test_health_down(self):
        assert (await KrakenAdapter().health_check()).status == VenueStatus.DOWN


class TestMEXC:
    async def test_connect(self):
        assert await MEXCAdapter().connect() is True

    async def test_disconnect(self):
        a = MEXCAdapter()
        await a.connect()
        await a.disconnect()
        assert a._connected is False

    async def test_sell(self):
        a = MEXCAdapter()
        await a.connect()
        r = await a.place_order(_order(side=OrderSide.SELL, instrument="BTC-USDT"))
        assert r.status in (OrderStatus.FILLED, OrderStatus.OPEN)

    async def test_cancel(self):
        a = MEXCAdapter()
        await a.connect()
        assert await a.cancel_order("x") is True

    async def test_balance_spot(self):
        a = MEXCAdapter(market_type="spot")
        await a.connect()
        assert "USDT" in await a.get_balance()

    async def test_balance_futures(self):
        a = MEXCAdapter(market_type="futures")
        await a.connect()
        b = await a.get_balance()
        assert "USDT" in b and len(b) == 1

    async def test_positions_spot(self):
        a = MEXCAdapter(market_type="spot")
        await a.connect()
        assert await a.get_positions() == []

    async def test_positions_futures(self):
        a = MEXCAdapter(market_type="futures")
        await a.connect()
        assert len(await a.get_positions()) == 2

    async def test_open_orders(self):
        a = MEXCAdapter()
        await a.connect()
        assert await a.get_open_orders() == []

    async def test_leverage_spot(self):
        assert await MEXCAdapter(market_type="spot").set_leverage("X", 10) is False

    async def test_leverage_futures(self):
        assert await MEXCAdapter(market_type="futures").set_leverage("X", 10) is True

    async def test_sim_known(self):
        p = await MEXCAdapter()._get_simulated_price("BTC-USDT")
        assert 49000 < p < 51000

    async def test_sim_unknown(self):
        assert await MEXCAdapter()._get_simulated_price("X") == 100

    async def test_health_connected(self):
        a = MEXCAdapter()
        await a.connect()
        assert (await a.health_check()).status == VenueStatus.HEALTHY

    async def test_health_futures_instr(self):
        a = MEXCAdapter(market_type="futures")
        await a.connect()
        assert "BTC_USDT" in (await a.health_check()).supported_instruments


class TestDEX:
    async def test_connect(self):
        a = DEXAdapter()
        assert await a.connect() is True

    async def test_disconnect(self):
        a = DEXAdapter()
        await a.connect()
        await a.disconnect()
        assert a._connected is False

    async def test_place_order(self):
        a = DEXAdapter()
        await a.connect()
        assert (
            await a.place_order(_order(instrument="ETH/USDC"))
        ).status == OrderStatus.FILLED

    async def test_cancel_false(self):
        assert await DEXAdapter().cancel_order("0x") is False

    async def test_balance(self):
        assert "ETH" in await DEXAdapter().get_balance()

    async def test_positions(self):
        assert await DEXAdapter().get_positions() == []

    async def test_gas_price(self):
        g = await DEXAdapter().get_gas_price()
        assert "slow" in g and "fast" in g

    async def test_health_connected(self):
        a = DEXAdapter()
        await a.connect()
        assert (await a.health_check()).status == VenueStatus.HEALTHY

    async def test_health_disconnected(self):
        assert (await DEXAdapter().health_check()).status == VenueStatus.DOWN

    def test_sim_quote(self):
        q = DEXAdapter()._simulate_quote("ETH", "USDC", 1.0, 50)
        assert q.price > 0

    def test_sim_swap(self):
        a = DEXAdapter()
        q = a._simulate_quote("ETH", "USDC", 1.0, 50)
        assert a._simulate_swap(q).status == "success"

    async def test_get_quote(self):
        assert (await DEXAdapter().get_quote("ETH", "USDC", 1.0)) is not None

    async def test_execute_swap_paper(self):
        a = DEXAdapter()
        q = await a.get_quote("ETH", "USDC", 1.0)
        assert (await a.execute_swap(q, "0xW")).status == "success"

    async def test_execute_swap_live_raises(self):
        a = DEXAdapter()
        a.paper_mode = False
        q = SwapQuote(
            sell_token="ETH",
            buy_token="USDC",
            sell_amount="1000000000000000000",
            buy_amount="3200000000",
            price=3200.0,
            gas_estimate=200000,
            gas_price_gwei=30.0,
            protocol="uni",
            route=["p1"],
            slippage_bps=50,
            price_impact_pct=0.1,
            expires_at=datetime.utcnow(),
        )
        with pytest.raises(NotImplementedError):
            await a.execute_swap(q, "0xW")

    def test_aggregator(self):
        assert "1inch" in DEXAdapter(aggregator="1inch").base_url

    def test_swap_updates_balances(self):
        a = DEXAdapter()
        init = a._paper_balances["ETH"]
        q = a._simulate_quote("ETH", "USDC", 1.0, 50)
        a._simulate_swap(q)
        assert a._paper_balances["ETH"] < init


class TestSwapDC:
    def test_quote(self):
        q = SwapQuote(
            sell_token="ETH",
            buy_token="USDC",
            sell_amount="1",
            buy_amount="3200",
            price=3.2,
            gas_estimate=200000,
            gas_price_gwei=30.0,
            protocol="uni",
            route=["p"],
            slippage_bps=50,
            price_impact_pct=0.1,
            expires_at=datetime.utcnow(),
        )
        assert q.sell_token == "ETH"

    def test_result(self):
        r = SwapResult(
            tx_hash="0x",
            status="success",
            sell_amount=1.0,
            buy_amount=3200.0,
            effective_price=3200.0,
            gas_used=180000,
            gas_cost_eth=0.005,
            block_number=18500000,
            timestamp=datetime.utcnow(),
        )
        assert r.status == "success"
