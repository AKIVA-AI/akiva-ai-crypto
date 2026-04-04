"""
Extended coverage tests for app.services.position_sizer.

Covers edge cases, boundary conditions, and paths not already exercised
by test_position_sizer.py.
"""

import pytest
from app.services.position_sizer import (
    PositionSize,
    PositionSizer,
    SizingMethod,
    calculate_position_size,
)

# ---------------------------------------------------------------------------
# PositionSize dataclass
# ---------------------------------------------------------------------------


class TestPositionSizeDataclass:
    def test_all_fields(self):
        ps = PositionSize(
            units=1.5,
            dollar_amount=75_000.0,
            risk_amount=1_500.0,
            method=SizingMethod.FIXED_FRACTIONAL,
            risk_percent=2.0,
            notes="test note",
        )
        assert ps.units == 1.5
        assert ps.dollar_amount == 75_000.0
        assert ps.risk_amount == 1_500.0
        assert ps.method == SizingMethod.FIXED_FRACTIONAL
        assert ps.risk_percent == 2.0
        assert ps.notes == "test note"

    def test_notes_default_none(self):
        ps = PositionSize(
            units=1.0,
            dollar_amount=50_000.0,
            risk_amount=1_000.0,
            method=SizingMethod.KELLY,
            risk_percent=1.0,
        )
        assert ps.notes is None


# ---------------------------------------------------------------------------
# SizingMethod enum
# ---------------------------------------------------------------------------


class TestSizingMethodEnum:
    def test_all_values(self):
        assert SizingMethod.FIXED_FRACTIONAL == "fixed_fractional"
        assert SizingMethod.KELLY == "kelly"
        assert SizingMethod.VOLATILITY == "volatility"
        assert SizingMethod.EQUAL_WEIGHT == "equal_weight"

    def test_from_string(self):
        assert SizingMethod("fixed_fractional") == SizingMethod.FIXED_FRACTIONAL


# ---------------------------------------------------------------------------
# FixedFractional edge cases
# ---------------------------------------------------------------------------


class TestFixedFractionalEdgeCases:
    def test_tiny_balance(self):
        sizer = PositionSizer(capital=100.0, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=50.0, stop_loss=48.0
        )
        assert result.units > 0
        assert result.dollar_amount <= 100.0 * 0.25  # max_position_percent

    def test_large_stop_distance(self):
        """When stop is very far away, units should be small."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=1.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=50_000, stop_loss=25_000
        )
        # risk_per_share = 25000, risk_amount = 1000, units = 0.04
        assert result.units == 0.04
        assert result.dollar_amount == 2_000.0  # 0.04 * 50000

    def test_stop_above_entry_uses_abs(self):
        """Stop above entry (short trade scenario) — risk_per_share is abs."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=105.0
        )
        # risk_per_share = abs(100 - 105) = 5
        # risk_amount = 2000, units = 400, dollar = 40000 > cap 25000
        assert result.dollar_amount == 25_000.0

    def test_very_small_risk_percent(self):
        sizer = PositionSizer(capital=100_000, max_risk_percent=0.01)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=99.0
        )
        # risk_amount = 10, units = 10, dollar = 1000 (under 25% cap)
        assert result.risk_amount == 10.0

    def test_zero_risk_percent(self):
        """Zero max_risk_percent should yield zero units."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=0.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=99.0
        )
        assert result.units == 0.0
        assert result.dollar_amount == 0.0

    def test_same_entry_stop_uses_default(self):
        """When entry == stop, risk_per_share defaults to 2% of entry."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=1000.0, stop_loss=1000.0
        )
        # risk_per_share = 1000 * 0.02 = 20
        # risk_amount = 2000, units = 100, dollar = 100000 > cap 25000
        assert result.dollar_amount == 25_000.0
        assert result.units > 0


# ---------------------------------------------------------------------------
# Kelly Criterion edge cases
# ---------------------------------------------------------------------------


