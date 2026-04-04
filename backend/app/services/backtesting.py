"""
Strategy Backtesting Module

Provides historical data replay and performance metrics for strategy evaluation.
"""

import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4

import structlog

from app.models.domain import Book, BookType, OrderSide, TradeIntent

logger = structlog.get_logger()


@dataclass
class BacktestConfig:
    """Configuration for a backtest run."""

    strategy_id: UUID
    book_id: UUID
    start_date: datetime
    end_date: datetime
    initial_capital: float = 100000.0
    max_position_size: float = 0.1  # 10% of capital
    slippage_bps: float = 5.0  # 5 bps slippage assumption
    commission_bps: float = 10.0  # 10 bps round-trip commission
    instruments: List[str] = field(default_factory=lambda: ["BTC-USD", "ETH-USD"])


@dataclass
class BacktestTrade:
    """A single trade in the backtest."""

    id: UUID
    timestamp: datetime
    instrument: str
    side: OrderSide
    size: float
    entry_price: float
    exit_price: Optional[float] = None
    exit_timestamp: Optional[datetime] = None
    pnl: float = 0.0
    pnl_pct: float = 0.0
    commission: float = 0.0
    slippage: float = 0.0
    holding_period_hours: float = 0.0


@dataclass
class BacktestMetrics:
    """Performance metrics from a backtest."""

    total_return: float = 0.0
    total_return_pct: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    avg_trade_pnl: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    avg_holding_period_hours: float = 0.0
    total_commission: float = 0.0
    total_slippage: float = 0.0
    calmar_ratio: float = 0.0
    daily_returns: List[float] = field(default_factory=list)
    equity_curve: List[Tuple[datetime, float]] = field(default_factory=list)


@dataclass
class BacktestResult:
    """Complete result of a backtest run."""

    id: UUID
    config: BacktestConfig
    metrics: BacktestMetrics
    trades: List[BacktestTrade]
    signals_generated: int = 0
    signals_executed: int = 0
    signals_rejected: int = 0
    start_time: datetime = field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    status: str = "pending"
    error_message: Optional[str] = None


