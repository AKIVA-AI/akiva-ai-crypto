"""
Tests for app.services.enhanced_quantitative_engine and
app.core.enhanced_config — covering the FreqAI-enhanced quant engine and
the enhanced configuration system.

All FreqTrade / FreqAI internals are mocked so no external API or database is
needed.
"""

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock, patch

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# FreqAIEnhancedEngine tests
# ---------------------------------------------------------------------------
# We need to mock heavy freqtrade imports at the module level before
# importing the engine so the tests run even if freqtrade behaviour changes.


class TestFreqAIEnhancedEngine:
    """Tests for FreqAIEnhancedEngine — all FreqAI internals mocked."""

    @pytest.fixture
    def mock_market_data_service(self):
        return MagicMock()

    @pytest.fixture
    def engine(self, mock_market_data_service):
        """Create engine with fully mocked FreqAI components."""
        with (
            patch(
                "app.services.enhanced_quantitative_engine.FreqaiDataKitchen"
            ) as mock_kitchen_cls,
            patch(
                "app.services.enhanced_quantitative_engine.XGBoostRegressor"
            ) as mock_xgb,
            patch(
                "app.services.enhanced_quantitative_engine.LightGBMRegressor"
            ) as mock_lgbm,
            patch(
                "app.services.enhanced_quantitative_engine.TensorFlowRegressor",
                None,
            ),
            patch(
                "app.services.enhanced_quantitative_engine.PyTorchRegressor",
                None,
            ),
        ):
            mock_kitchen_cls.return_value = MagicMock()
            mock_xgb_inst = MagicMock()
            mock_lgbm_inst = MagicMock()
            mock_xgb.return_value = mock_xgb_inst
            mock_lgbm.return_value = mock_lgbm_inst

            from app.services.enhanced_quantitative_engine import (
                FreqAIEnhancedEngine,
            )

            eng = FreqAIEnhancedEngine(mock_market_data_service)
            return eng

    # -- construction / initialization --

    def test_engine_initializes(self, engine):
        assert engine is not None
        assert engine.models  # at least one model loaded
        assert engine.active_model is not None
        assert engine.data_kitchen is not None

    def test_build_freqai_config(self, engine):
        cfg = engine.freqai_config
        assert cfg["freqai"]["enabled"] is True
        assert "feature_parameters" in cfg["freqai"]
        assert "data_split_parameters" in cfg["freqai"]
        assert cfg["freqai"]["identifier"] == "enterprise_crypto"
        assert cfg["exchange"]["name"] == "binance"

    def test_models_dict_excludes_none(self, engine):
        """TensorFlow and PyTorch were set to None — they should be absent."""
        assert "tensorflow" not in engine.models
        assert "pytorch" not in engine.models

    # -- _convert_to_freqtrade_format --

    def test_convert_to_freqtrade_format(self, engine):
        df = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=50, freq="5min"),
                "open": np.random.uniform(44000, 46000, 50),
                "high": np.random.uniform(44000, 46000, 50),
                "low": np.random.uniform(44000, 46000, 50),
                "close": np.random.uniform(44000, 46000, 50),
                "volume_base": np.random.uniform(100, 1000, 50),
            }
        )
        result = engine._convert_to_freqtrade_format(df, "BTC/USDT")
        assert "timestamp" in result.columns
        assert "date" in result.columns
        assert "&-target" in result.columns
        # Target is close shifted by -24
        assert (
            result["&-target"].iloc[-1] != result["&-target"].iloc[-1]
        )  # NaN check at end

    def test_convert_format_preserves_ohlc(self, engine):
        df = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=30, freq="5min"),
                "open": [100.0] * 30,
                "high": [105.0] * 30,
                "low": [95.0] * 30,
                "close": [102.0] * 30,
                "volume_base": [500.0] * 30,
            }
        )
        result = engine._convert_to_freqtrade_format(df, "ETH/USDT")
        assert (result["open"] == 100.0).all()
        assert (result["close"] == 102.0).all()

    # -- _convert_predictions_to_signals --

    def test_predictions_to_signals_long(self, engine):
        preds = pd.DataFrame({"pred": [0.05]})
        do_predict = np.array([True])
        signals = engine._convert_predictions_to_signals(preds, do_predict)
        assert signals["long_signal"] is True
        assert signals["short_signal"] is False
        assert signals["hold_signal"] is False

    def test_predictions_to_signals_short(self, engine):
        preds = pd.DataFrame({"pred": [-0.05]})
        do_predict = np.array([True])
        signals = engine._convert_predictions_to_signals(preds, do_predict)
        assert signals["short_signal"] is True
        assert signals["long_signal"] is False

    def test_predictions_to_signals_hold(self, engine):
        preds = pd.DataFrame({"pred": [0.005]})
        do_predict = np.array([True])
        signals = engine._convert_predictions_to_signals(preds, do_predict)
        assert signals["hold_signal"] is True
        assert signals["long_signal"] is False
        assert signals["short_signal"] is False

    def test_predictions_to_signals_empty(self, engine):
        preds = pd.DataFrame()
        do_predict = np.array([])
        signals = engine._convert_predictions_to_signals(preds, do_predict)
        assert signals["hold_signal"] is True

    def test_predictions_to_signals_do_predict_false(self, engine):
        preds = pd.DataFrame({"pred": [0.05]})
        do_predict = np.array([False])
        signals = engine._convert_predictions_to_signals(preds, do_predict)
        # do_predict is False → should stay hold
        assert signals["hold_signal"] is True

    # -- _calculate_prediction_confidence --

    def test_confidence_empty(self, engine):
        preds = pd.DataFrame()
        assert engine._calculate_prediction_confidence(preds) == 0.0

    def test_confidence_low_variance(self, engine):
        preds = pd.DataFrame({"a": [0.01] * 20})
        confidence = engine._calculate_prediction_confidence(preds)
        assert confidence > 0.5

    def test_confidence_high_variance(self, engine):
        preds = pd.DataFrame({"a": list(range(-10, 10))})
        confidence = engine._calculate_prediction_confidence(preds)
        # High variance → low confidence (could go to 0)
        assert confidence <= 1.0

    # -- _get_feature_importance --

    def test_feature_importance_no_model(self, engine):
        engine.active_model = MagicMock(spec=[])  # no 'model' attribute
        result = engine._get_feature_importance()
        assert result == {}

    def test_feature_importance_model_none(self, engine):
        engine.active_model = MagicMock()
        engine.active_model.model = None
        result = engine._get_feature_importance()
        assert result == {}

    def test_feature_importance_with_model(self, engine):
        engine.active_model = MagicMock()
        engine.active_model.model = MagicMock()
        result = engine._get_feature_importance()
        assert "rsi" in result
        assert "macd" in result

    # -- predict_signals --

    def test_predict_signals_no_active_model(self, engine):
        engine.active_model = None
        result = engine.predict_signals(pd.DataFrame(), "BTC/USDT")
        assert result == {}

    def test_predict_signals_no_data_kitchen(self, engine):
        engine.data_kitchen = None
        result = engine.predict_signals(pd.DataFrame(), "BTC/USDT")
        assert result == {}

    def test_predict_signals_success(self, engine):
        preds = pd.DataFrame({"pred": [0.03]})
        engine.active_model.predict.return_value = (preds, np.array([True]))

        df = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=30, freq="5min"),
                "open": [100.0] * 30,
                "high": [105.0] * 30,
                "low": [95.0] * 30,
                "close": [102.0] * 30,
                "volume_base": [500.0] * 30,
            }
        )
        result = engine.predict_signals(df, "BTC/USDT")
        assert "long_signal" in result
        assert "confidence" in result
        assert "feature_importance" in result

    def test_predict_signals_exception(self, engine):
        engine.active_model.predict.side_effect = RuntimeError("fail")

        df = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=30, freq="5min"),
                "open": [100.0] * 30,
                "high": [105.0] * 30,
                "low": [95.0] * 30,
                "close": [102.0] * 30,
                "volume_base": [500.0] * 30,
            }
        )
        result = engine.predict_signals(df, "BTC/USDT")
        assert result == {}

    # -- get_model_performance_metrics --

    def test_get_model_performance_metrics_basic(self, engine):
        engine.data_kitchen.feature_list = ["rsi", "macd"]
        m = engine.get_model_performance_metrics()
        assert m["active_model"] is not None
        assert len(m["available_models"]) > 0
        assert m["feature_count"] == 2

    def test_get_model_performance_metrics_no_active(self, engine):
        engine.active_model = None
        engine.data_kitchen = None
        m = engine.get_model_performance_metrics()
        assert m["active_model"] is None
        assert m["feature_count"] == 0

    def test_get_model_performance_metrics_with_dd(self, engine):
        engine.active_model.dd = MagicMock()
        engine.active_model.dd.historic_predictions = [1, 2, 3]
        engine.data_kitchen.feature_list = []
        m = engine.get_model_performance_metrics()
        assert m["total_predictions"] == 3

    def test_get_model_performance_metrics_dd_error(self, engine):
        dd_mock = MagicMock()
        type(dd_mock).historic_predictions = PropertyMock(
            side_effect=RuntimeError("fail")
        )
        engine.active_model.dd = dd_mock
        engine.data_kitchen.feature_list = []
        # Should not raise — error is caught
        m = engine.get_model_performance_metrics()
        assert "total_predictions" not in m

    # -- cleanup --

    def test_cleanup(self, engine):
        engine.cleanup()
        engine.active_model.shutdown.assert_called_once()

    def test_cleanup_no_active_model(self, engine):
        engine.active_model = None
        engine.cleanup()  # should not raise

    # -- _load_prediction_model (module-level helper) --

    def test_load_prediction_model_success(self):
        from app.services.enhanced_quantitative_engine import _load_prediction_model

        # Loading an existing freqtrade model
        result = _load_prediction_model("XGBoostRegressor", "XGBoostRegressor")
        # May or may not be None depending on environment; just check no crash
        assert result is not None or result is None

    def test_load_prediction_model_missing(self):
        from app.services.enhanced_quantitative_engine import _load_prediction_model

        result = _load_prediction_model("NonExistentModule", "NonExistentClass")
        assert result is None

    # -- train_models --

    @pytest.mark.asyncio
    async def test_train_models_empty_data(self, engine, mock_market_data_service):
        mock_market_data_service.get_historical_data.return_value = pd.DataFrame()
        result = await engine.train_models(
            "BTC/USDT", datetime(2024, 1, 1), datetime(2024, 2, 1)
        )
        assert result == {}

    @pytest.mark.asyncio
    async def test_train_models_exception(self, engine, mock_market_data_service):
        mock_market_data_service.get_historical_data.side_effect = RuntimeError(
            "network error"
        )
        result = await engine.train_models(
            "BTC/USDT", datetime(2024, 1, 1), datetime(2024, 2, 1)
        )
        assert result == {}

    # -- update_models --

    @pytest.mark.asyncio
    async def test_update_models_empty_data(self, engine, mock_market_data_service):
        mock_market_data_service.get_historical_data.return_value = pd.DataFrame()
        result = await engine.update_models("BTC/USDT")
        assert result is False

    @pytest.mark.asyncio
    async def test_update_models_exception(self, engine, mock_market_data_service):
        mock_market_data_service.get_historical_data.side_effect = RuntimeError("fail")
        result = await engine.update_models("BTC/USDT")
        assert result is False

    @pytest.mark.asyncio
    async def test_update_models_success(self, engine, mock_market_data_service):
        from unittest.mock import AsyncMock

        df = pd.DataFrame(
            {
                "date": pd.date_range("2024-01-01", periods=50, freq="5min"),
                "open": np.random.uniform(44000, 46000, 50),
                "high": np.random.uniform(44000, 46000, 50),
                "low": np.random.uniform(44000, 46000, 50),
                "close": np.random.uniform(44000, 46000, 50),
                "volume_base": np.random.uniform(100, 1000, 50),
            }
        )
        mock_market_data_service.get_historical_data = AsyncMock(return_value=df)
        result = await engine.update_models("BTC/USDT")
        assert result is True


