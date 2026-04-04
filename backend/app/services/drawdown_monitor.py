"""
Drawdown Monitor - Tracks and analyzes drawdowns during backtesting.

Monitors:
- Current drawdown from peak
- Maximum drawdown (MDD)
- Drawdown duration
- Recovery time
- Underwater periods
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

import numpy as np
import structlog

logger = structlog.get_logger()


@dataclass
class DrawdownPeriod:
    """Represents a single drawdown period."""

    start_date: datetime
    start_equity: float
    trough_date: Optional[datetime] = None
    trough_equity: Optional[float] = None
    end_date: Optional[datetime] = None
    end_equity: Optional[float] = None
    max_drawdown_pct: float = 0.0
    duration_days: int = 0
    recovery_days: Optional[int] = None

    @property
    def is_recovered(self) -> bool:
        return self.end_date is not None


@dataclass
class DrawdownStats:
    """Summary statistics for drawdown analysis."""

    current_drawdown_pct: float
    max_drawdown_pct: float
    max_drawdown_dollars: float
    average_drawdown_pct: float
    longest_drawdown_days: int
    average_recovery_days: float
    total_underwater_days: int
    drawdown_periods: List[DrawdownPeriod]
    peak_equity: float
    current_equity: float


class DrawdownMonitor:
    """
    Real-time drawdown monitoring for backtesting.

    Tracks equity curve and identifies drawdown periods,
    calculates statistics, and can trigger alerts.
    """

    def __init__(
        self,
        initial_capital: float,
        max_drawdown_limit: float = 20.0,  # Alert at 20% drawdown
        alert_threshold: float = 10.0,  # Warning at 10%
    ):
        """
        Initialize drawdown monitor.

        Args:
            initial_capital: Starting capital
            max_drawdown_limit: Maximum allowed drawdown % before halt
            alert_threshold: Drawdown % to trigger warning
        """
        self.initial_capital = initial_capital
        self.max_drawdown_limit = max_drawdown_limit
        self.alert_threshold = alert_threshold

        # Tracking state
        self.equity_curve: List[Tuple[datetime, float]] = []
        self.peak_equity = initial_capital
        self.peak_date: Optional[datetime] = None
        self.current_equity = initial_capital

        # Drawdown periods
        self.drawdown_periods: List[DrawdownPeriod] = []
        self.current_drawdown: Optional[DrawdownPeriod] = None

        # Statistics
        self.max_drawdown_pct = 0.0
        self.max_drawdown_dollars = 0.0

    def update(self, timestamp: datetime, equity: float) -> Optional[str]:
        """
        Update monitor with new equity value.

        Args:
            timestamp: Current timestamp
            equity: Current portfolio equity

        Returns:
            Alert message if threshold breached, None otherwise
        """
        self.equity_curve.append((timestamp, equity))
        self.current_equity = equity
        alert = None

        # Check if new peak
        if equity >= self.peak_equity:
            self.peak_equity = equity
            self.peak_date = timestamp

            # Close current drawdown period if exists
            if self.current_drawdown is not None:
                self.current_drawdown.end_date = timestamp
                self.current_drawdown.end_equity = equity
                if self.current_drawdown.trough_date:
                    self.current_drawdown.recovery_days = (
                        timestamp - self.current_drawdown.trough_date
                    ).days
                self.drawdown_periods.append(self.current_drawdown)
                self.current_drawdown = None
        else:
            # We're in a drawdown
            drawdown_pct = ((self.peak_equity - equity) / self.peak_equity) * 100
            drawdown_dollars = self.peak_equity - equity

            # Update max drawdown
            if drawdown_pct > self.max_drawdown_pct:
                self.max_drawdown_pct = drawdown_pct
                self.max_drawdown_dollars = drawdown_dollars

            # Start new drawdown period if needed
            if self.current_drawdown is None:
                self.current_drawdown = DrawdownPeriod(
                    start_date=self.peak_date or timestamp,
                    start_equity=self.peak_equity,
                )

            # Update trough if this is lower
            if (
                self.current_drawdown.trough_equity is None
                or equity < self.current_drawdown.trough_equity
            ):
                self.current_drawdown.trough_date = timestamp
                self.current_drawdown.trough_equity = equity
                self.current_drawdown.max_drawdown_pct = drawdown_pct

            self.current_drawdown.duration_days = (
                timestamp - self.current_drawdown.start_date
            ).days

            # Check alerts
            if drawdown_pct >= self.max_drawdown_limit:
                alert = f"CRITICAL: Drawdown {drawdown_pct:.1f}% exceeds limit {self.max_drawdown_limit}%"
                logger.critical("drawdown_limit_breached", drawdown_pct=drawdown_pct)
            elif drawdown_pct >= self.alert_threshold:
                alert = f"WARNING: Drawdown {drawdown_pct:.1f}% exceeds threshold {self.alert_threshold}%"
                logger.warning("drawdown_threshold_breached", drawdown_pct=drawdown_pct)

        return alert

    def get_current_drawdown(self) -> float:
        """Get current drawdown percentage from peak."""
        if self.peak_equity == 0:
            return 0.0
        return ((self.peak_equity - self.current_equity) / self.peak_equity) * 100

    def get_stats(self) -> DrawdownStats:
        """Get comprehensive drawdown statistics."""
        all_periods = self.drawdown_periods.copy()
        if self.current_drawdown:
            all_periods.append(self.current_drawdown)

        # Calculate averages
        if all_periods:
            avg_dd = np.mean([p.max_drawdown_pct for p in all_periods])
            longest_dd = max(p.duration_days for p in all_periods)
            recovered = [p for p in all_periods if p.recovery_days is not None]
            avg_recovery = (
                np.mean([p.recovery_days for p in recovered]) if recovered else 0
            )
            total_underwater = sum(p.duration_days for p in all_periods)
        else:
            avg_dd = 0
            longest_dd = 0
            avg_recovery = 0
            total_underwater = 0

        return DrawdownStats(
            current_drawdown_pct=self.get_current_drawdown(),
            max_drawdown_pct=self.max_drawdown_pct,
            max_drawdown_dollars=self.max_drawdown_dollars,
            average_drawdown_pct=avg_dd,
            longest_drawdown_days=longest_dd,
            average_recovery_days=avg_recovery,
            total_underwater_days=total_underwater,
            drawdown_periods=all_periods,
            peak_equity=self.peak_equity,
            current_equity=self.current_equity,
        )

    def get_underwater_curve(self) -> List[Tuple[datetime, float]]:
        """Get underwater curve (drawdown at each point)."""
        if not self.equity_curve:
            return []

        underwater = []
        running_peak = self.equity_curve[0][1]

        for timestamp, equity in self.equity_curve:
            if equity > running_peak:
                running_peak = equity
            dd_pct = (
                ((running_peak - equity) / running_peak) * 100
                if running_peak > 0
                else 0
            )
            underwater.append((timestamp, -dd_pct))  # Negative for plotting below zero

        return underwater

    def should_halt(self) -> bool:
        """Check if trading should be halted due to drawdown."""
        return self.get_current_drawdown() >= self.max_drawdown_limit

    def reset(self, new_capital: Optional[float] = None):
        """Reset monitor for new backtest run."""
        capital = new_capital if new_capital else self.initial_capital
        self.initial_capital = capital
        self.equity_curve = []
        self.peak_equity = capital
        self.peak_date = None
        self.current_equity = capital
        self.drawdown_periods = []
        self.current_drawdown = None
        self.max_drawdown_pct = 0.0
        self.max_drawdown_dollars = 0.0
        logger.info("drawdown_monitor_reset", capital=capital)