class TestKellyCriterionEdgeCases:
    def test_zero_avg_loss(self):
        """When avg_loss is 0, b = abs(win/loss) should use fallback b=1."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.6,
            avg_win=1_000,
            avg_loss=0,
        )
        # avg_loss=0 is falsy → falls back to fixed fractional
        assert result.method == SizingMethod.FIXED_FRACTIONAL

    def test_negative_kelly_fraction_clamped(self):
        """Negative Kelly fraction (no edge) is clamped to 0."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.2,
            avg_win=500,
            avg_loss=2_000,
        )
        assert result.method == SizingMethod.KELLY
        # Kelly fraction should be clamped to 0, so risk_amount = 0
        assert result.risk_amount == 0.0
        assert result.units == 0.0

    def test_high_kelly_fraction_capped(self):
        """Kelly fraction > 25% is capped."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.9,
            avg_win=10_000,
            avg_loss=100,
        )
        assert result.method == SizingMethod.KELLY
        # Half-Kelly of capped 25% = 12.5%
        assert result.risk_percent <= 12.5 + 0.01

    def test_missing_win_rate_only(self):
        """Missing only win_rate → fallback."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=None,
            avg_win=1_000,
            avg_loss=500,
        )
        assert result.method == SizingMethod.FIXED_FRACTIONAL

    def test_missing_avg_win_only(self):
        """Missing only avg_win → fallback."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.6,
            avg_win=None,
            avg_loss=500,
        )
        assert result.method == SizingMethod.FIXED_FRACTIONAL

    def test_kelly_with_equal_stop_entry(self):
        """When entry == stop, default risk_per_share is used."""
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=100.0,
            stop_loss=100.0,
            win_rate=0.6,
            avg_win=200,
            avg_loss=100,
        )
        assert result.method == SizingMethod.KELLY
        assert result.units > 0

    def test_kelly_notes_format(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.KELLY,
            entry_price=50_000,
            stop_loss=48_000,
            win_rate=0.6,
            avg_win=3_000,
            avg_loss=2_000,
        )
        assert result.notes is not None
        assert "Half-Kelly" in result.notes


# ---------------------------------------------------------------------------
# Volatility-based edge cases
# ---------------------------------------------------------------------------


class TestVolatilityEdgeCases:
    def test_volatility_without_atr(self):
        """Use volatility when atr is None."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            volatility=0.03,
            atr=None,
        )
        assert result.method == SizingMethod.VOLATILITY
        # vol_measure = 0.03 * 50000 = 1500
        assert result.units > 0

    def test_atr_takes_precedence_over_volatility(self):
        """ATR is used when both atr and volatility are provided."""
        sizer = PositionSizer(capital=100_000, max_risk_percent=2.0)
        result_atr = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            atr=1_000,
            volatility=0.03,
        )
        result_atr_only = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            atr=1_000,
            volatility=None,
        )
        assert result_atr.units == result_atr_only.units

    def test_volatility_position_cap_hit(self):
        """Very low vol → large position → cap applied."""
        sizer = PositionSizer(
            capital=100_000, max_risk_percent=2.0, max_position_percent=10.0
        )
        result = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=100.0,
            stop_loss=99.0,
            atr=0.01,  # Very low ATR → large position
        )
        assert result.dollar_amount <= 10_000.0 + 0.01

    def test_volatility_notes(self):
        sizer = PositionSizer(capital=100_000)
        result = sizer.calculate(
            SizingMethod.VOLATILITY,
            entry_price=50_000,
            stop_loss=48_000,
            atr=1_000,
        )
        assert "ATR-based" in result.notes


# ---------------------------------------------------------------------------
# Equal weight edge cases
# ---------------------------------------------------------------------------


class TestEqualWeightEdgeCases:
    def test_equal_weight_default_position_percent(self):
        sizer = PositionSizer(capital=100_000)  # default 25%
        result = sizer.calculate(
            SizingMethod.EQUAL_WEIGHT, entry_price=500.0, stop_loss=490.0
        )
        assert result.dollar_amount == 25_000.0
        assert result.units == 50.0
        assert result.risk_percent == 2.0
        assert "Equal weight" in result.notes

    def test_equal_weight_small_price(self):
        sizer = PositionSizer(capital=10_000, max_position_percent=20.0)
        result = sizer.calculate(
            SizingMethod.EQUAL_WEIGHT, entry_price=0.50, stop_loss=0.45
        )
        assert result.dollar_amount == 2_000.0
        assert result.units == 4_000.0

    def test_equal_weight_risk_amount(self):
        """Risk amount is 2% of dollar_amount."""
        sizer = PositionSizer(capital=100_000, max_position_percent=10.0)
        result = sizer.calculate(
            SizingMethod.EQUAL_WEIGHT, entry_price=100.0, stop_loss=95.0
        )
        assert result.risk_amount == result.dollar_amount * 0.02


# ---------------------------------------------------------------------------
# PositionSizer.update_capital
# ---------------------------------------------------------------------------


class TestUpdateCapital:
    def test_update_capital_changes_sizing(self):
        sizer = PositionSizer(capital=100_000)
        r1 = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=99.0
        )
        sizer.update_capital(200_000)
        r2 = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=99.0
        )
        # Doubled capital → doubled (or capped) position
        assert r2.dollar_amount >= r1.dollar_amount

    def test_update_capital_to_zero(self):
        sizer = PositionSizer(capital=100_000)
        sizer.update_capital(0.0)
        result = sizer.calculate(
            SizingMethod.FIXED_FRACTIONAL, entry_price=100.0, stop_loss=99.0
        )
        assert result.units == 0.0


# ---------------------------------------------------------------------------
# calculate_position_size convenience function
# ---------------------------------------------------------------------------


class TestCalculatePositionSizeFn:
    def test_default_method(self):
        result = calculate_position_size(
            capital=100_000, entry_price=50_000, stop_loss=49_000
        )
        assert result.method == SizingMethod.FIXED_FRACTIONAL

    def test_kelly_via_convenience(self):
        result = calculate_position_size(
            capital=100_000,
            entry_price=50_000,
            stop_loss=49_000,
            method=SizingMethod.KELLY,
            win_rate=0.6,
            avg_win=3_000,
            avg_loss=2_000,
        )
        assert result.method == SizingMethod.KELLY

    def test_volatility_via_convenience(self):
        result = calculate_position_size(
            capital=100_000,
            entry_price=50_000,
            stop_loss=49_000,
            method=SizingMethod.VOLATILITY,
            atr=1_000,
        )
        assert result.method == SizingMethod.VOLATILITY

    def test_equal_weight_via_convenience(self):
        result = calculate_position_size(
            capital=100_000,
            entry_price=50_000,
            stop_loss=49_000,
            method=SizingMethod.EQUAL_WEIGHT,
        )
        assert result.method == SizingMethod.EQUAL_WEIGHT

    def test_custom_risk_percent(self):
        r1 = calculate_position_size(
            capital=100_000,
            entry_price=100.0,
            stop_loss=99.0,
            max_risk_percent=1.0,
        )
        r2 = calculate_position_size(
            capital=100_000,
            entry_price=100.0,
            stop_loss=99.0,
            max_risk_percent=2.0,
        )
        assert r2.risk_amount >= r1.risk_amount