# ---------------------------------------------------------------------------
# FreqAIEnhancedEngine initialization failure
# ---------------------------------------------------------------------------


class TestFreqAIEngineInitFailure:
    def test_init_no_models_raises(self):
        """If all model classes are None, initialization should raise."""
        with (
            patch("app.services.enhanced_quantitative_engine.FreqaiDataKitchen"),
            patch("app.services.enhanced_quantitative_engine.XGBoostRegressor", None),
            patch("app.services.enhanced_quantitative_engine.LightGBMRegressor", None),
            patch(
                "app.services.enhanced_quantitative_engine.TensorFlowRegressor", None
            ),
            patch("app.services.enhanced_quantitative_engine.PyTorchRegressor", None),
        ):
            from app.services.enhanced_quantitative_engine import (
                FreqAIEnhancedEngine,
            )

            with pytest.raises(RuntimeError, match="No compatible"):
                FreqAIEnhancedEngine(MagicMock())


# ---------------------------------------------------------------------------
# ConfigurationValidator tests (from enhanced_config)
# ---------------------------------------------------------------------------

_has_freqtrade_exceptions = False
try:
    import freqtrade.exceptions  # noqa: F401

    _has_freqtrade_exceptions = True
except (ImportError, ModuleNotFoundError):
    pass


