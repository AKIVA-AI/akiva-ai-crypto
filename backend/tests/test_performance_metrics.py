from datetime import datetime, timedelta, timezone
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest
from app.models.backtest_result import EquityPoint, TradeRecord
from app.services.performance_metrics import PerformanceMetricsCalculator


class TestPerformanceMetricsCalculator:
    """Tests for PerformanceMetricsCalculator."""

    @pytest.fixture
    def calculator(self):
        return PerformanceMetricsCalculator(risk_free_rate=0.02)

    @pytest.fixture
    def sample_returns(self):
        """Sample returns series for testing."""
        np.random.seed(42)
        return pd.Series(np.random.normal(0.001, 0.02, 252))

    @pytest.fixture
    def sample_equity_curve(self):
        """Sample equity curve for testing."""
        np.random.seed(42)
        start = datetime.now(timezone.utc) - timedelta(days=29)
        dates = [start + timedelta(days=i) for i in range(30)]
        returns = np.random.normal(0.001, 0.02, len(dates))
        equity_values = 100000 * (1 + returns).cumprod()

        return [
            EquityPoint(
                timestamp=ts,
                equity=float(value),
                drawdown=0.0,
                position_value=0.0,
                cash=float(value),
            )
            for ts, value in zip(dates, equity_values)
        ]

    # Sharpe Ratio Tests
    def test_sharpe_ratio_positive_returns(self, calculator):
        """Positive excess returns should give positive Sharpe."""
        returns = pd.Series([0.05, 0.03, 0.04, 0.02, 0.03])
        sharpe = calculator.calculate_sharpe_ratio(returns)
        assert sharpe > 0

    def test_sharpe_ratio_negative_returns(self, calculator):
        """Negative excess returns should give negative Sharpe."""
        returns = pd.Series([-0.05, -0.03, -0.04, -0.02, -0.03])
        sharpe = calculator.calculate_sharpe_ratio(returns)
        assert sharpe < 0

    def test_sharpe_ratio_zero_volatility(self, calculator):
        """Zero volatility should return 0."""
        returns = pd.Series([0.01, 0.01, 0.01, 0.01])
        sharpe = calculator.calculate_sharpe_ratio(returns)
        assert sharpe == 0.0

    # Sortino Ratio Tests
    def test_sortino_ratio_no_downside(self, calculator):
        """No negative returns should handle gracefully."""
        returns = pd.Series([0.01, 0.02, 0.03, 0.01])
        sortino = calculator.calculate_sortino_ratio(returns)
        assert sortino >= 0

    def test_sortino_greater_than_sharpe_for_skewed(self, calculator):
        """Sortino should be higher when positive skew."""
        returns = pd.Series([0.02, 0.03, 0.02, -0.01, 0.02, 0.03])
        sharpe = calculator.calculate_sharpe_ratio(returns)
        sortino = calculator.calculate_sortino_ratio(returns)
        assert sortino >= sharpe

    # Max Drawdown Tests
    def test_max_drawdown_simple_case(self, calculator):
        """Test simple drawdown calculation."""
        equity = pd.Series([100, 110, 105, 120, 90, 100])
        dd = calculator.calculate_max_drawdown(equity)
        assert abs(dd - 0.25) < 0.01

    def test_max_drawdown_no_drawdown(self, calculator):
        """Always increasing equity has no drawdown."""
        equity = pd.Series([100, 110, 120, 130, 140])
        dd = calculator.calculate_max_drawdown(equity)
        assert dd == 0.0

    def test_max_drawdown_all_decline(self, calculator):
        """Continuous decline should show full drawdown."""
        equity = pd.Series([100, 90, 80, 70, 60])
        dd = calculator.calculate_max_drawdown(equity)
        assert abs(dd - 0.40) < 0.01

    # VaR Tests
    def test_var_calculation(self, calculator, sample_returns):
        """VaR should be positive and reasonable."""
        var = calculator.calculate_var(sample_returns, 0.95)
        assert var > 0
        assert var < 0.5

    def test_var_higher_confidence_higher_var(self, calculator, sample_returns):
        """Higher confidence should give higher VaR."""
        var_95 = calculator.calculate_var(sample_returns, 0.95)
        var_99 = calculator.calculate_var(sample_returns, 0.99)
        assert var_99 >= var_95

    # CVaR Tests
    def test_cvar_greater_than_var(self, calculator, sample_returns):
        """CVaR should be >= VaR."""
        var = calculator.calculate_var(sample_returns, 0.95)
        cvar = calculator.calculate_cvar(sample_returns, 0.95)
        assert cvar >= var

    # Calmar Tests
    def test_calmar_ratio_calculation(self, calculator):
        """Test Calmar ratio calculation."""
        calmar = calculator.calculate_calmar_ratio(0.20, 0.10)
        assert calmar == 2.0

    def test_calmar_ratio_zero_drawdown(self, calculator):
        """Zero drawdown should return 0 (avoid division by zero)."""
        calmar = calculator.calculate_calmar_ratio(0.20, 0.0)
        assert calmar == 0.0

    # Trade Statistics Tests
    def test_trade_statistics_basic(self, calculator):
        """Test trade statistics calculation."""
        now = datetime.now(timezone.utc)
        trades = [
            TradeRecord(
                id=uuid4(),
                timestamp_open=now,
                timestamp_close=now + timedelta(hours=2),
                instrument="BTC-USD",
                side="long",
                size=1.0,
                entry_price=50000,
                exit_price=51000,
                pnl=1000,
                pnl_percent=0.02,
                fees=10,
                slippage=5,
            ),
            TradeRecord(
                id=uuid4(),
                timestamp_open=now,
                timestamp_close=now + timedelta(hours=1),
                instrument="BTC-USD",
                side="long",
                size=1.0,
                entry_price=51000,
                exit_price=50000,
                pnl=-1000,
                pnl_percent=-0.02,
                fees=10,
                slippage=5,
            ),
        ]
        stats = calculator.calculate_trade_statistics(trades)
        assert stats["total_trades"] == 2
        assert stats["winning_trades"] == 1
        assert stats["losing_trades"] == 1
        assert stats["win_rate"] == 0.5

    # Integration Test
    def test_calculate_all_integration(self, calculator, sample_equity_curve):
        """Test full metrics calculation."""
        now = datetime.now(timezone.utc)
        trades = [
            TradeRecord(
                id=uuid4(),
                timestamp_open=now - timedelta(hours=3),
                timestamp_close=now - timedelta(hours=1),
                instrument="ETH-USD",
                side="long",
                size=1.0,
                entry_price=2000.0,
                exit_price=2100.0,
                pnl=100.0,
                pnl_percent=0.05,
                fees=5.0,
                slippage=2.0,
            ),
            TradeRecord(
                id=uuid4(),
                timestamp_open=now - timedelta(hours=2),
                timestamp_close=now - timedelta(hours=0.5),
                instrument="ETH-USD",
                side="long",
                size=1.0,
                entry_price=2100.0,
                exit_price=2050.0,
                pnl=-50.0,
                pnl_percent=-0.02,
                fees=5.0,
                slippage=2.0,
            ),
        ]

        metrics = calculator.calculate_all(
            equity_curve=sample_equity_curve,
            trades=trades,
            initial_capital=100000.0,
        )

        assert metrics.total_trades == 2
        assert metrics.winning_trades == 1
        assert metrics.losing_trades == 1
        assert 0.0 <= metrics.win_rate <= 1.0
        assert metrics.max_drawdown >= 0.0
        assert metrics.volatility >= 0.0
        assert metrics.downside_volatility >= 0.0
        assert metrics.var_95 >= 0.0
        assert metrics.cvar_95 >= metrics.var_95
