"""
Tests for app.services.backtesting — BacktestEngine, HistoricalDataProvider,
and all supporting dataclasses.

No external database or API connections required.
"""

import asyncio
import random
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from app.models.domain import BookType, OrderSide, TradeIntent
from app.services.backtesting import (
    BacktestConfig,
    BacktestEngine,
    BacktestMetrics,
    BacktestResult,
    BacktestTrade,
    HistoricalDataProvider,
    backtest_engine,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def provider():
    return HistoricalDataProvider()


@pytest.fixture
def engine():
    return BacktestEngine()


@pytest.fixture
def default_config():
    return BacktestConfig(
        strategy_id=uuid4(),
        book_id=uuid4(),
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 3),
        initial_capital=100_000.0,
        instruments=["BTC-USD"],
    )


@pytest.fixture
def short_config():
    """Very short time window — produces fewer bars for fast tests."""
    return BacktestConfig(
        strategy_id=uuid4(),
        book_id=uuid4(),
        start_date=datetime(2024, 6, 1, 0, 0),
        end_date=datetime(2024, 6, 1, 6, 0),  # 6 hours
        initial_capital=50_000.0,
        instruments=["ETH-USD"],
    )


# ---------------------------------------------------------------------------
# Dataclass construction tests
# ---------------------------------------------------------------------------


class TestDataclasses:
    def test_backtest_config_defaults(self):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 2, 1),
        )
        assert cfg.initial_capital == 100_000.0
        assert cfg.max_position_size == 0.1
        assert cfg.slippage_bps == 5.0
        assert cfg.commission_bps == 10.0
        assert cfg.instruments == ["BTC-USD", "ETH-USD"]

    def test_backtest_config_custom(self):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 2, 1),
            initial_capital=500_000,
            max_position_size=0.05,
            slippage_bps=2.0,
            commission_bps=8.0,
            instruments=["SOL-USD", "ADA-USD"],
        )
        assert cfg.initial_capital == 500_000
        assert cfg.instruments == ["SOL-USD", "ADA-USD"]

    def test_backtest_trade_defaults(self):
        t = BacktestTrade(
            id=uuid4(),
            timestamp=datetime.utcnow(),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=0.5,
            entry_price=45_000.0,
        )
        assert t.exit_price is None
        assert t.pnl == 0.0
        assert t.pnl_pct == 0.0
        assert t.commission == 0.0
        assert t.slippage == 0.0
        assert t.holding_period_hours == 0.0

    def test_backtest_metrics_defaults(self):
        m = BacktestMetrics()
        assert m.total_return == 0.0
        assert m.total_trades == 0
        assert m.daily_returns == []
        assert m.equity_curve == []

    def test_backtest_result_defaults(self):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 2, 1),
        )
        r = BacktestResult(
            id=uuid4(),
            config=cfg,
            metrics=BacktestMetrics(),
            trades=[],
        )
        assert r.status == "pending"
        assert r.signals_generated == 0
        assert r.error_message is None


# ---------------------------------------------------------------------------
# HistoricalDataProvider tests
# ---------------------------------------------------------------------------


