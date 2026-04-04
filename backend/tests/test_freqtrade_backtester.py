"""Tests for freqtrade/backtester.py."""

from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest
from app.freqtrade.backtester import BacktestConfig, Backtester, BacktestResult, Trade


class FakeStrategy:
    stoploss = -0.10
    minimal_roi = {"0": 0.05, "30": 0.02}

    def populate_indicators(self, df, meta):
        df["sma_10"] = df["close"].rolling(10).mean()
        return df

    def populate_entry_trend(self, df, meta):
        df["enter_long"] = 0
        df.loc[df["close"] > df["sma_10"], "enter_long"] = 1
        return df

    def populate_exit_trend(self, df, meta):
        df["exit_long"] = 0
        df.loc[df["close"] < df["sma_10"], "exit_long"] = 1
        return df


class NoSignalStrategy:
    stoploss = -0.10
    minimal_roi = {}

    def populate_indicators(self, df, m):
        return df

    def populate_entry_trend(self, df, m):
        df["enter_long"] = 0
        return df

    def populate_exit_trend(self, df, m):
        df["exit_long"] = 0
        return df


class AlwaysEnterStrategy:
    stoploss = -0.99
    minimal_roi = {}

    def populate_indicators(self, df, m):
        return df

    def populate_entry_trend(self, df, m):
        df["enter_long"] = 1
        return df

    def populate_exit_trend(self, df, m):
        df["exit_long"] = 0
        return df


def _df(n=100, start=100.0, trend=0.001, noise=0.5):
    np.random.seed(42)
    dates = [datetime(2025, 1, 1) + timedelta(minutes=5 * i) for i in range(n)]
    prices = [start]
    for i in range(1, n):
        prices.append(prices[-1] + trend + np.random.normal(0, noise))
    return pd.DataFrame(
        {
            "date": dates,
            "open": prices,
            "high": [p + abs(np.random.normal(0, 0.5)) for p in prices],
            "low": [p - abs(np.random.normal(0, 0.5)) for p in prices],
            "close": prices,
            "volume": [np.random.randint(100, 10000) for _ in prices],
        }
    )


class TestBacktestConfig:
    def test_defaults(self):
        c = BacktestConfig()
        assert c.timeframe == "5m" and c.starting_balance == 10000

    def test_custom(self):
        assert BacktestConfig(timeframe="15m", stake_amount=500).timeframe == "15m"


class TestTrade:
    def test_defaults(self):
        t = Trade(
            id="t1",
            pair="BTC/USD",
            is_short=False,
            entry_time=datetime(2025, 1, 1),
            entry_price=50000,
            stake_amount=100,
        )
        assert t.exit_time is None and t.profit_abs == 0.0


class TestBacktestResult:
    def test_fields(self):
        r = BacktestResult(
            strategy_name="t",
            timeframe="5m",
            start_date=datetime(2025, 1, 1),
            end_date=datetime(2025, 1, 2),
            starting_balance=10000,
            final_balance=10500,
            total_profit_pct=5.0,
            total_trades=10,
            winning_trades=7,
            losing_trades=3,
            win_rate=70.0,
            avg_profit_per_trade=0.5,
            best_trade_pct=5.0,
            worst_trade_pct=-2.0,
            max_drawdown_pct=3.0,
            sharpe_ratio=1.5,
            sortino_ratio=1.2,
            profit_factor=2.5,
        )
        assert r.total_trades == 10


class TestBacktester:
    def test_default_config(self):
        assert Backtester().config.starting_balance == 10000

    def test_custom_config(self):
        assert (
            Backtester(BacktestConfig(starting_balance=50000)).config.starting_balance
            == 50000
        )

    def test_run_basic(self):
        r = Backtester().run_backtest(
            FakeStrategy(), _df(100, trend=0.1), "BTC/USD", "Fake"
        )
        assert isinstance(r, BacktestResult) and r.strategy_name == "Fake"

    def test_result_stored(self):
        bt = Backtester()
        bt.run_backtest(FakeStrategy(), _df(), "BTC/USD", "My")
        assert "My" in bt._results

    def test_no_trades(self):
        r = Backtester().run_backtest(NoSignalStrategy(), _df(50), "BTC/USD", "NoSig")
        assert r.total_trades == 0 and r.final_balance == 10000

    def test_always_enter(self):
        r = Backtester(BacktestConfig(max_open_trades=3)).run_backtest(
            AlwaysEnterStrategy(), _df(50, trend=0.05), "BTC/USD", "Always"
        )
        assert r.total_trades > 0
        for t in r.trades:
            assert t.exit_time is not None

    def test_equity_curve_len(self):
        df = _df(50)
        r = Backtester().run_backtest(FakeStrategy(), df, "BTC/USD", "T")
        assert len(r.equity_curve) == len(df)

    def test_max_dd_non_negative(self):
        assert (
            Backtester()
            .run_backtest(FakeStrategy(), _df(100), "BTC/USD", "T")
            .max_drawdown_pct
            >= 0
        )

    def test_fee_impact(self):
        df = _df(100, trend=0.1)
        r1 = Backtester(BacktestConfig(fee_rate=0.01)).run_backtest(
            FakeStrategy(), df.copy(), "B", "Hi"
        )
        r2 = Backtester(BacktestConfig(fee_rate=0.0001)).run_backtest(
            FakeStrategy(), df.copy(), "B", "Lo"
        )
        assert r1.final_balance <= r2.final_balance

    def test_stoploss(self):
        n = 40
        dates = [datetime(2025, 1, 1) + timedelta(minutes=5 * i) for i in range(n)]
        prices = list(range(100, 120)) + list(range(120, 100, -1))
        df = pd.DataFrame(
            {
                "date": dates,
                "open": prices,
                "high": [p + 1 for p in prices],
                "low": [p - 1 for p in prices],
                "close": prices,
                "volume": [1000] * n,
            }
        )
        s = FakeStrategy()
        s.stoploss = -0.05
        assert isinstance(
            Backtester().run_backtest(s, df, "BTC/USD", "SL"), BacktestResult
        )


class TestCalcMetrics:
    def test_empty(self):
        r = Backtester()._calculate_metrics("t", "B", _df(10), [], [10000] * 3, 10000)
        assert r.total_trades == 0 and r.sharpe_ratio == 0

    def test_with_trades(self):
        trades = [
            Trade(
                id="t1",
                pair="B",
                is_short=False,
                entry_time=datetime(2025, 1, 1),
                entry_price=100,
                stake_amount=100,
                exit_time=datetime(2025, 1, 1, 0, 30),
                exit_price=110,
                profit_pct=0.098,
                profit_abs=9.8,
                exit_reason="roi",
            ),
            Trade(
                id="t2",
                pair="B",
                is_short=False,
                entry_time=datetime(2025, 1, 1, 1),
                entry_price=110,
                stake_amount=100,
                exit_time=datetime(2025, 1, 1, 1, 30),
                exit_price=105,
                profit_pct=-0.047,
                profit_abs=-4.7,
                exit_reason="sl",
            ),
        ]
        r = Backtester()._calculate_metrics(
            "t", "B", _df(10), trades, [10000, 10010, 10005], 10005.1
        )
        assert r.total_trades == 2 and r.winning_trades == 1
