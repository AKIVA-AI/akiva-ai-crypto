import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pandas as pd
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
        if m == "freqtrade.enums" and not hasattr(mod, "RunMode"):
            mod.RunMode = MagicMock()
            mod.CandleType = MagicMock()
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
        elif m == "freqtrade.optimize.backtesting" and not hasattr(mod, "Backtesting"):
            mod.Backtesting = MagicMock
        elif m == "freqtrade.optimize.optimize_reports" and not hasattr(
            mod, "generate_backtest_stats"
        ):
            mod.generate_backtest_stats = MagicMock(return_value={})
        elif m == "freqtrade.exchange" and not hasattr(mod, "Exchange"):
            mod.Exchange = MagicMock
        elif m == "freqtrade.exchange.exchange_ws" and not hasattr(mod, "ExchangeWS"):
            mod.ExchangeWS = MagicMock
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

from app.services.enhanced_quantitative_engine import (
    FreqAIEnhancedEngine,
    _load_prediction_model,
)


@pytest.fixture
def engine():
    with patch.object(FreqAIEnhancedEngine, "_initialize_freqai"):
        eng = FreqAIEnhancedEngine(MagicMock())
        eng.models = {"mock": MagicMock()}
        eng.active_model = eng.models["mock"]
        eng.data_kitchen = MagicMock()
        eng.data_kitchen.feature_list = ["rsi", "macd", "vol"]
    return eng


class TestLoadModel:
    def test_bad(self):
        assert _load_prediction_model("X", "X") is None


class TestInit:
    def test_creates(self, engine):
        assert engine.market_data_service is not None

    def test_config(self, engine):
        assert engine.freqai_config["freqai"]["enabled"] is True


class TestPredict:
    def test_no_model(self, engine):
        engine.active_model = None
        assert engine.predict_signals(pd.DataFrame(), "BTC/USDT") == {}

    def test_no_kitchen(self, engine):
        engine.data_kitchen = None
        assert engine.predict_signals(pd.DataFrame(), "BTC/USDT") == {}

    def test_exception(self, engine):
        engine.active_model.predict = MagicMock(side_effect=RuntimeError("x"))
        with patch.object(
            engine,
            "_convert_to_freqtrade_format",
            return_value=pd.DataFrame({"close": [100]}),
        ):
            assert engine.predict_signals(pd.DataFrame(), "BTC/USDT") == {}


class TestConvertPredictions:
    def test_empty(self, engine):
        assert (
            engine._convert_predictions_to_signals(pd.DataFrame(), np.array([]))[
                "hold_signal"
            ]
            is True
        )

    def test_long(self, engine):
        assert (
            engine._convert_predictions_to_signals(
                pd.DataFrame({"p": [0.05]}), np.array([True])
            )["long_signal"]
            is True
        )

    def test_short(self, engine):
        assert (
            engine._convert_predictions_to_signals(
                pd.DataFrame({"p": [-0.05]}), np.array([True])
            )["short_signal"]
            is True
        )

    def test_hold(self, engine):
        assert (
            engine._convert_predictions_to_signals(
                pd.DataFrame({"p": [0.005]}), np.array([True])
            )["hold_signal"]
            is True
        )


class TestConfidence:
    def test_empty(self, engine):
        assert engine._calculate_prediction_confidence(pd.DataFrame()) == 0.0

    def test_consistent(self, engine):
        assert (
            engine._calculate_prediction_confidence(pd.DataFrame({"p": [0.05] * 20}))
            > 0.9
        )


class TestFeatureImportance:
    def test_no_attr(self, engine):
        engine.active_model = MagicMock(spec=[])
        assert engine._get_feature_importance() == {}

    def test_none_model(self, engine):
        engine.active_model.model = None
        assert engine._get_feature_importance() == {}

    def test_exists(self, engine):
        engine.active_model.model = MagicMock()
        assert "rsi" in engine._get_feature_importance()


class TestConvertFormat:
    def test_basic(self, engine):
        df = pd.DataFrame(
            {
                "date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
                "open": [100, 101, 102],
                "high": [105, 106, 107],
                "low": [95, 96, 97],
                "close": [102, 103, 104],
                "volume_base": [1000, 1100, 1200],
            }
        )
        r = engine._convert_to_freqtrade_format(df, "BTC/USDT")
        assert "volume" in r.columns and "&-target" in r.columns


class TestMetrics:
    def test_basic(self, engine):
        assert "mock" in engine.get_model_performance_metrics()["available_models"]

    def test_no_model(self, engine):
        engine.active_model = None
        assert engine.get_model_performance_metrics()["active_model"] is None

    def test_no_kitchen(self, engine):
        engine.data_kitchen = None
        assert engine.get_model_performance_metrics()["feature_count"] == 0


class TestCleanup:
    def test_ok(self, engine):
        engine.executor = MagicMock()
        engine.active_model = MagicMock()
        engine.cleanup()
        engine.executor.shutdown.assert_called_once()

    def test_none(self, engine):
        engine.executor = None
        engine.active_model = None
        engine.cleanup()