class HistoricalDataProvider:
    """Provides simulated historical market data for backtesting."""

    def __init__(self):
        self._cache: Dict[str, List[Dict]] = {}

    def generate_ohlcv(
        self,
        instrument: str,
        start_date: datetime,
        end_date: datetime,
        timeframe_minutes: int = 60,
    ) -> List[Dict]:
        """Generate simulated OHLCV data for backtesting with realistic price dynamics."""

        # Base prices and characteristics for different instruments
        instrument_profiles = {
            "BTC-USD": {
                "base_price": 45000,
                "daily_volatility": 0.025,  # 2.5% daily volatility
                "trend_strength": 0.001,  # Slight upward trend
                "volume_base": 1500000000,  # $1.5B daily volume
                "market_cap": 850000000000,  # $850B market cap
            },
            "ETH-USD": {
                "base_price": 2800,
                "daily_volatility": 0.035,  # 3.5% daily volatility
                "trend_strength": 0.002,  # Moderate upward trend
                "volume_base": 800000000,  # $800M daily volume
                "market_cap": 340000000000,  # $340B market cap
            },
            "SOL-USD": {
                "base_price": 95,
                "daily_volatility": 0.08,  # 8% daily volatility
                "trend_strength": 0.005,  # Strong growth trend
                "volume_base": 200000000,  # $200M daily volume
                "market_cap": 42000000000,  # $42B market cap
            },
            "ADA-USD": {
                "base_price": 0.45,
                "daily_volatility": 0.06,  # 6% daily volatility
                "trend_strength": 0.001,  # Slight upward trend
                "volume_base": 150000000,  # $150M daily volume
                "market_cap": 16000000000,  # $16B market cap
            },
        }

        profile = instrument_profiles.get(
            instrument,
            {
                "base_price": 100,
                "daily_volatility": 0.04,
                "trend_strength": 0.001,
                "volume_base": 50000000,
                "market_cap": 1000000000,
            },
        )

        data = []
        current_time = start_date
        current_price = profile["base_price"]

        # Advanced price simulation parameters
        momentum = 0.0
        volatility_cluster = 1.0  # Volatility clustering effect
        trend_component = profile["trend_strength"]
        base_volatility = profile["daily_volatility"]

        # Market regime simulation (bull/bear/normal markets)
        regime_duration = 0
        current_regime = "normal"
        regime_multiplier = 1.0

        # Seasonality factors (crypto markets are 24/7)
        hourly_seasonality = [
            0.8,
            0.7,
            0.6,
            0.5,
            0.6,
            0.8,
            1.0,
            1.2,
            1.3,
            1.2,
            1.1,
            1.0,
            1.0,
            1.1,
            1.2,
            1.3,
            1.2,
            1.1,
            1.0,
            0.9,
            0.8,
            0.8,
            0.8,
            0.8,
        ]

        while current_time <= end_date:
            # Update market regime every ~30 days
            if regime_duration <= 0:
                regime_duration = random.randint(20, 40)  # 20-40 days
                regime_choice = random.choices(
                    ["bull", "bear", "normal"],
                    weights=[0.3, 0.2, 0.5],  # Bull markets less common
                )[0]

                if regime_choice != current_regime:
                    current_regime = regime_choice
                    if current_regime == "bull":
                        regime_multiplier = 1.5
                        trend_component = abs(profile["trend_strength"]) * 2
                    elif current_regime == "bear":
                        regime_multiplier = 2.0
                        trend_component = -abs(profile["trend_strength"]) * 1.5
                    else:  # normal
                        regime_multiplier = 1.0
                        trend_component = profile["trend_strength"]

            regime_duration -= 1

            # Hourly seasonality factor
            hour = current_time.hour
            seasonal_factor = hourly_seasonality[hour]

            # Update momentum with mean reversion
            momentum = momentum * 0.85 + random.gauss(0, 0.005)  # Slower decay

            # Volatility clustering (high vol periods tend to persist)
            vol_shock = abs(random.gauss(0, 0.5))
            volatility_cluster = volatility_cluster * 0.9 + vol_shock * 0.1
            current_volatility = (
                base_volatility
                * regime_multiplier
                * volatility_cluster
                * seasonal_factor
            )

            # Combined return components
            trend_return = trend_component / 24  # Distribute daily trend across hours
            momentum_return = momentum
            random_return = random.gauss(
                0, current_volatility / 24
            )  # Hourly volatility

            total_return = trend_return + momentum_return + random_return

            # Generate OHLC from return
            open_price = current_price
            close_price = max(0.01, open_price * (1 + total_return))  # Floor at $0.01

            # Generate realistic high/low based on volatility
            price_range = abs(total_return) + random.uniform(
                0.001, current_volatility / 12
            )
            high_price = max(open_price, close_price) * (1 + price_range)
            low_price = min(open_price, close_price) * (
                1 - price_range * 0.7
            )  # Lows less extreme

            # Volume generation with autocorrelation
            if not data:
                # Initialize volume
                last_volume = profile["volume_base"] / 24  # Hourly volume
            else:
                last_volume = data[-1]["volume"]

            # Volume correlated with volatility and price movement
            volume_multiplier = 1 + abs(total_return) * 3 + current_volatility * 2
            volume_noise = random.uniform(0.7, 1.3)
            volume = last_volume * volume_multiplier * volume_noise

            # Cap extreme volumes
            volume = min(
                volume, profile["volume_base"] / 6
            )  # Max 4x average hourly volume

            # VWAP calculation
            typical_price = (high_price + low_price + close_price) / 3
            vwap = (typical_price * volume) / volume if volume > 0 else typical_price

            data.append(
                {
                    "timestamp": current_time.isoformat(),
                    "open": round(open_price, 6),
                    "high": round(high_price, 6),
                    "low": round(low_price, 6),
                    "close": round(close_price, 6),
                    "volume": round(volume, 2),
                    "vwap": round(vwap, 6),
                }
            )

            current_price = close_price
            current_time += timedelta(minutes=timeframe_minutes)

        return data

    def get_price_at_time(
        self, instrument: str, timestamp: datetime, data: List[Dict]
    ) -> Optional[float]:
        """Get price at a specific timestamp."""
        for bar in data:
            bar_time = datetime.fromisoformat(bar["timestamp"])
            if bar_time >= timestamp:
                return bar["close"]
        return data[-1]["close"] if data else None


