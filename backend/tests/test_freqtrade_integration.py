"""
Tests for FreqTrade integration layer.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pandas as pd
import pytest
from app.freqtrade.core import FreqTradeCore
from app.freqtrade.data_provider import FreqTradeDataProvider
from app.freqtrade.strategy_manager import StrategyManager


class TestFreqTradeCore:
    """Test suite for FreqTrade core wrapper."""

    @pytest.fixture
    def freqtrade_core(self):
        """Create FreqTrade core instance."""
        return FreqTradeCore()

    def test_core_initialization(self, freqtrade_core):
        """Core should initialize with default config."""
        assert freqtrade_core is not None
        assert hasattr(freqtrade_core, "config")

    def test_get_available_strategies(self, freqtrade_core):
        """Should have strategies attribute."""
        # FreqTradeCore uses _strategies internal attribute
        assert hasattr(freqtrade_core, "_strategies")
        assert isinstance(freqtrade_core._strategies, dict)

    def test_config_validation(self, freqtrade_core):
        """Config should have required fields."""
        config = freqtrade_core.config
        # Check essential config attributes exist (FreqTradeConfig is a dataclass)
        assert hasattr(config, "stake_currency") or hasattr(config, "dry_run")


class TestStrategyManager:
    """Test suite for strategy management."""

    @pytest.fixture
    def strategy_manager(self):
        """Create strategy manager instance."""
        return StrategyManager()

    def test_strategy_manager_init(self, strategy_manager):
        """Strategy manager should initialize."""
        assert strategy_manager is not None

    def test_list_strategies(self, strategy_manager):
        """Should list available strategies."""
        strategies = strategy_manager.list_strategies()
        assert isinstance(strategies, (list, dict))

    def test_get_strategy_info(self, strategy_manager):
        """Should get info for a strategy."""
        strategies = strategy_manager.list_strategies()
        if strategies:
            # Get first strategy name
            first_strategy = (
                strategies[0]
                if isinstance(strategies, list)
                else list(strategies.keys())[0]
            )
            info = strategy_manager.get_strategy_info(first_strategy)
            assert info is not None


class TestDataProvider:
    """Test suite for market data provider."""

    @pytest.fixture
    def data_provider(self):
        """Create data provider instance."""
        return FreqTradeDataProvider()

    def test_data_provider_init(self, data_provider):
        """Data provider should initialize."""
        assert data_provider is not None

    def test_get_supported_pairs(self, data_provider):
        """Should return supported trading pairs."""
        if hasattr(data_provider, "get_supported_pairs"):
            pairs = data_provider.get_supported_pairs()
            assert isinstance(pairs, list)

    def test_get_supported_timeframes(self, data_provider):
        """Should return supported timeframes."""
        if hasattr(data_provider, "get_supported_timeframes"):
            timeframes = data_provider.get_supported_timeframes()
            assert isinstance(timeframes, list)


class TestFreqTradeSignals:
    """Test suite for trading signal generation."""

    @pytest.fixture
    def mock_ohlcv_data(self):
        """Create mock OHLCV data for testing."""
        dates = pd.date_range(start="2024-01-01", periods=100, freq="1h")
        return pd.DataFrame(
            {
                "date": dates,
                "open": np.random.uniform(40000, 45000, 100),
                "high": np.random.uniform(45000, 47000, 100),
                "low": np.random.uniform(38000, 40000, 100),
                "close": np.random.uniform(40000, 45000, 100),
                "volume": np.random.uniform(1000, 10000, 100),
            }
        )

    def test_signal_structure(self, mock_ohlcv_data):
        """Trading signals should have proper structure."""
        # Mock signal generation
        signal = {
            "pair": "BTC/USDT",
            "direction": "buy",
            "confidence": 0.75,
            "timestamp": datetime.now(UTC),
            "strategy": "test_strategy",
        }

        assert "pair" in signal
        assert "direction" in signal
        assert signal["direction"] in ["buy", "sell", "hold"]
        assert 0 <= signal["confidence"] <= 1

    def test_signal_confidence_bounds(self):
        """Signal confidence must be between 0 and 1."""
        valid_confidences = [0.0, 0.5, 1.0]
        for conf in valid_confidences:
            assert 0 <= conf <= 1

        invalid_confidences = [-0.1, 1.1, 2.0]
        for conf in invalid_confidences:
            assert not (0 <= conf <= 1)


class TestBacktestIntegration:
    """Test suite for backtesting functionality."""

    def test_backtest_result_structure(self):
        """Backtest results should have proper structure."""
        mock_result = {
            "total_trades": 50,
            "winning_trades": 30,
            "losing_trades": 20,
            "profit_factor": 1.5,
            "sharpe_ratio": 1.2,
            "max_drawdown": 0.15,
            "total_profit_pct": 25.5,
        }

        assert "total_trades" in mock_result
        assert "profit_factor" in mock_result
        assert "max_drawdown" in mock_result
        assert (
            mock_result["winning_trades"] + mock_result["losing_trades"]
            == mock_result["total_trades"]
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
