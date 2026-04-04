from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from app.services.institutional_backtester import (
    BacktestConfig,
    InstitutionalBacktester,
)


class MockStrategy:
    """Mock strategy for testing."""

    def __init__(self, entry_every_n: int = 10, hold_periods: int = 5):
        self.entry_every_n = entry_every_n
        self.hold_periods = hold_periods

    def populate_indicators(self, dataframe, metadata):
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe["enter_long"] = 0
        dataframe["enter_short"] = 0
        dataframe.loc[dataframe.index % self.entry_every_n == 0, "enter_long"] = 1
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe["exit_long"] = 0
        dataframe["exit_short"] = 0
        for i in range(len(dataframe)):
            if (
                i >= self.hold_periods
                and dataframe.iloc[i - self.hold_periods].get("enter_long", 0) == 1
            ):
                dataframe.loc[dataframe.index[i], "exit_long"] = 1
        return dataframe


@pytest.fixture
def sample_data():
    """Generate sample OHLCV data."""
    np.random.seed(42)
    dates = pd.date_range(start="2023-01-01", periods=500, freq="1h")
    price = 50000 + np.cumsum(np.random.randn(500) * 100)

    return pd.DataFrame(
        {
            "date": dates,
            "open": price,
            "high": price * 1.01,
            "low": price * 0.99,
            "close": price,
            "volume": np.random.uniform(100, 1000, 500),
        }
    )


@pytest.fixture
def config():
    """Standard backtest config."""
    return BacktestConfig(
        strategy_name="TestStrategy",
        instruments=["BTC-USD"],
        start_date=datetime(2023, 1, 1),
        end_date=datetime(2023, 2, 1),
        initial_capital=100000.0,
        slippage_bps=5.0,
        commission_bps=10.0,
    )


class TestBacktestConfig:
    """Tests for BacktestConfig."""

    def test_valid_config(self, config):
        """Valid config should create successfully."""
        assert config.initial_capital == 100000.0

    def test_invalid_ratios(self):
        """Ratios not summing to 1 should raise."""
        with pytest.raises(ValueError):
            BacktestConfig(
                strategy_name="Test",
                instruments=["BTC-USD"],
                start_date=datetime(2023, 1, 1),
                end_date=datetime(2023, 2, 1),
                train_ratio=0.5,
                validate_ratio=0.5,
                test_ratio=0.5,
            )

    def test_invalid_capital(self):
        """Zero/negative capital should raise."""
        with pytest.raises(ValueError):
            BacktestConfig(
                strategy_name="Test",
                instruments=["BTC-USD"],
                start_date=datetime(2023, 1, 1),
                end_date=datetime(2023, 2, 1),
                initial_capital=0,
            )

    def test_invalid_dates(self):
        """Start after end should raise."""
        with pytest.raises(ValueError):
            BacktestConfig(
                strategy_name="Test",
                instruments=["BTC-USD"],
                start_date=datetime(2023, 2, 1),
                end_date=datetime(2023, 1, 1),
            )


class TestInstitutionalBacktester:
    """Tests for InstitutionalBacktester."""

    def test_data_split_ratios(self, config, sample_data):
        """Data should split according to ratios."""
        backtester = InstitutionalBacktester(config)
        train, validate, test = backtester._split_data(sample_data)

        total = len(sample_data)
        assert len(train) == int(total * 0.6)
        assert len(validate) == int(total * 0.2)
        assert len(test) == total - len(train) - len(validate)

    def test_validate_data_missing_columns(self, config):
        """Missing columns should raise."""
        backtester = InstitutionalBacktester(config)
        bad_data = pd.DataFrame({"date": [1, 2, 3], "close": [100, 101, 102]})

        with pytest.raises(ValueError, match="missing required columns"):
            backtester._validate_data(bad_data)

    def test_validate_data_empty(self, config):
        """Empty data should raise."""
        backtester = InstitutionalBacktester(config)
        empty_data = pd.DataFrame(
            columns=["date", "open", "high", "low", "close", "volume"]
        )

        with pytest.raises(ValueError, match="cannot be empty"):
            backtester._validate_data(empty_data)

    def test_slippage_calculation(self, config):
        """Slippage should affect entry/exit prices."""
        backtester = InstitutionalBacktester(config)
        backtester._cash = 100000

        backtester._open_position("BTC-USD", "long", datetime.now(), 50000)

        position = backtester._positions["BTC-USD"]
        expected_slippage = 50000 * (5 / 10000)
        assert position.entry_price > 50000
        assert abs(position.entry_price - 50000 - expected_slippage) < 0.01

    def test_commission_calculation(self, config):
        """Commissions should be deducted."""
        backtester = InstitutionalBacktester(config)
        initial_cash = 100000
        backtester._cash = initial_cash

        backtester._open_position("BTC-USD", "long", datetime.now(), 50000)
        backtester._close_position("BTC-USD", datetime.now(), 50000)

        assert backtester._cash < initial_cash

    def test_backtest_with_trades(self, config, sample_data):
        """Backtest should generate trades."""
        backtester = InstitutionalBacktester(config)
        strategy = MockStrategy(entry_every_n=20, hold_periods=10)

        result = backtester.run_backtest(strategy, sample_data)

        assert result.strategy_name == "TestStrategy"
        assert len(result.trades) > 0
        assert len(result.equity_curve) > 0
        assert result.metrics is not None

    def test_backtest_no_signals(self, config, sample_data):
        """Backtest with no signals should still work."""
        backtester = InstitutionalBacktester(config)

        class NoSignalStrategy:
            def populate_indicators(self, df, meta):
                return df

            def populate_entry_trend(self, df, meta):
                df["enter_long"] = 0
                df["enter_short"] = 0
                return df

            def populate_exit_trend(self, df, meta):
                df["exit_long"] = 0
                df["exit_short"] = 0
                return df

        result = backtester.run_backtest(NoSignalStrategy(), sample_data)

        assert len(result.trades) == 0
        assert result.final_equity == config.initial_capital

    def test_in_out_sample_metrics(self, config, sample_data):
        """Should calculate metrics for each split."""
        backtester = InstitutionalBacktester(config)
        strategy = MockStrategy(entry_every_n=10, hold_periods=5)

        result = backtester.run_backtest(strategy, sample_data)

        assert result.in_sample_metrics is not None
        assert result.validation_metrics is not None
        assert result.out_sample_metrics is not None

    def test_equity_curve_records_correctly(self, config, sample_data):
        """Equity curve should track portfolio value."""
        backtester = InstitutionalBacktester(config)
        strategy = MockStrategy()

        result = backtester.run_backtest(strategy, sample_data)

        assert abs(result.equity_curve[0].equity - config.initial_capital) < 1000

        for ep in result.equity_curve:
            assert ep.equity > 0
            assert ep.drawdown >= 0
            assert ep.cash >= 0