class TestHistoricalDataProvider:
    def test_generate_ohlcv_returns_data(self, provider):
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 1, 1),
            datetime(2024, 1, 1, 12, 0),
            timeframe_minutes=60,
        )
        # 12 hours → at least 12 bars
        assert len(data) >= 12

    def test_generate_ohlcv_bar_structure(self, provider):
        data = provider.generate_ohlcv(
            "ETH-USD",
            datetime(2024, 1, 1),
            datetime(2024, 1, 1, 3, 0),
        )
        bar = data[0]
        for key in ("timestamp", "open", "high", "low", "close", "volume", "vwap"):
            assert key in bar, f"Missing key: {key}"
        assert bar["high"] >= bar["open"]
        assert bar["high"] >= bar["close"]
        assert bar["low"] <= bar["open"]
        assert bar["low"] <= bar["close"]

    def test_generate_ohlcv_unknown_instrument_uses_defaults(self, provider):
        data = provider.generate_ohlcv(
            "UNKNOWN-COIN",
            datetime(2024, 1, 1),
            datetime(2024, 1, 1, 2, 0),
        )
        assert len(data) > 0
        assert data[0]["open"] > 0

    def test_generate_ohlcv_all_profiles(self, provider):
        """Exercise all built-in instrument profiles."""
        for instrument in ("BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD"):
            data = provider.generate_ohlcv(
                instrument,
                datetime(2024, 1, 1),
                datetime(2024, 1, 1, 2, 0),
            )
            assert len(data) > 0

    def test_generate_ohlcv_short_timeframe(self, provider):
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 1, 1),
            datetime(2024, 1, 1, 1, 0),
            timeframe_minutes=5,
        )
        assert len(data) >= 12  # 60 / 5 = 12

    def test_generate_ohlcv_prices_positive(self, provider):
        random.seed(42)
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 1, 1),
            datetime(2024, 1, 5),
        )
        for bar in data:
            assert bar["close"] > 0
            assert bar["open"] > 0
            assert bar["volume"] > 0

    def test_get_price_at_time_exact(self, provider):
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 1, 1, 0, 0),
            datetime(2024, 1, 1, 5, 0),
        )
        ts = datetime.fromisoformat(data[0]["timestamp"])
        price = provider.get_price_at_time("BTC-USD", ts, data)
        assert price == data[0]["close"]

    def test_get_price_at_time_after_last_bar(self, provider):
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 1, 1, 0, 0),
            datetime(2024, 1, 1, 2, 0),
        )
        # Far-future timestamp should return last close
        price = provider.get_price_at_time("BTC-USD", datetime(2025, 1, 1), data)
        assert price == data[-1]["close"]

    def test_get_price_at_time_empty_data(self, provider):
        price = provider.get_price_at_time("BTC-USD", datetime(2024, 1, 1), [])
        assert price is None

    def test_get_price_at_time_before_first_bar(self, provider):
        data = provider.generate_ohlcv(
            "BTC-USD",
            datetime(2024, 6, 1, 0, 0),
            datetime(2024, 6, 1, 3, 0),
        )
        # Before the first bar
        price = provider.get_price_at_time("BTC-USD", datetime(2023, 1, 1), data)
        assert price == data[0]["close"]

    def test_cache_initialized_empty(self, provider):
        assert provider._cache == {}


# ---------------------------------------------------------------------------
# BacktestEngine — private helper method tests
# ---------------------------------------------------------------------------


class TestBacktestEngineHelpers:
    """Test private/internal methods of the engine directly."""

    def test_should_execute_intent_approved(self, engine, default_config):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5_000,
            max_loss_usd=500,
            confidence=0.7,
        )
        assert engine._should_execute_intent(intent, 100_000, default_config) is True

    def test_should_execute_intent_low_confidence_rejected(
        self, engine, default_config
    ):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5_000,
            max_loss_usd=500,
            confidence=0.2,
        )
        assert engine._should_execute_intent(intent, 100_000, default_config) is False

    def test_should_execute_intent_oversized_rejected(self, engine, default_config):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=50_000,  # > 10% of 100k
            max_loss_usd=5_000,
            confidence=0.8,
        )
        assert engine._should_execute_intent(intent, 100_000, default_config) is False

    def test_should_execute_intent_zero_exposure_rejected(self, engine, default_config):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=0,
            max_loss_usd=0,
            confidence=0.8,
        )
        assert engine._should_execute_intent(intent, 100_000, default_config) is False

    def test_execute_intent_buy(self, engine, default_config):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5_000,
            max_loss_usd=500,
            confidence=0.7,
        )
        bar = {"close": 45_000, "volume": 1_000_000, "vwap": 45_000}
        ts = datetime(2024, 1, 1, 10, 0)
        trade = engine._execute_intent(intent, bar, ts, default_config, 100_000)

        assert trade.side == OrderSide.BUY
        assert trade.entry_price > bar["close"]  # slippage adds to buy
        assert trade.size > 0
        assert trade.commission > 0
        assert trade.slippage > 0

    def test_execute_intent_sell(self, engine, default_config):
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.SELL,
            target_exposure_usd=5_000,
            max_loss_usd=500,
            confidence=0.7,
        )
        bar = {"close": 45_000, "volume": 1_000_000, "vwap": 45_000}
        ts = datetime(2024, 1, 1, 10, 0)
        trade = engine._execute_intent(intent, bar, ts, default_config, 100_000)

        assert trade.side == OrderSide.SELL
        assert trade.entry_price < bar["close"]  # slippage subtracts for sell

    def test_execute_intent_position_sizing_capped(self, engine, default_config):
        """Size is capped at max_position_size fraction of equity."""
        intent = TradeIntent(
            book_id=default_config.book_id,
            strategy_id=default_config.strategy_id,
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=9_999,  # Just under 10% of 100k
            max_loss_usd=1_000,
            confidence=0.8,
        )
        bar = {"close": 45_000, "volume": 1_000_000, "vwap": 45_000}
        trade = engine._execute_intent(
            intent, bar, datetime(2024, 1, 1), default_config, 100_000
        )
        max_size = 100_000 * default_config.max_position_size / trade.entry_price
        assert trade.size <= max_size + 1e-10  # float tolerance

    def test_calculate_pnl_buy_profit(self, engine, default_config):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=45_000,
            exit_price=46_000,
            commission=0,
            slippage=0,
        )
        pnl = engine._calculate_pnl(trade, default_config)
        # gross = (46000 - 45000) * 1 = 1000, minus commissions+slippage
        assert pnl < 1_000  # some gets deducted
        assert pnl > 0

    def test_calculate_pnl_sell_profit(self, engine, default_config):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.SELL,
            size=1.0,
            entry_price=46_000,
            exit_price=45_000,
            commission=0,
            slippage=0,
        )
        pnl = engine._calculate_pnl(trade, default_config)
        assert pnl > 0

    def test_calculate_pnl_buy_loss(self, engine, default_config):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=46_000,
            exit_price=45_000,
            commission=0,
            slippage=0,
        )
        pnl = engine._calculate_pnl(trade, default_config)
        assert pnl < 0

    def test_calculate_pnl_no_exit(self, engine, default_config):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=45_000,
            exit_price=None,
            commission=0,
            slippage=0,
        )
        pnl = engine._calculate_pnl(trade, default_config)
        assert pnl == 0.0

    def test_calculate_unrealized_pnl_buy(self, engine):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=2.0,
            entry_price=45_000,
        )
        pnl = engine._calculate_unrealized_pnl(trade, 46_000)
        assert pnl == 2_000.0  # (46000 - 45000) * 2

    def test_calculate_unrealized_pnl_sell(self, engine):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.SELL,
            size=2.0,
            entry_price=46_000,
        )
        pnl = engine._calculate_unrealized_pnl(trade, 45_000)
        assert pnl == 2_000.0  # (46000 - 45000) * 2

    def test_calculate_unrealized_pnl_negative(self, engine):
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=46_000,
        )
        pnl = engine._calculate_unrealized_pnl(trade, 45_000)
        assert pnl == -1_000.0


