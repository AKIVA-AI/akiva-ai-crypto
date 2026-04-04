"""
Position Sizer - Calculates optimal position sizes for backtesting.

Implements multiple position sizing algorithms:
- Fixed Fractional (risk % per trade)
- Kelly Criterion (optimal growth)
- Volatility-Based (ATR-adjusted)
- Equal Weight (simple allocation)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

import structlog

logger = structlog.get_logger()


class SizingMethod(str, Enum):
    """Position sizing methods."""

    FIXED_FRACTIONAL = "fixed_fractional"
    KELLY = "kelly"
    VOLATILITY = "volatility"
    EQUAL_WEIGHT = "equal_weight"


@dataclass
class PositionSize:
    """Result of position sizing calculation."""

    units: float
    dollar_amount: float
    risk_amount: float
    method: SizingMethod
    risk_percent: float
    notes: Optional[str] = None


class PositionSizer:
    """
    Position sizing calculator for backtesting.

    Supports multiple sizing methods to optimize risk-adjusted returns.
    """

    def __init__(
        self,
        capital: float,
        max_risk_percent: float = 2.0,
        max_position_percent: float = 25.0,
    ):
        """
        Initialize position sizer.

        Args:
            capital: Total account capital
            max_risk_percent: Maximum risk per trade (default 2%)
            max_position_percent: Maximum position size as % of capital (default 25%)
        """
        self.capital = capital
        self.max_risk_percent = max_risk_percent
        self.max_position_percent = max_position_percent

    def calculate(
        self,
        method: SizingMethod,
        entry_price: float,
        stop_loss: float,
        win_rate: Optional[float] = None,
        avg_win: Optional[float] = None,
        avg_loss: Optional[float] = None,
        volatility: Optional[float] = None,
        atr: Optional[float] = None,
    ) -> PositionSize:
        """
        Calculate position size using specified method.

        Args:
            method: Sizing method to use
            entry_price: Entry price for the trade
            stop_loss: Stop loss price
            win_rate: Historical win rate (for Kelly)
            avg_win: Average winning trade (for Kelly)
            avg_loss: Average losing trade (for Kelly)
            volatility: Price volatility (for volatility method)
            atr: Average True Range (for volatility method)

        Returns:
            PositionSize with calculated units and amounts
        """
        if method == SizingMethod.FIXED_FRACTIONAL:
            return self._fixed_fractional(entry_price, stop_loss)
        elif method == SizingMethod.KELLY:
            return self._kelly_criterion(
                entry_price, stop_loss, win_rate, avg_win, avg_loss
            )
        elif method == SizingMethod.VOLATILITY:
            return self._volatility_based(entry_price, stop_loss, volatility, atr)
        elif method == SizingMethod.EQUAL_WEIGHT:
            return self._equal_weight(entry_price)
        else:
            raise ValueError(f"Unknown sizing method: {method}")

    def _fixed_fractional(self, entry_price: float, stop_loss: float) -> PositionSize:
        """Fixed fractional position sizing (risk % of capital per trade)."""
        risk_per_share = abs(entry_price - stop_loss)
        if risk_per_share == 0:
            risk_per_share = entry_price * 0.02  # Default 2% stop

        risk_amount = self.capital * (self.max_risk_percent / 100)
        units = risk_amount / risk_per_share
        dollar_amount = units * entry_price

        # Apply position size cap
        max_dollars = self.capital * (self.max_position_percent / 100)
        if dollar_amount > max_dollars:
            dollar_amount = max_dollars
            units = dollar_amount / entry_price
            risk_amount = units * risk_per_share

        return PositionSize(
            units=round(units, 8),
            dollar_amount=round(dollar_amount, 2),
            risk_amount=round(risk_amount, 2),
            method=SizingMethod.FIXED_FRACTIONAL,
            risk_percent=self.max_risk_percent,
        )

    def _kelly_criterion(
        self,
        entry_price: float,
        stop_loss: float,
        win_rate: Optional[float],
        avg_win: Optional[float],
        avg_loss: Optional[float],
    ) -> PositionSize:
        """Kelly Criterion - optimal growth rate sizing."""
        if not all([win_rate, avg_win, avg_loss]):
            logger.warning(
                "kelly_missing_params", msg="Using fixed fractional fallback"
            )
            return self._fixed_fractional(entry_price, stop_loss)

        # Kelly formula: f* = (bp - q) / b
        # where b = avg_win/avg_loss, p = win_rate, q = 1-p
        b = abs(avg_win / avg_loss) if avg_loss != 0 else 1
        p = win_rate
        q = 1 - p

        kelly_fraction = (b * p - q) / b if b != 0 else 0
        kelly_fraction = max(0, min(kelly_fraction, 0.25))  # Cap at 25%

        # Half-Kelly for safety
        kelly_fraction *= 0.5

        risk_amount = self.capital * kelly_fraction
        risk_per_share = abs(entry_price - stop_loss)
        if risk_per_share == 0:
            risk_per_share = entry_price * 0.02

        units = risk_amount / risk_per_share
        dollar_amount = units * entry_price

        return PositionSize(
            units=round(units, 8),
            dollar_amount=round(dollar_amount, 2),
            risk_amount=round(risk_amount, 2),
            method=SizingMethod.KELLY,
            risk_percent=round(kelly_fraction * 100, 2),
            notes=f"Half-Kelly: {kelly_fraction * 100:.1f}%",
        )

    def _volatility_based(
        self,
        entry_price: float,
        stop_loss: float,
        volatility: Optional[float],
        atr: Optional[float],
    ) -> PositionSize:
        """Volatility-based sizing using ATR or standard deviation."""
        if atr is None and volatility is None:
            logger.warning(
                "volatility_missing_params", msg="Using fixed fractional fallback"
            )
            return self._fixed_fractional(entry_price, stop_loss)

        # Use ATR if available, otherwise use volatility
        vol_measure = atr if atr else (volatility * entry_price)

        # Target risk as multiple of volatility (2 ATR default stop)
        risk_amount = self.capital * (self.max_risk_percent / 100)
        units = risk_amount / (2 * vol_measure)
        dollar_amount = units * entry_price

        # Apply position size cap
        max_dollars = self.capital * (self.max_position_percent / 100)
        if dollar_amount > max_dollars:
            dollar_amount = max_dollars
            units = dollar_amount / entry_price

        actual_risk = units * 2 * vol_measure

        return PositionSize(
            units=round(units, 8),
            dollar_amount=round(dollar_amount, 2),
            risk_amount=round(actual_risk, 2),
            method=SizingMethod.VOLATILITY,
            risk_percent=round((actual_risk / self.capital) * 100, 2),
            notes="ATR-based: 2x ATR stop",
        )

    def _equal_weight(self, entry_price: float) -> PositionSize:
        """Equal weight sizing - divide capital equally among positions."""
        # Assume 10 position portfolio by default
        position_weight = self.max_position_percent / 100
        dollar_amount = self.capital * position_weight
        units = dollar_amount / entry_price

        return PositionSize(
            units=round(units, 8),
            dollar_amount=round(dollar_amount, 2),
            risk_amount=round(dollar_amount * 0.02, 2),  # Assume 2% stop
            method=SizingMethod.EQUAL_WEIGHT,
            risk_percent=2.0,
            notes=f"Equal weight: {position_weight * 100:.0f}% allocation",
        )

    def update_capital(self, new_capital: float):
        """Update capital after trade or P&L."""
        self.capital = new_capital
        logger.debug("capital_updated", new_capital=new_capital)


# Convenience function for quick calculations
def calculate_position_size(
    capital: float,
    entry_price: float,
    stop_loss: float,
    method: SizingMethod = SizingMethod.FIXED_FRACTIONAL,
    max_risk_percent: float = 2.0,
    **kwargs,
) -> PositionSize:
    """Quick position size calculation."""
    sizer = PositionSizer(capital=capital, max_risk_percent=max_risk_percent)
    return sizer.calculate(method, entry_price, stop_loss, **kwargs)
