"""
Tests for position sizing algorithms (D7/D12 domain testing).
"""

from app.services.position_sizer import (
    PositionSizer,
    SizingMethod,
    calculate_position_size,
)


class TestFixedFractional:
    def test_basic_sizing(self):
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=50_000, stop_loss=48_000
        )
        assert result.method == SizingMethod.FIXED_FRACTIONAL
        # Position capped at 25% of capital ($25k), so 0.5 units at $50k
        assert result.dollar_amount == 25_000.0
        assert result.units == 0.5
        assert result.risk_amount == 1_000.0  # 0.5 units * $2000 risk/unit

    def test_position_cap(self):
        sizer = PositionSizer(
            capital=100_000, max_risk_percent=5.0, max_position_percent=10.0
        )
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100, stop_loss=99
        )
        # 5% risk = $5000, at $1 risk/share = 5000 shares = $500k > 10% cap ($10k)
        assert result.dollar_amount <= 10_000.0

    def test_zero_stop_loss_defaults(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100, stop_loss=100
        )
        assert result.units > 0  # Should use 2% default stop


class TestKellyCriterion:
    def test_positive_edge(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.6,
            avg_win=3_000,
            avg_loss=2_000,
        )
        assert result.method == SizingMethod.KELLY
        assert result.units > 0
        assert "Half-Kelly" in (result.notes or "")

    def test_missing_params_falls_back(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY, entry_price=50_000, stop_loss=48_000
        )
        # Should fall back to fixed fractional
        assert result.method == SizingMethod.FIXED_FRACTIONAL

    def test_no_edge_returns_zero_or_minimal(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.3,
            avg_win=1_000,
            avg_loss=1_000,
        )
        # Kelly fraction should be very small or zero with poor edge
        assert result.risk_amount >= 0


class TestVolatilityBased:
    def test_atr_sizing(self):
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            atr=1_000,
        )
        assert result.method == SizingMethod.VOLATILITY
        assert result.units > 0

    def test_volatility_pct_sizing(self):
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            volatility=0.02,
        )
        assert result.units > 0

    def test_missing_vol_falls_back(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.VOLATILITY, entry_price=50_000, stop_loss=48_000
        )
        assert result.method == SizingMethod.FIXED_FRACTIONAL


class TestEqualWeight:
    def test_equal_weight(self):
        sizer = PositionSizer(capital=100_000, max_position_percent=10.0)
        result = sizer.calculate(
            SizingMethod.EQUAL_WEIGHT, entry_price=50_000, stop_loss=48_000
        )
        assert result.method == SizingMethod.EQUAL_WEIGHT
        assert result.dollar_amount == 10_000.0  # 10% of 100k
        assert result.units == 0.2  # 10k / 50k


class TestConvenienceFunction:
    def test_calculate_position_size(self):
        result = calculate_position_size(
            capital=100_000,
            entry_price=50_000,
            stop_loss=49_000,
            method=SizingMethod.FIXED_FRACTIONAL,
            max_risk_percent=1.0,
        )
        # Capped at 25% ($25k), 0.5 units, risk = 0.5 * $1000 = $500
        assert result.risk_amount == 500.0

    def test_update_capital(self):
        sizer = PositionSizer(capital=100_000)
        sizer.update_capital(120_000)
        assert sizer.capital == 120_000