# ---------------------------------------------------------------------------
# BacktestEngine._calculate_metrics tests
# ---------------------------------------------------------------------------


class TestCalculateMetrics:
    def test_empty_trades(self, engine):
        metrics = engine._calculate_metrics(
            trades=[],
            equity_curve=[],
            daily_returns=[],
            config=BacktestConfig(
                strategy_id=uuid4(),
                book_id=uuid4(),
                start_date=datetime(2024, 1, 1),
                end_date=datetime(2024, 2, 1),
            ),
        )
        assert metrics.total_trades == 0
        assert metrics.total_return == 0.0

    def test_single_winning_trade(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 3),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=45_000,
            exit_price=46_000,
            pnl=1_000,
            pnl_pct=2.22,
            commission=10,
            slippage=5,
            holding_period_hours=24.0,
        )
        eq = [
            (datetime(2024, 1, 1), 100_000),
            (datetime(2024, 1, 2), 101_000),
        ]
        m = engine._calculate_metrics([trade], eq, [0.01], cfg)
        assert m.total_trades == 1
        assert m.winning_trades == 1
        assert m.losing_trades == 0
        assert m.win_rate == 100.0
        assert m.total_return == 1_000
        assert m.avg_holding_period_hours == 24.0

    def test_mixed_trades(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 5),
            initial_capital=100_000,
        )
        winner = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1.0,
            entry_price=45_000,
            pnl=2_000,
            holding_period_hours=12,
        )
        loser = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 2),
            instrument="ETH-USD",
            side=OrderSide.BUY,
            size=10.0,
            entry_price=2_800,
            pnl=-500,
            holding_period_hours=6,
        )
        eq = [
            (datetime(2024, 1, 1), 100_000),
            (datetime(2024, 1, 2), 102_000),
            (datetime(2024, 1, 3), 101_500),
        ]
        m = engine._calculate_metrics([winner, loser], eq, [0.02, -0.005], cfg)
        assert m.total_trades == 2
        assert m.winning_trades == 1
        assert m.losing_trades == 1
        assert m.win_rate == 50.0
        assert m.profit_factor == 4.0  # 2000 / 500
        assert m.avg_trade_pnl == 750  # (2000 - 500) / 2
        assert m.avg_win == 2_000
        assert m.avg_loss == -500

    def test_sharpe_and_sortino_computed(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 10),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=500,
            holding_period_hours=48,
        )
        daily_returns = [0.01, -0.005, 0.008, 0.002, -0.003, 0.006, -0.001]
        eq = [(datetime(2024, 1, 1), 100_000), (datetime(2024, 1, 10), 100_500)]
        m = engine._calculate_metrics([trade], eq, daily_returns, cfg)
        # Just check that Sharpe/Sortino are non-zero real numbers
        assert isinstance(m.sharpe_ratio, float)
        assert isinstance(m.sortino_ratio, float)

    def test_drawdown_calculation(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 5),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=-5_000,
            holding_period_hours=24,
        )
        eq = [
            (datetime(2024, 1, 1), 100_000),
            (datetime(2024, 1, 2), 105_000),  # peak
            (datetime(2024, 1, 3), 95_000),  # drawdown of 10_000 from peak
        ]
        m = engine._calculate_metrics([trade], eq, [0.05, -0.095], cfg)
        assert m.max_drawdown == 10_000
        assert m.max_drawdown_pct == 10.0

    def test_calmar_ratio(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 5),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=2_000,
            holding_period_hours=24,
        )
        eq = [
            (datetime(2024, 1, 1), 100_000),
            (datetime(2024, 1, 2), 102_000),
            (datetime(2024, 1, 3), 101_000),
        ]
        m = engine._calculate_metrics([trade], eq, [0.02, -0.01], cfg)
        # calmar = total_pnl / max_drawdown = 2000 / 1000 = 2.0
        assert m.calmar_ratio == 2.0

    def test_no_daily_returns(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 2),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=100,
            holding_period_hours=1,
        )
        eq = [(datetime(2024, 1, 1), 100_000), (datetime(2024, 1, 2), 100_100)]
        m = engine._calculate_metrics([trade], eq, [], cfg)
        assert m.sharpe_ratio == 0
        assert m.sortino_ratio == 0

    def test_all_losing_trades(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 5),
            initial_capital=100_000,
        )
        t1 = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=-300,
            holding_period_hours=12,
        )
        t2 = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 2),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=-200,
            holding_period_hours=6,
        )
        eq = [
            (datetime(2024, 1, 1), 100_000),
            (datetime(2024, 1, 3), 99_500),
        ]
        m = engine._calculate_metrics([t1, t2], eq, [-0.003, -0.002], cfg)
        assert m.winning_trades == 0
        assert m.win_rate == 0.0
        assert m.profit_factor == float("inf") or m.profit_factor == 0.0
        # gross_profit=0, gross_loss=500 → profit_factor = 0/500 = 0
        # Actually: profit_factor = 0 / 500 → but code only checks gross_loss > 0
        # gross_profit = 0, so profit_factor = 0/500 = 0.0
        assert m.profit_factor == 0.0

    def test_single_daily_return(self, engine):
        """Single daily return means stdev computation falls back to 0.01."""
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 3),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=100,
            holding_period_hours=24,
        )
        eq = [(datetime(2024, 1, 1), 100_000), (datetime(2024, 1, 2), 100_100)]
        m = engine._calculate_metrics([trade], eq, [0.001], cfg)
        assert isinstance(m.sharpe_ratio, float)

    def test_only_negative_daily_returns_single(self, engine):
        """Single negative daily return means downside_std falls back to 0.01."""
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 3),
            initial_capital=100_000,
        )
        trade = BacktestTrade(
            id=uuid4(),
            timestamp=datetime(2024, 1, 1),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            entry_price=45_000,
            pnl=-200,
            holding_period_hours=24,
        )
        eq = [(datetime(2024, 1, 1), 100_000), (datetime(2024, 1, 2), 99_800)]
        # One negative return → len(downside_returns) == 1 → downside_std = 0.01
        m = engine._calculate_metrics([trade], eq, [-0.002], cfg)
        assert isinstance(m.sortino_ratio, float)


