import sys
import types
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

# Only mock freqtrade if it's not actually installed
try:
    import freqtrade  # noqa: F401

    _FREQTRADE_AVAILABLE = True
except ImportError:
    _FREQTRADE_AVAILABLE = False

if not _FREQTRADE_AVAILABLE:
    _MOCK_MODULES = [
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
    ]
    for m in _MOCK_MODULES:
        if m not in sys.modules:
            sys.modules[m] = types.ModuleType(m)
    for m in _MOCK_MODULES:
        mod = sys.modules[m]
        if m == "freqtrade.optimize.backtesting" and not hasattr(mod, "Backtesting"):
            mod.Backtesting = MagicMock
        elif m == "freqtrade.optimize.optimize_reports" and not hasattr(
            mod, "generate_backtest_stats"
        ):
            mod.generate_backtest_stats = MagicMock(return_value={})
        elif m == "freqtrade.enums" and not hasattr(mod, "RunMode"):
            mod.RunMode = MagicMock()
            mod.RunMode.BACKTEST = "backtest"
            mod.CandleType = MagicMock()
            mod.CandleType.SPOT = "spot"
        elif m == "freqtrade.exchange" and not hasattr(mod, "Exchange"):
            mod.Exchange = MagicMock
        elif m == "freqtrade.exchange.exchange_ws" and not hasattr(mod, "ExchangeWS"):
            mod.ExchangeWS = MagicMock
        elif m == "freqtrade.freqai.data_kitchen" and not hasattr(
            mod, "FreqaiDataKitchen"
        ):
            mod.FreqaiDataKitchen = MagicMock
        elif m == "freqtrade.freqai.freqai_interface" and not hasattr(
            mod, "IFreqaiModel"
        ):
            mod.IFreqaiModel = MagicMock
        elif m == "freqtrade.configuration" and not hasattr(mod, "TimeRange"):
            mod.TimeRange = MagicMock
import app.database as _db

_db.get_db_session = getattr(_db, "get_db_session", MagicMock())
import importlib

try:
    _am = importlib.import_module("app.models")
except Exception:
    _am = types.ModuleType("app.models")
    sys.modules["app.models"] = _am
for a in ["BacktestResult", "MarketData", "OrderBook", "TickerData"]:
    if not hasattr(_am, a):
        setattr(_am, a, MagicMock())

from app.services.enhanced_backtesting_engine import EnhancedBacktestingEngine


@pytest.fixture
def engine():
    with patch.object(EnhancedBacktestingEngine, "_initialize_backtester"):
        return EnhancedBacktestingEngine(MagicMock())


class TestInit:
    def test_creates(self, engine):
        assert engine.market_data_service is not None

    def test_config(self, engine):
        assert engine.freqtrade_config["dry_run"] is True


class TestSharpe:
    def test_empty(self, engine):
        assert engine._calculate_sharpe_ratio({}) == 0.0

    def test_one(self, engine):
        assert (
            engine._calculate_sharpe_ratio({"results": [{"profit_ratio": 0.05}]}) == 0.0
        )

    def test_many(self, engine):
        assert (
            engine._calculate_sharpe_ratio(
                {"results": [{"profit_ratio": v} for v in [0.05, -0.02, 0.03, 0.01]]}
            )
            != 0.0
        )

    def test_zero_std(self, engine):
        assert (
            engine._calculate_sharpe_ratio({"results": [{"profit_ratio": 0.01}] * 3})
            == 0.0
        )

    def test_bad(self, engine):
        assert engine._calculate_sharpe_ratio({"results": [{"x": 1}, {"x": 2}]}) == 0.0


class TestSortino:
    def test_empty(self, engine):
        assert engine._calculate_sortino_ratio({}) == 0.0

    def test_all_pos(self, engine):
        assert (
            engine._calculate_sortino_ratio(
                {"results": [{"profit_ratio": 0.05}, {"profit_ratio": 0.02}]}
            )
            == 0.0
        )

    def test_mixed(self, engine):
        assert isinstance(
            engine._calculate_sortino_ratio(
                {"results": [{"profit_ratio": v} for v in [0.05, -0.02, 0.03, -0.01]]}
            ),
            float,
        )

    def test_bad(self, engine):
        assert engine._calculate_sortino_ratio({"results": "x"}) == 0.0


class TestCalmar:
    def test_empty(self, engine):
        assert engine._calculate_calmar_ratio({}) == 0.0

    def test_zero(self, engine):
        assert engine._calculate_calmar_ratio({"results": [], "max_drawdown": 0}) == 0.0

    def test_valid(self, engine):
        assert (
            engine._calculate_calmar_ratio(
                {
                    "results": [],
                    "max_drawdown": 0.10,
                    "profit_total": 0.20,
                    "date_start": datetime(2024, 1, 1),
                    "date_stop": datetime(2024, 7, 1),
                }
            )
            > 0
        )

    def test_bad(self, engine):
        assert (
            engine._calculate_calmar_ratio({"results": [], "max_drawdown": "x"}) == 0.0
        )


class TestMonthly:
    def test_empty(self, engine):
        assert engine._calculate_monthly_returns({}) == {}

    def test_valid(self, engine):
        assert "2024-01" in engine._calculate_monthly_returns(
            {"results": [{"profit_ratio": 0.05, "close_date": "2024-01-15 10:00:00"}]}
        )

    def test_bad(self, engine):
        assert (
            engine._calculate_monthly_returns(
                {"results": [{"profit_ratio": 0, "close_date": "bad"}]}
            )
            == {}
        )


class TestDrawdowns:
    def test_empty(self, engine):
        assert engine._analyze_drawdowns({}) == {}

    def test_rising(self, engine):
        assert (
            engine._analyze_drawdowns(
                {"results": [{"profit_ratio": 0.01}, {"profit_ratio": 0.02}]}
            )["max_drawdown"]
            == 0
        )

    def test_bad(self, engine):
        assert engine._analyze_drawdowns({"results": "x"}) == {}


class TestTrades:
    def test_empty(self, engine):
        assert engine._analyze_trades({}) == {}

    def test_mixed(self, engine):
        assert (
            engine._analyze_trades(
                {
                    "results": [
                        {"profit_ratio": 0.05, "trade_duration": 60},
                        {"profit_ratio": -0.02, "trade_duration": 30},
                    ]
                }
            )["profitable_trades"]
            == 1
        )

    def test_bad(self, engine):
        assert engine._analyze_trades({"results": "x"}) == {}


class TestWalkForward:
    def test_empty(self, engine):
        assert engine._analyze_walk_forward_results([]) == {}

    def test_valid(self, engine):
        assert (
            engine._analyze_walk_forward_results(
                [
                    {
                        "result": {
                            "profit_total": 0.10,
                            "win_rate": 0.6,
                            "max_drawdown": 0.05,
                            "sharpe_ratio": 1.5,
                        }
                    }
                ]
            )["total_periods"]
            == 1
        )

    def test_none(self, engine):
        assert engine._analyze_walk_forward_results(None) == {}


class TestConsistency:
    def test_single(self, engine):
        assert engine._calculate_consistency([0.5]) == 0.0

    def test_empty(self, engine):
        assert engine._calculate_consistency([]) == 0.0

    def test_perfect(self, engine):
        assert engine._calculate_consistency([0.5, 0.5, 0.5]) == 1.0


class TestCleanup:
    def test_ok(self, engine):
        engine.executor = MagicMock()
        engine.thread_executor = MagicMock()
        engine.cleanup()
        engine.executor.shutdown.assert_called_once()

    def test_none(self, engine):
        engine.executor = None
        engine.thread_executor = None
        engine.cleanup()
