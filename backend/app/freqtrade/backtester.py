"""
FreqTrade Backtester - Professional Backtesting Engine

Provides comprehensive backtesting capabilities:
- Historical data replay
- Strategy performance analysis
- Risk metrics calculation
- Trade simulation
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class BacktestConfig:
    """Backtesting configuration."""

    timeframe: str = "5m"
    stake_amount: float = 100
    stake_currency: str = "USDT"
    max_open_trades: int = 5
    starting_balance: float = 10000
    fee_rate: float = 0.001  # 0.1%
    enable_protections: bool = True


@dataclass
class Trade:
    """Simulated trade."""

    id: str
    pair: str
    is_short: bool
    entry_time: datetime
    entry_price: float
    stake_amount: float
    exit_time: Optional[datetime] = None
    exit_price: Optional[float] = None
    profit_abs: float = 0.0
    profit_pct: float = 0.0
    exit_reason: str = ""


@dataclass
class BacktestResult:
    """Backtesting results."""

    strategy_name: str
    timeframe: str
    start_date: datetime
    end_date: datetime
    starting_balance: float
    final_balance: float
    total_profit_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_profit_per_trade: float
    best_trade_pct: float
    worst_trade_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    profit_factor: float
    trades: List[Trade] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)


class Backtester:
    """
    Professional Backtesting Engine.

    Simulates strategy execution on historical data
    with realistic trade execution and fee modeling.
    """

    def __init__(self, config: Optional[BacktestConfig] = None):
        self.config = config or BacktestConfig()
        self._results: Dict[str, BacktestResult] = {}

    def run_backtest(
        self,
        strategy: Any,
        data: pd.DataFrame,
        pair: str,
        strategy_name: str = "Unknown",
    ) -> BacktestResult:
        """Run backtest on historical data."""
        logger.info(f"Running backtest for {strategy_name} on {pair}")

        # Initialize
        balance = self.config.starting_balance
        trades: List[Trade] = []
        open_trades: List[Trade] = []
        equity_curve = [balance]
        trade_counter = 0

        # Populate indicators
        df = strategy.populate_indicators(data.copy(), {"pair": pair})
        df = strategy.populate_entry_trend(df, {"pair": pair})
        df = strategy.populate_exit_trend(df, {"pair": pair})

        # Iterate through candles
        for i in range(1, len(df)):
            row = df.iloc[i]
            prev_row = df.iloc[i - 1]
            current_time = row["date"]
            current_price = row["close"]

            # Check exits for open trades
            for trade in open_trades[:]:
                should_exit = False
                exit_reason = ""

                # Check exit signal
                if prev_row.get("exit_long", 0) == 1 and not trade.is_short:
                    should_exit = True
                    exit_reason = "exit_signal"

                # Check stoploss
                stoploss = getattr(strategy, "stoploss", -0.1)
                if not trade.is_short:
                    pnl_pct = (current_price - trade.entry_price) / trade.entry_price
                    if pnl_pct <= stoploss:
                        should_exit = True
                        exit_reason = "stoploss"

                # Check ROI
                minimal_roi = getattr(strategy, "minimal_roi", {})
                trade_duration = (current_time - trade.entry_time).total_seconds() / 60
                for roi_time, roi_value in sorted(
                    minimal_roi.items(), key=lambda x: int(x[0])
                ):
                    if trade_duration >= int(roi_time):
                        if pnl_pct >= roi_value:
                            should_exit = True
                            exit_reason = f"roi_{roi_time}"

                if should_exit:
                    trade.exit_time = current_time
                    trade.exit_price = current_price
                    trade.exit_reason = exit_reason

                    # Calculate profit
                    if trade.is_short:
                        trade.profit_pct = (
                            trade.entry_price - current_price
                        ) / trade.entry_price
                    else:
                        trade.profit_pct = (
                            current_price - trade.entry_price
                        ) / trade.entry_price

                    # Apply fees
                    trade.profit_pct -= self.config.fee_rate * 2
                    trade.profit_abs = trade.stake_amount * trade.profit_pct

                    balance += trade.stake_amount + trade.profit_abs
                    open_trades.remove(trade)

            # Check entry signals
            if len(open_trades) < self.config.max_open_trades:
                if prev_row.get("enter_long", 0) == 1:
                    if balance >= self.config.stake_amount:
                        trade_counter += 1
                        trade = Trade(
                            id=f"trade_{trade_counter}",
                            pair=pair,
                            is_short=False,
                            entry_time=current_time,
                            entry_price=current_price,
                            stake_amount=self.config.stake_amount,
                        )
                        open_trades.append(trade)
                        trades.append(trade)
                        balance -= self.config.stake_amount

            # Update equity curve
            open_value = sum(
                t.stake_amount * (1 + (current_price - t.entry_price) / t.entry_price)
                for t in open_trades
            )
            equity_curve.append(balance + open_value)

        # Close remaining trades at end
        for trade in open_trades:
            trade.exit_time = df.iloc[-1]["date"]
            trade.exit_price = df.iloc[-1]["close"]
            trade.exit_reason = "end_of_backtest"
            trade.profit_pct = (
                trade.exit_price - trade.entry_price
            ) / trade.entry_price - self.config.fee_rate * 2
            trade.profit_abs = trade.stake_amount * trade.profit_pct
            balance += trade.stake_amount + trade.profit_abs

        # Calculate metrics
        result = self._calculate_metrics(
            strategy_name, pair, df, trades, equity_curve, balance
        )

        self._results[strategy_name] = result
        return result

    def _calculate_metrics(
        self,
        strategy_name: str,
        pair: str,
        df: pd.DataFrame,
        trades: List[Trade],
        equity_curve: List[float],
        final_balance: float,
    ) -> BacktestResult:
        """Calculate backtest metrics."""
        winning = [t for t in trades if t.profit_pct > 0]
        losing = [t for t in trades if t.profit_pct <= 0]

        profits = [t.profit_pct for t in trades]

        # Max drawdown
        peak = equity_curve[0]
        max_dd = 0
        for value in equity_curve:
            if value > peak:
                peak = value
            dd = (peak - value) / peak
            max_dd = max(max_dd, dd)

        # Sharpe ratio (simplified)
        if len(profits) > 1:
            sharpe = np.mean(profits) / (np.std(profits) + 1e-10) * np.sqrt(252)
        else:
            sharpe = 0

        return BacktestResult(
            strategy_name=strategy_name,
            timeframe=self.config.timeframe,
            start_date=df.iloc[0]["date"],
            end_date=df.iloc[-1]["date"],
            starting_balance=self.config.starting_balance,
            final_balance=final_balance,
            total_profit_pct=(final_balance - self.config.starting_balance)
            / self.config.starting_balance
            * 100,
            total_trades=len(trades),
            winning_trades=len(winning),
            losing_trades=len(losing),
            win_rate=len(winning) / len(trades) * 100 if trades else 0,
            avg_profit_per_trade=np.mean(profits) * 100 if profits else 0,
            best_trade_pct=max(profits) * 100 if profits else 0,
            worst_trade_pct=min(profits) * 100 if profits else 0,
            max_drawdown_pct=max_dd * 100,
            sharpe_ratio=sharpe,
            sortino_ratio=sharpe * 0.8,  # Simplified
            profit_factor=sum(t.profit_abs for t in winning)
            / abs(sum(t.profit_abs for t in losing))
            if losing
            else float("inf"),
            trades=trades,
            equity_curve=equity_curve,
        )