# ---------------------------------------------------------------------------
# BacktestEngine.get_running_backtest tests
# ---------------------------------------------------------------------------


class TestGetRunningBacktest:
    def test_get_missing_backtest(self, engine):
        assert engine.get_running_backtest(uuid4()) is None

    def test_get_existing_backtest(self, engine):
        bid = uuid4()
        result = BacktestResult(
            id=bid,
            config=BacktestConfig(
                strategy_id=uuid4(),
                book_id=uuid4(),
                start_date=datetime(2024, 1, 1),
                end_date=datetime(2024, 2, 1),
            ),
            metrics=BacktestMetrics(),
            trades=[],
        )
        engine._running_backtests[bid] = result
        assert engine.get_running_backtest(bid) is result


# ---------------------------------------------------------------------------
# BacktestEngine.run_backtest (full integration-style, mocking the strategy)
# ---------------------------------------------------------------------------


class TestRunBacktest:
    """Full run_backtest tests with a mock strategy class."""

    @staticmethod
    def _make_strategy_class(side=OrderSide.BUY, confidence=0.7, exposure=5_000):
        """Create a fake strategy class that always returns an intent."""

        class FakeStrategy:
            def __init__(self, strategy_id, book_id, config):
                self.strategy_id = strategy_id
                self.book_id = book_id

            async def generate_intent(self, instrument, venue, book, market_data):
                return TradeIntent(
                    book_id=self.book_id,
                    strategy_id=self.strategy_id,
                    instrument=instrument,
                    direction=side,
                    target_exposure_usd=exposure,
                    max_loss_usd=500,
                    confidence=confidence,
                )

        return FakeStrategy

    @staticmethod
    def _make_none_strategy_class():
        """Strategy that returns no intents."""

        class NoSignalStrategy:
            def __init__(self, strategy_id, book_id, config):
                pass

            async def generate_intent(self, instrument, venue, book, market_data):
                return None

        return NoSignalStrategy

    @staticmethod
    def _make_error_strategy_class():
        """Strategy that always raises."""

        class ErrorStrategy:
            def __init__(self, strategy_id, book_id, config):
                pass

            async def generate_intent(self, instrument, venue, book, market_data):
                raise RuntimeError("Strategy error")

        return ErrorStrategy

    def test_run_backtest_with_signals(self, engine, short_config):
        strategy_cls = self._make_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert result.status == "completed"
        assert result.signals_generated > 0
        assert result.metrics.total_trades >= 0
        assert result.end_time is not None

    def test_run_backtest_no_signals(self, engine, short_config):
        strategy_cls = self._make_none_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert result.status == "completed"
        assert result.signals_generated == 0
        assert result.metrics.total_trades == 0

    def test_run_backtest_strategy_errors(self, engine, short_config):
        strategy_cls = self._make_error_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        # Strategy errors are caught per-bar, so backtest still completes
        assert result.status == "completed"

    def test_run_backtest_low_confidence_rejected(self, engine, short_config):
        strategy_cls = self._make_strategy_class(confidence=0.1)
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert result.status == "completed"
        assert result.signals_rejected == result.signals_generated

    def test_run_backtest_sell_side(self, engine, short_config):
        strategy_cls = self._make_strategy_class(side=OrderSide.SELL)
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert result.status == "completed"

    def test_run_backtest_multi_instrument(self, engine):
        cfg = BacktestConfig(
            strategy_id=uuid4(),
            book_id=uuid4(),
            start_date=datetime(2024, 6, 1, 0, 0),
            end_date=datetime(2024, 6, 1, 3, 0),
            initial_capital=100_000,
            instruments=["BTC-USD", "ETH-USD"],
        )
        strategy_cls = self._make_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(cfg, strategy_cls)
        )
        assert result.status == "completed"

    def test_run_backtest_stored_in_running(self, engine, short_config):
        strategy_cls = self._make_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert engine.get_running_backtest(result.id) is result

    def test_run_backtest_equity_curve_populated(self, engine, short_config):
        strategy_cls = self._make_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, strategy_cls)
        )
        assert len(result.metrics.equity_curve) > 0

    def test_run_backtest_with_strategy_config(self, engine, short_config):
        strategy_cls = self._make_strategy_class()
        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(
                short_config, strategy_cls, strategy_config={"lookback": 14}
            )
        )
        assert result.status == "completed"

    def test_run_backtest_constructor_failure(self, engine, short_config):
        """Strategy that fails during construction → backtest fails gracefully."""

        class BadConstructor:
            def __init__(self, strategy_id, book_id, config):
                raise ValueError("Bad config")

        result = asyncio.get_event_loop().run_until_complete(
            engine.run_backtest(short_config, BadConstructor)
        )
        assert result.status == "failed"
        assert result.error_message is not None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------


class TestSingleton:
    def test_backtest_engine_singleton_exists(self):
        assert backtest_engine is not None
        assert isinstance(backtest_engine, BacktestEngine)