class BacktestEngine:
    """
    Backtest engine for strategy evaluation.

    Simulates strategy execution over historical data and calculates
    performance metrics.
    """

    def __init__(self):
        self.data_provider = HistoricalDataProvider()
        self._running_backtests: Dict[UUID, BacktestResult] = {}

    async def run_backtest(
        self, config: BacktestConfig, strategy_class: type, strategy_config: Dict = None
    ) -> BacktestResult:
        """Run a complete backtest simulation."""

        backtest_id = uuid4()
        result = BacktestResult(
            id=backtest_id,
            config=config,
            metrics=BacktestMetrics(),
            trades=[],
            status="running",
        )
        self._running_backtests[backtest_id] = result

        try:
            # Initialize strategy
            book = Book(
                id=config.book_id,
                name="Backtest Book",
                type=BookType.PROP,
                capital_allocated=config.initial_capital,
                current_exposure=0,
                max_drawdown_limit=10,
                risk_tier=1,
                status="active",
            )

            strategy = strategy_class(
                strategy_id=config.strategy_id,
                book_id=config.book_id,
                config=strategy_config or {},
            )

            # Generate historical data
            historical_data: Dict[str, List[Dict]] = {}
            for instrument in config.instruments:
                historical_data[instrument] = self.data_provider.generate_ohlcv(
                    instrument, config.start_date, config.end_date, timeframe_minutes=60
                )

            # Run simulation
            equity = config.initial_capital
            equity_curve = [(config.start_date, equity)]
            open_positions: Dict[str, BacktestTrade] = {}
            all_trades: List[BacktestTrade] = []
            daily_pnls: List[float] = []
            last_day_equity = equity
            current_day = config.start_date.date()

            # Get all timestamps
            all_bars = []
            for instrument, data in historical_data.items():
                for bar in data:
                    all_bars.append(
                        (datetime.fromisoformat(bar["timestamp"]), instrument, bar)
                    )
            all_bars.sort(key=lambda x: x[0])

            for timestamp, instrument, bar in all_bars:
                # Track daily PnL
                if timestamp.date() != current_day:
                    daily_pnl = equity - last_day_equity
                    daily_pnls.append(
                        daily_pnl / last_day_equity if last_day_equity > 0 else 0
                    )
                    last_day_equity = equity
                    current_day = timestamp.date()

                # Create market data dict
                market_data = {
                    "last": bar["close"],
                    "bid": bar["close"] * 0.9999,
                    "ask": bar["close"] * 1.0001,
                    "spread_bps": 2,
                    "volume_24h": bar["volume"] * 24,
                    "vwap": bar["vwap"],
                }

                # Generate intent from strategy
                try:
                    intent = await strategy.generate_intent(
                        instrument=instrument,
                        venue="backtest",
                        book=book,
                        market_data=market_data,
                    )

                    if intent:
                        result.signals_generated += 1

                        # Check if we should execute
                        if self._should_execute_intent(intent, equity, config):
                            trade = self._execute_intent(
                                intent, bar, timestamp, config, equity
                            )

                            if instrument in open_positions:
                                # Close existing position
                                existing = open_positions.pop(instrument)
                                existing.exit_price = bar["close"]
                                existing.exit_timestamp = timestamp
                                existing.holding_period_hours = (
                                    timestamp
                                    - datetime.fromisoformat(str(existing.timestamp))
                                ).total_seconds() / 3600
                                existing.pnl = self._calculate_pnl(existing, config)
                                existing.pnl_pct = (
                                    existing.pnl
                                    / (existing.entry_price * existing.size)
                                    * 100
                                )
                                all_trades.append(existing)
                                equity += existing.pnl

                            if trade.size > 0:
                                open_positions[instrument] = trade
                                result.signals_executed += 1
                        else:
                            result.signals_rejected += 1

                except Exception as e:
                    logger.warning("backtest_intent_error", error=str(e))

                # Update equity curve
                unrealized_pnl = sum(
                    self._calculate_unrealized_pnl(pos, bar["close"])
                    for pos in open_positions.values()
                    if pos.instrument == instrument
                )
                equity_curve.append((timestamp, equity + unrealized_pnl))

            # Close remaining positions
            for instrument, pos in open_positions.items():
                last_bar = historical_data[instrument][-1]
                pos.exit_price = last_bar["close"]
                pos.exit_timestamp = datetime.fromisoformat(last_bar["timestamp"])
                pos.pnl = self._calculate_pnl(pos, config)
                pos.pnl_pct = pos.pnl / (pos.entry_price * pos.size) * 100
                all_trades.append(pos)
                equity += pos.pnl

            # Calculate metrics
            result.trades = all_trades
            result.metrics = self._calculate_metrics(
                all_trades, equity_curve, daily_pnls, config
            )
            result.status = "completed"
            result.end_time = datetime.utcnow()

            logger.info(
                "backtest_completed",
                backtest_id=str(backtest_id),
                total_trades=len(all_trades),
                total_return_pct=result.metrics.total_return_pct,
            )

        except Exception as e:
            result.status = "failed"
            result.error_message = str(e)
            logger.error("backtest_failed", backtest_id=str(backtest_id), error=str(e))

        return result

    def _should_execute_intent(
        self, intent: TradeIntent, equity: float, config: BacktestConfig
    ) -> bool:
        """Determine if an intent should be executed based on risk rules."""
        # Position size check
        if intent.target_exposure_usd > equity * config.max_position_size:
            return False

        # Confidence threshold
        if intent.confidence < 0.3:
            return False

        # Zero exposure monitoring intents
        if intent.target_exposure_usd == 0:
            return False

        return True

    def _execute_intent(
        self,
        intent: TradeIntent,
        bar: Dict,
        timestamp: datetime,
        config: BacktestConfig,
        equity: float,
    ) -> BacktestTrade:
        """Execute a trade intent and return the trade."""
        # Apply slippage
        slippage = bar["close"] * (config.slippage_bps / 10000)
        if intent.direction == OrderSide.BUY:
            entry_price = bar["close"] + slippage
        else:
            entry_price = bar["close"] - slippage

        # Calculate position size
        size = min(
            intent.target_exposure_usd / entry_price,
            equity * config.max_position_size / entry_price,
        )

        # Calculate commission
        commission = entry_price * size * (config.commission_bps / 10000)

        return BacktestTrade(
            id=uuid4(),
            timestamp=timestamp,
            instrument=intent.instrument,
            side=intent.direction,
            size=size,
            entry_price=entry_price,
            commission=commission,
            slippage=slippage * size,
        )

    def _calculate_pnl(self, trade: BacktestTrade, config: BacktestConfig) -> float:
        """Calculate realized PnL for a trade."""
        if not trade.exit_price:
            return 0.0

        if trade.side == OrderSide.BUY:
            gross_pnl = (trade.exit_price - trade.entry_price) * trade.size
        else:
            gross_pnl = (trade.entry_price - trade.exit_price) * trade.size

        # Deduct commission and slippage
        exit_commission = (
            trade.exit_price * trade.size * (config.commission_bps / 10000)
        )
        trade.commission += exit_commission

        exit_slippage = trade.exit_price * (config.slippage_bps / 10000) * trade.size
        trade.slippage += exit_slippage

        return gross_pnl - trade.commission - trade.slippage

    def _calculate_unrealized_pnl(
        self, trade: BacktestTrade, current_price: float
    ) -> float:
        """Calculate unrealized PnL for an open position."""
        if trade.side == OrderSide.BUY:
            return (current_price - trade.entry_price) * trade.size
        else:
            return (trade.entry_price - current_price) * trade.size

    def _calculate_metrics(
        self,
        trades: List[BacktestTrade],
        equity_curve: List[Tuple[datetime, float]],
        daily_returns: List[float],
        config: BacktestConfig,
    ) -> BacktestMetrics:
        """Calculate comprehensive performance metrics."""

        if not trades:
            return BacktestMetrics()

        # Basic stats
        total_pnl = sum(t.pnl for t in trades)
        winning_trades = [t for t in trades if t.pnl > 0]
        losing_trades = [t for t in trades if t.pnl < 0]

        # Calculate drawdown
        peak = config.initial_capital
        max_drawdown = 0
        for _, equity in equity_curve:
            if equity > peak:
                peak = equity
            drawdown = peak - equity
            if drawdown > max_drawdown:
                max_drawdown = drawdown

        # Calculate Sharpe and Sortino
        if daily_returns:
            import statistics

            avg_return = statistics.mean(daily_returns) if daily_returns else 0
            std_return = (
                statistics.stdev(daily_returns) if len(daily_returns) > 1 else 0.01
            )
            downside_returns = [r for r in daily_returns if r < 0]
            downside_std = (
                statistics.stdev(downside_returns)
                if len(downside_returns) > 1
                else 0.01
            )

            # Annualized
            sharpe = (
                (avg_return * 252) / (std_return * (252**0.5)) if std_return > 0 else 0
            )
            sortino = (
                (avg_return * 252) / (downside_std * (252**0.5))
                if downside_std > 0
                else 0
            )
        else:
            sharpe = sortino = 0

        # Profit factor
        gross_profit = sum(t.pnl for t in winning_trades)
        gross_loss = abs(sum(t.pnl for t in losing_trades))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

        final_equity = equity_curve[-1][1] if equity_curve else config.initial_capital

        return BacktestMetrics(
            total_return=total_pnl,
            total_return_pct=(final_equity - config.initial_capital)
            / config.initial_capital
            * 100,
            sharpe_ratio=round(sharpe, 2),
            sortino_ratio=round(sortino, 2),
            max_drawdown=max_drawdown,
            max_drawdown_pct=max_drawdown / config.initial_capital * 100,
            win_rate=len(winning_trades) / len(trades) * 100 if trades else 0,
            profit_factor=round(profit_factor, 2),
            avg_trade_pnl=total_pnl / len(trades) if trades else 0,
            avg_win=sum(t.pnl for t in winning_trades) / len(winning_trades)
            if winning_trades
            else 0,
            avg_loss=sum(t.pnl for t in losing_trades) / len(losing_trades)
            if losing_trades
            else 0,
            total_trades=len(trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            avg_holding_period_hours=sum(t.holding_period_hours for t in trades)
            / len(trades)
            if trades
            else 0,
            total_commission=sum(t.commission for t in trades),
            total_slippage=sum(t.slippage for t in trades),
            calmar_ratio=total_pnl / max_drawdown if max_drawdown > 0 else 0,
            daily_returns=daily_returns,
            equity_curve=equity_curve,
        )

    def get_running_backtest(self, backtest_id: UUID) -> Optional[BacktestResult]:
        """Get a running or completed backtest by ID."""
        return self._running_backtests.get(backtest_id)


# Singleton instance
backtest_engine = BacktestEngine()
