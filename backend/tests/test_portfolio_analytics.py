"""Tests for services/portfolio_analytics.py"""

from unittest.mock import MagicMock, patch

from app.services.portfolio_analytics import (
    ExposureBreakdown,
    PerformanceMetrics,
    PortfolioAnalytics,
)


class TestPerformanceMetrics:
    def test_defaults(self):
        m = PerformanceMetrics()
        assert m.total_pnl == 0.0
        assert m.sharpe_ratio == 0.0
        assert m.total_trades == 0
        assert m.win_rate == 0.0

    def test_custom(self):
        m = PerformanceMetrics(total_pnl=1000, total_trades=50, win_rate=0.6)
        assert m.total_pnl == 1000
        assert m.total_trades == 50


class TestExposureBreakdown:
    def test_defaults(self):
        e = ExposureBreakdown()
        assert e.by_book == {}


class TestPortfolioAnalytics:
    @patch("app.services.portfolio_analytics.get_supabase")
    def test_init(self, mock_sb):
        pa = PortfolioAnalytics()
        assert pa is not None

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_sharpe_empty(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_sharpe([])
        assert result == 0.0

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_sharpe_single(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_sharpe([0.05])
        assert result == 0.0

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_sharpe_valid(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_sharpe([0.05, -0.02, 0.03, 0.01, -0.01])
        assert isinstance(result, float)

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_sortino_empty(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_sortino([])
        assert result == 0.0

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_sortino_valid(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_sortino([0.05, -0.02, 0.03, -0.01])
        assert isinstance(result, float)

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_max_drawdown_empty(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_max_drawdown([])
        assert result == 0.0

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_max_drawdown_valid(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_max_drawdown([100, 110, 105, 95, 108])
        assert result >= 0.0

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_trade_pnls(self, mock_sb):
        pa = PortfolioAnalytics()
        fills = [
            {"side": "buy", "price": 100, "size": 1},
            {"side": "sell", "price": 110, "size": 1},
        ]
        result = pa._calculate_trade_pnls(fills)
        assert isinstance(result, list)

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_calculate_trade_pnls_empty(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._calculate_trade_pnls([])
        assert result == []

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_pnl_to_returns_empty(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._pnl_to_returns([])
        assert result == []

    @patch("app.services.portfolio_analytics.get_supabase")
    def test_pnl_to_returns_valid(self, mock_sb):
        pa = PortfolioAnalytics()
        result = pa._pnl_to_returns([100, 110, 105, 120])
        assert len(result) == 4
        assert isinstance(result[0], float)
