import sys
import types
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

for m in [
    "freqtrade",
    "freqtrade.optimize",
    "freqtrade.optimize.backtesting",
    "freqtrade.optimize.optimize_reports",
    "freqtrade.enums",
    "freqtrade.exchange",
    "freqtrade.exchange.exchange_ws",
    "freqtrade.freqai",
    "freqtrade.freqai.data_kitchen",
    "freqtrade.freqai.freqai_interface",
    "freqtrade.freqai.prediction_models",
    "freqtrade.freqai.prediction_models.XGBoostRegressor",
    "freqtrade.freqai.prediction_models.LightGBMRegressor",
    "freqtrade.freqai.prediction_models.TensorFlowRegressor",
    "freqtrade.freqai.prediction_models.PyTorchMLPRegressor",
    "freqtrade.configuration",
]:
    if m not in sys.modules:
        sys.modules[m] = types.ModuleType(m)
sys.modules["freqtrade.enums"].RunMode = MagicMock()
sys.modules["freqtrade.enums"].CandleType = MagicMock()
sys.modules["freqtrade.enums"].CandleType.SPOT = "spot"
sys.modules["freqtrade.exchange"].Exchange = MagicMock
sys.modules["freqtrade.exchange.exchange_ws"].ExchangeWS = MagicMock
sys.modules["freqtrade.freqai.data_kitchen"].FreqaiDataKitchen = MagicMock
sys.modules["freqtrade.freqai.freqai_interface"].IFreqaiModel = MagicMock
sys.modules["freqtrade.configuration"].TimeRange = MagicMock
sys.modules["freqtrade.optimize.backtesting"].Backtesting = MagicMock
import app.database as _db

_db.get_db_session = getattr(_db, "get_db_session", MagicMock())
import importlib

try:
    _am = importlib.import_module("app.models")
except:
    _am = types.ModuleType("app.models")
    sys.modules["app.models"] = _am
for a in ["BacktestResult", "MarketData", "OrderBook", "TickerData"]:
    if not hasattr(_am, a):
        setattr(_am, a, MagicMock())

from app.services.enhanced_market_data_service import EnhancedMarketDataService


@pytest.fixture
def service():
    with (
        patch.object(EnhancedMarketDataService, "_initialize_websocket_clients"),
        patch.object(EnhancedMarketDataService, "__init__", lambda self: None),
    ):
        svc = EnhancedMarketDataService.__new__(EnhancedMarketDataService)
        svc.websocket_clients = {}
        svc.exchange_configs = {}
        svc.executor = MagicMock()
        svc.data_callbacks = []
        svc.is_running = False
    return svc


class TestConfigs:
    def test_build(self, service):
        c = EnhancedMarketDataService._build_exchange_configs(service)
        assert "binance" in c and "coinbase" in c


class TestPairs:
    @pytest.mark.asyncio
    async def test_binance(self, service):
        assert "BTC/USDT" in await service._get_popular_pairs("binance")

    @pytest.mark.asyncio
    async def test_unknown(self, service):
        assert "BTC/USDT" in await service._get_popular_pairs("unknown")


class TestCallbacks:
    def test_add_remove(self, service):
        cb = MagicMock()
        service.add_data_callback(cb)
        assert cb in service.data_callbacks
        service.remove_data_callback(cb)
        assert cb not in service.data_callbacks


class TestHandlers:
    def test_ticker(self, service):
        with patch("asyncio.create_task"):
            service._handle_ticker_data(
                "binance", {"symbol": "BTC/USDT", "last": 50000}
            )

    def test_orderbook(self, service):
        with patch("asyncio.create_task"):
            service._handle_orderbook_data(
                "binance", "BTC/USDT", {"bids": [[50000, 1]], "asks": [[50001, 1]]}
            )

    def test_trade(self, service):
        with patch("asyncio.create_task"):
            service._handle_trade_data(
                "binance",
                "BTC/USDT",
                {
                    "timestamp": 1700000000000,
                    "price": 50000,
                    "amount": 0.5,
                    "side": "buy",
                    "id": "t1",
                },
            )


class TestConnectionStatus:
    def test_none(self, service):
        assert service.get_connection_status() == {}

    def test_with_client(self, service):
        service.websocket_clients = {"binance": MagicMock()}
        assert service.get_connection_status()["binance"]["connected"] is True

    def test_error(self, service):
        service.websocket_clients = {"binance": MagicMock()}
        with patch("app.services.enhanced_market_data_service.datetime") as md:
            md.now.side_effect = RuntimeError("err")
            assert service.get_connection_status()["binance"]["connected"] is False


class TestReconnect:
    @pytest.mark.asyncio
    async def test_unknown(self, service):
        assert await service.reconnect_exchange("unknown") is False

    @pytest.mark.asyncio
    async def test_ok(self, service):
        ws = MagicMock()
        ws.reset_connections = AsyncMock()
        service.websocket_clients = {"binance": ws}
        with patch.object(service, "_start_exchange_websocket", new_callable=AsyncMock):
            assert await service.reconnect_exchange("binance") is True

    @pytest.mark.asyncio
    async def test_fail(self, service):
        ws = MagicMock()
        ws.reset_connections = AsyncMock(side_effect=RuntimeError("x"))
        service.websocket_clients = {"binance": ws}
        assert await service.reconnect_exchange("binance") is False


class TestStreams:
    @pytest.mark.asyncio
    async def test_start_running(self, service):
        service.is_running = True
        await service.start_websocket_streams()
        assert service.is_running is True

    @pytest.mark.asyncio
    async def test_start(self, service):
        await service.start_websocket_streams()
        assert service.is_running is True

    @pytest.mark.asyncio
    async def test_stop_idle(self, service):
        await service.stop_websocket_streams()

    @pytest.mark.asyncio
    async def test_stop(self, service):
        ws = MagicMock()
        ws.cleanup = AsyncMock()
        service.websocket_clients = {"binance": ws}
        service.is_running = True
        await service.stop_websocket_streams()
        assert service.is_running is False


class TestPrice:
    @pytest.mark.asyncio
    async def test_ws(self, service):
        ws = MagicMock()
        ws.get_ticker = AsyncMock(return_value={"last": 50000})
        service.websocket_clients = {"binance": ws}
        assert await service.get_realtime_price("BTC/USDT", "binance") == 50000


class TestOrderbook:
    @pytest.mark.asyncio
    async def test_ws(self, service):
        ws = MagicMock()
        ws.get_orderbook = AsyncMock(return_value={"bids": [], "asks": []})
        service.websocket_clients = {"binance": ws}
        assert await service.get_orderbook_snapshot("BTC/USDT", "binance") == {
            "bids": [],
            "asks": [],
        }


class TestCleanup:
    def test_ok(self, service):
        service.executor = MagicMock()
        service.is_running = False
        service.cleanup()
        service.executor.shutdown.assert_called_once()

    def test_none(self, service):
        service.executor = None
        service.is_running = False
        service.cleanup()