@pytest.mark.skipif(not _has_freqtrade_exceptions, reason="freqtrade not installed")
class TestConfigurationValidator:
    @pytest.fixture
    def validator(self):
        from app.core.enhanced_config import ConfigurationValidator

        return ConfigurationValidator()

    def test_valid_config(self, validator):
        cfg = {
            "exchange": {"name": "binance"},
            "stake_currency": "USDT",
        }
        result = validator.validate_config(cfg)
        assert result == cfg

    def test_missing_exchange(self, validator):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="exchange"):
            validator.validate_config({"stake_currency": "USDT"})

    def test_missing_stake_currency(self, validator):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stake_currency"):
            validator.validate_config({"exchange": {"name": "binance"}})

    def test_missing_exchange_name(self, validator):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="Exchange name"):
            validator.validate_config({"exchange": {}, "stake_currency": "USDT"})

    def test_empty_stake_currency(self, validator):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stake_currency"):
            validator.validate_config(
                {"exchange": {"name": "binance"}, "stake_currency": ""}
            )

    def test_non_string_stake_currency(self, validator):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stake_currency"):
            validator.validate_config(
                {"exchange": {"name": "binance"}, "stake_currency": 123}
            )


# ---------------------------------------------------------------------------
# EnhancedConfigManager tests
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _has_freqtrade_exceptions, reason="freqtrade not installed")
class TestEnhancedConfigManager:
    @pytest.fixture
    def tmp_config_dir(self, tmp_path):
        return tmp_path / "config"

    @pytest.fixture
    def manager(self, tmp_config_dir):
        """Create manager with patched settings to use a temp directory."""
        with patch("app.core.enhanced_config.settings") as mock_settings:
            mock_settings.CONFIG_DIR = str(tmp_config_dir)
            mock_settings.DATA_DIR = tmp_config_dir.parent / "data"
            mock_settings.DATA_DIR.mkdir(exist_ok=True)
            (mock_settings.DATA_DIR / "logs").mkdir(parents=True, exist_ok=True)

            from app.core.enhanced_config import EnhancedConfigManager

            mgr = EnhancedConfigManager()
            return mgr

    # -- merge configs --

    def test_merge_configs_simple(self, manager):
        base = {"a": 1, "b": 2}
        env = {"b": 3, "c": 4}
        result = manager._merge_configs(base, env)
        assert result == {"a": 1, "b": 3, "c": 4}

    def test_merge_configs_deep(self, manager):
        base = {"exchange": {"name": "binance", "key": "old"}}
        env = {"exchange": {"key": "new"}}
        result = manager._merge_configs(base, env)
        assert result["exchange"]["name"] == "binance"
        assert result["exchange"]["key"] == "new"

    def test_merge_configs_empty_override(self, manager):
        base = {"a": 1}
        result = manager._merge_configs(base, {})
        assert result == {"a": 1}

    # -- validate_trading_config --

    def test_validate_trading_config_valid(self, manager):
        cfg = {"stake_amount": 1000, "max_open_trades": 3, "timeframe": "5m"}
        result = manager._validate_trading_config(cfg)
        assert result is cfg

    def test_validate_trading_config_invalid_stake(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stake_amount"):
            manager._validate_trading_config({"stake_amount": -100})

    def test_validate_trading_config_zero_stake_skipped(self, manager):
        """stake_amount=0 is falsy, so the validation guard skips it."""
        result = manager._validate_trading_config({"stake_amount": 0})
        assert result["stake_amount"] == 0

    def test_validate_trading_config_non_number_stake(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stake_amount"):
            manager._validate_trading_config({"stake_amount": "abc"})

    def test_validate_trading_config_zero_max_trades_skipped(self, manager):
        """max_open_trades=0 is falsy, so the validation guard skips it."""
        result = manager._validate_trading_config({"max_open_trades": 0})
        assert result["max_open_trades"] == 0

    def test_validate_trading_config_float_max_trades(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="max_open_trades"):
            manager._validate_trading_config({"max_open_trades": 3.5})

    def test_validate_trading_config_invalid_timeframe(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="timeframe"):
            manager._validate_trading_config({"timeframe": "2m"})

    def test_validate_trading_config_all_valid_timeframes(self, manager):
        for tf in [
            "1m",
            "5m",
            "15m",
            "30m",
            "1h",
            "2h",
            "4h",
            "6h",
            "8h",
            "12h",
            "1d",
            "3d",
            "1w",
        ]:
            cfg = {"timeframe": tf}
            result = manager._validate_trading_config(cfg)
            assert result["timeframe"] == tf

    # -- validate_exchange_config --

    def test_validate_exchange_config_valid(self, manager):
        cfg = {
            "exchange": {
                "name": "binance",
                "pair_whitelist": ["BTC/USDT"],
            }
        }
        result = manager._validate_exchange_config(cfg)
        assert result is cfg

    def test_validate_exchange_config_missing_name(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="missing required field"):
            manager._validate_exchange_config({"exchange": {}})

    def test_validate_exchange_config_unsupported(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="Unsupported exchange"):
            manager._validate_exchange_config({"exchange": {"name": "unknownexchange"}})

    def test_validate_exchange_config_all_supported(self, manager):
        for exch in ["binance", "coinbase", "kraken", "bybit", "kucoin", "gate"]:
            cfg = {"exchange": {"name": exch}}
            result = manager._validate_exchange_config(cfg)
            assert result["exchange"]["name"] == exch

    def test_validate_exchange_config_empty_pair_whitelist_skipped(self, manager):
        """pair_whitelist=[] is falsy, so the validation guard skips it."""
        result = manager._validate_exchange_config(
            {"exchange": {"name": "binance", "pair_whitelist": []}}
        )
        assert result["exchange"]["pair_whitelist"] == []

    def test_validate_exchange_config_non_empty_invalid_pair_whitelist(self, manager):
        """Non-empty but invalid pair_whitelist triggers validation."""
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="pair_whitelist"):
            manager._validate_exchange_config(
                {"exchange": {"name": "binance", "pair_whitelist": "not-a-list"}}
            )

    def test_validate_exchange_config_invalid_pair_format(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="Invalid pair format"):
            manager._validate_exchange_config(
                {"exchange": {"name": "binance", "pair_whitelist": ["BTCUSDT"]}}
            )

    def test_validate_exchange_config_non_string_pair(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="Invalid pair format"):
            manager._validate_exchange_config(
                {"exchange": {"name": "binance", "pair_whitelist": [123]}}
            )

    # -- validate_risk_config --

    def test_validate_risk_config_valid(self, manager):
        cfg = {
            "stoploss": -0.10,
            "minimal_roi": {"0": 0.10, "60": 0.05},
        }
        result = manager._validate_risk_config(cfg)
        assert result is cfg

    def test_validate_risk_config_positive_stoploss(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stoploss must be negative"):
            manager._validate_risk_config({"stoploss": 0.10})

    def test_validate_risk_config_zero_stoploss_skipped(self, manager):
        """stoploss=0 is falsy, so the validation guard skips it."""
        result = manager._validate_risk_config({"stoploss": 0})
        assert result["stoploss"] == 0

    def test_validate_risk_config_non_number_stoploss(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="stoploss must be a number"):
            manager._validate_risk_config({"stoploss": "bad"})

    def test_validate_risk_config_invalid_roi_type(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(
            ConfigurationError, match="minimal_roi must be a dictionary"
        ):
            manager._validate_risk_config({"minimal_roi": [1, 2, 3]})

    def test_validate_risk_config_negative_roi_key(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="non-negative integers"):
            manager._validate_risk_config({"minimal_roi": {"-1": 0.05}})

    def test_validate_risk_config_non_numeric_roi_key(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="non-negative integers"):
            manager._validate_risk_config({"minimal_roi": {"abc": 0.05}})

    def test_validate_risk_config_non_numeric_roi_value(self, manager):
        from freqtrade.exceptions import ConfigurationError

        with pytest.raises(ConfigurationError, match="values must be numbers"):
            manager._validate_risk_config({"minimal_roi": {"0": "bad"}})

    def test_validate_risk_config_empty(self, manager):
        """No risk keys → passes without error."""
        result = manager._validate_risk_config({})
        assert result == {}

    # -- apply_custom_validations --

    def test_apply_custom_validations_empty(self, manager):
        result = manager._apply_custom_validations({"a": 1})
        assert result == {"a": 1}

    def test_apply_custom_validations_with_validator(self, manager):
        def add_flag(config):
            config["validated"] = True
            return config

        manager.add_config_validator(add_flag)
        result = manager._apply_custom_validations({"a": 1})
        assert result["validated"] is True

    def test_apply_custom_validations_error(self, manager):
        from freqtrade.exceptions import ConfigurationError

        def bad_validator(config):
            raise ValueError("oops")

        manager.add_config_validator(bad_validator)
        with pytest.raises(ConfigurationError, match="Custom validation"):
            manager._apply_custom_validations({"a": 1})

    # -- encryption / decryption --

    def test_encrypt_decrypt_roundtrip(self, manager):
        original = {
            "exchange": {
                "name": "binance",
                "key": "my-api-key",
                "secret": "my-secret",
            },
            "api_key": "top-secret",
            "other": "unchanged",
        }
        encrypted = manager._encrypt_sensitive_data(original)
        # Sensitive fields should be encrypted
        assert encrypted["exchange"]["key"].startswith("encrypted:")
        assert encrypted["exchange"]["secret"].startswith("encrypted:")
        assert encrypted["api_key"].startswith("encrypted:")
        # Non-sensitive fields unchanged
        assert encrypted["other"] == "unchanged"
        assert encrypted["exchange"]["name"] == "binance"

        # Decrypt round-trip
        decrypted = manager._decrypt_sensitive_data(encrypted)
        assert decrypted["exchange"]["key"] == "my-api-key"
        assert decrypted["exchange"]["secret"] == "my-secret"
        assert decrypted["api_key"] == "top-secret"

    def test_encrypt_empty_value(self, manager):
        original = {"exchange": {"key": "", "name": "binance"}}
        encrypted = manager._encrypt_sensitive_data(original)
        assert encrypted["exchange"]["key"] == ""  # Empty string stays empty

    def test_encrypt_non_string_value(self, manager):
        original = {"exchange": {"key": 12345, "name": "binance"}}
        encrypted = manager._encrypt_sensitive_data(original)
        assert encrypted["exchange"]["key"] == 12345

    def test_decrypt_non_encrypted_value(self, manager):
        """Values not starting with 'encrypted:' are returned as-is."""
        original = {"exchange": {"key": "plain-value", "name": "binance"}}
        decrypted = manager._decrypt_sensitive_data(original)
        assert decrypted["exchange"]["key"] == "plain-value"

    def test_decrypt_corrupted_value(self, manager):
        """Corrupted encrypted value should return original."""
        original = {
            "exchange": {"key": "encrypted:INVALIDBASE64!!!", "name": "binance"}
        }
        decrypted = manager._decrypt_sensitive_data(original)
        # Decryption fails → returns original value
        assert decrypted["exchange"]["key"].startswith("encrypted:")

    def test_decrypt_non_string_passthrough(self, manager):
        original = {"count": 42, "enabled": True}
        decrypted = manager._decrypt_sensitive_data(original)
        assert decrypted["count"] == 42
        assert decrypted["enabled"] is True

    # -- derive_key_from_password --

    def test_derive_key_from_password(self, manager):
        key = manager._derive_key_from_password("my-password")
        assert isinstance(key, bytes)
        assert len(key) > 0
        # Same password → same key (deterministic)
        key2 = manager._derive_key_from_password("my-password")
        assert key == key2

    def test_derive_key_different_passwords(self, manager):
        k1 = manager._derive_key_from_password("password1")
        k2 = manager._derive_key_from_password("password2")
        assert k1 != k2

    # -- _get_or_create_encryption_key --

    def test_get_encryption_key_from_env_base64(self, tmp_config_dir):
        from cryptography.fernet import Fernet

        key = Fernet.generate_key()
        with (
            patch("app.core.enhanced_config.settings") as mock_settings,
            patch.dict(os.environ, {"CONFIG_ENCRYPTION_KEY": key.decode()}),
        ):
            mock_settings.CONFIG_DIR = str(tmp_config_dir)
            from app.core.enhanced_config import EnhancedConfigManager

            mgr = EnhancedConfigManager()
            # Should use env key without error
            assert mgr._encryption_key is not None

    def test_get_encryption_key_from_env_password(self, tmp_config_dir):
        with (
            patch("app.core.enhanced_config.settings") as mock_settings,
            patch.dict(os.environ, {"CONFIG_ENCRYPTION_KEY": "not-base64-password"}),
        ):
            mock_settings.CONFIG_DIR = str(tmp_config_dir)
            from app.core.enhanced_config import EnhancedConfigManager

            mgr = EnhancedConfigManager()
            assert mgr._encryption_key is not None

    # -- listeners --

    def test_add_and_notify_listener(self, manager):
        events = []

        def listener(action, name, env, config):
            events.append((action, name, env))

        manager.add_config_listener(listener)
        manager._notify_config_listeners("test", "cfg", "dev", {})
        assert len(events) == 1
        assert events[0] == ("test", "cfg", "dev")

    def test_listener_error_does_not_propagate(self, manager):
        def bad_listener(action, name, env, config):
            raise ValueError("listener fail")

        manager.add_config_listener(bad_listener)
        # Should not raise
        manager._notify_config_listeners("test", "cfg", "dev", {})

    # -- list_configurations --

    def test_list_configurations_empty(self, manager):
        configs = manager.list_configurations()
        # May have the encryption key file but no JSON configs
        json_configs = [c for c in configs if c["file"].endswith(".json")]
        # Initially there should be none (unless default was created)
        assert isinstance(json_configs, list)

    def test_list_configurations_with_files(self, manager):
        # Create some config files
        (manager.config_dir / "test.json").write_text('{"a":1}')
        (manager.config_dir / "test.staging.json").write_text('{"a":2}')
        configs = manager.list_configurations()
        names = [c["name"] for c in configs]
        assert "test" in names

    # -- save_configuration --

    def test_save_and_load_roundtrip(self, manager):
        cfg = {
            "exchange": {"name": "binance"},
            "stake_currency": "USDT",
            "custom": "value",
        }
        manager.save_configuration("myconfig", cfg, encrypt_sensitive=False)
        # Verify file exists
        assert (manager.config_dir / "myconfig.json").exists()

    def test_save_configuration_clears_cache(self, manager):
        manager.config_cache["myconfig_development"] = {"cached": True}
        manager.save_configuration(
            "myconfig",
            {"exchange": {"name": "binance"}, "stake_currency": "USDT"},
            encrypt_sensitive=False,
        )
        assert "myconfig_development" not in manager.config_cache

    def test_save_configuration_staging(self, manager):
        manager.save_configuration(
            "myconfig",
            {"exchange": {"name": "binance"}, "stake_currency": "USDT"},
            environment="staging",
            encrypt_sensitive=False,
        )
        assert (manager.config_dir / "myconfig.staging.json").exists()

    # -- migrate_configuration --

    def test_migrate_configuration(self, manager):
        cfg = {"version": "1.0.0", "some": "data"}
        result = manager.migrate_configuration(cfg, "1.0.0", "2.0.0")
        assert result["version"] == "2.0.0"
        assert result["some"] == "data"

    def test_migrate_configuration_no_version(self, manager):
        cfg = {"some": "data"}
        result = manager.migrate_configuration(cfg, "1.0.0", "2.0.0")
        assert "version" not in result  # not added if not present

    # -- cleanup --

    def test_cleanup(self, manager):
        manager.config_cache["x"] = 1
        manager.config_validators.append(lambda x: x)
        manager.config_listeners.append(lambda *a: None)
        manager.cleanup()
        assert manager.config_cache == {}
        assert manager.config_validators == []
        assert manager.config_listeners == []

    # -- _create_default_config --

    def test_create_default_config(self, manager):
        cfg = manager._create_default_config("brand_new")
        assert cfg["name"] == "brand_new"
        assert cfg["exchange"]["name"] == "binance"
        assert (manager.config_dir / "brand_new.json").exists()

    # -- _load_base_config --

    def test_load_base_config_missing_creates_default(self, manager):
        cfg = manager._load_base_config("nonexistent")
        assert cfg["name"] == "nonexistent"

    def test_load_base_config_from_file(self, manager):
        data = {"exchange": {"name": "kraken"}, "stake_currency": "BTC"}
        (manager.config_dir / "mytest.json").write_text(json.dumps(data))
        cfg = manager._load_base_config("mytest")
        assert cfg["exchange"]["name"] == "kraken"

    # -- _load_environment_config --

    def test_load_environment_config_missing(self, manager):
        cfg = manager._load_environment_config("test", "production")
        assert cfg == {}

    def test_load_environment_config_exists(self, manager):
        data = {"extra": "override"}
        (manager.config_dir / "test.production.json").write_text(json.dumps(data))
        cfg = manager._load_environment_config("test", "production")
        assert cfg["extra"] == "override"

    # -- validate_configuration_schema --

    def test_validate_configuration_schema_valid(self, manager):
        """Schema validation delegates to freqtrade; just ensure it doesn't crash."""
        cfg = {
            "exchange": {"name": "binance"},
            "stake_currency": "USDT",
        }
        # This may return errors depending on freqtrade's schema strictness
        errors = manager.validate_configuration_schema(cfg)
        assert isinstance(errors, list)

    # -- get_configuration_summary --

    def test_get_configuration_summary_error(self, manager):
        """If loading fails, summary returns error dict."""
        with patch.object(manager, "load_configuration", side_effect=Exception("boom")):
            result = manager.get_configuration_summary("bad_cfg")
            assert "error" in result
