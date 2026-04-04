"""
Signal Agent - Generates trading signals from market data and strategies.
Subscribes to market data and publishes trade intents for risk approval.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .base_agent import AgentChannel, AgentMessage, BaseAgent

logger = logging.getLogger(__name__)


class SignalAgent(BaseAgent):
    """
    Signal generation agent that processes market data
    and generates trading signals based on configured strategies.
    """

    def __init__(
        self,
        agent_id: str = "signal-agent-01",
        redis_url: str = "redis://localhost:6379",
        strategies: Optional[List[str]] = None,
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="signal",
            redis_url=redis_url,
            subscribed_channels=[AgentChannel.MARKET_DATA],
        )

        self.strategies = strategies or ["trend_following", "mean_reversion"]
        self._market_data_cache: Dict[str, Dict] = {}
        self._active_signals: Dict[str, Dict] = {}
        self._cycle_interval = 0.1  # 100ms cycle
        self._paused = False

        # Load strategy parameters from config
        from app.core.trading_config import trading_config

        self._strategy_params = trading_config.signal_strategies or {
            "trend_following": {
                "lookback_periods": 20,
                "momentum_threshold": 0.02,
                "confidence_multiplier": 1.5,
            },
            "mean_reversion": {
                "lookback_periods": 50,
                "std_threshold": 2.0,
                "reversion_target": 0.5,
            },
            "funding_arbitrage": {"min_spread": 0.001, "max_exposure": 50000},
        }

    async def handle_message(self, message: AgentMessage):
        """Process incoming market data"""
        if message.channel == AgentChannel.MARKET_DATA.value:
            await self._process_market_data(message.payload)

    async def _process_market_data(self, data: Dict[str, Any]):
        """Update market data cache"""
        instrument = data.get("instrument")
        if instrument:
            self._market_data_cache[instrument] = {
                **data,
                "received_at": datetime.utcnow().isoformat(),
            }
            logger.debug(f"[{self.agent_id}] Updated market data for {instrument}")

    async def cycle(self):
        """Run signal generation cycle"""
        if self._paused or not self._market_data_cache:
            await asyncio.sleep(self._cycle_interval)
            return

        # Generate signals for each instrument
        for instrument, market_data in self._market_data_cache.items():
            for strategy in self.strategies:
                signal = await self._evaluate_strategy(
                    strategy, instrument, market_data
                )
                if signal:
                    await self._publish_signal(signal)

        await asyncio.sleep(self._cycle_interval)

    async def _evaluate_strategy(
        self, strategy: str, instrument: str, market_data: Dict
    ) -> Optional[Dict]:
        """Evaluate a strategy and generate signal if conditions met"""

        if strategy == "trend_following":
            return await self._trend_following_signal(instrument, market_data)
        elif strategy == "mean_reversion":
            return await self._mean_reversion_signal(instrument, market_data)
        elif strategy == "funding_arbitrage":
            return await self._funding_arbitrage_signal(instrument, market_data)

        return None

    async def _trend_following_signal(
        self, instrument: str, market_data: Dict
    ) -> Optional[Dict]:
        """Generate trend following signal"""
        params = self._strategy_params["trend_following"]

        price = market_data.get("price", 0)
        price_change_24h = market_data.get("price_change_24h", 0)
        volume = market_data.get("volume_24h", 0)

        if not price or not volume:
            return None

        # Calculate momentum
        momentum = price_change_24h / price if price else 0

        # Check if momentum exceeds threshold
        if abs(momentum) < params["momentum_threshold"]:
            return None

        # Generate signal
        direction = "buy" if momentum > 0 else "sell"
        confidence = min(abs(momentum) * params["confidence_multiplier"] * 100, 95)

        # Size based on confidence and volume
        target_exposure = min(
            volume * 0.001, params.get("max_exposure_per_signal", 10000)
        )

        return {
            "id": str(uuid4()),
            "strategy": "trend_following",
            "instrument": instrument,
            "direction": direction,
            "confidence": round(confidence, 2),
            "target_exposure_usd": round(target_exposure, 2),
            "entry_price": price,
            "stop_loss_pct": params.get("stop_loss_pct", 0.02),
            "take_profit_pct": params.get("take_profit_pct", 0.04),
            "horizon_minutes": params.get("horizon_minutes", 60),
            "metadata": {
                "momentum": round(momentum, 4),
                "volume_24h": volume,
                "generated_at": datetime.utcnow().isoformat(),
            },
        }

    async def _mean_reversion_signal(
        self, instrument: str, market_data: Dict
    ) -> Optional[Dict]:
        """Generate mean reversion signal"""
        params = self._strategy_params["mean_reversion"]

        price = market_data.get("price", 0)
        vwap = market_data.get("vwap", price)

        if not price or not vwap:
            return None

        # Calculate deviation from VWAP
        deviation = (price - vwap) / vwap if vwap else 0

        # Check if deviation exceeds threshold
        if abs(deviation) < params["std_threshold"] * 0.01:  # Simplified std check
            return None

        # Mean reversion: sell if above VWAP, buy if below
        direction = "sell" if deviation > 0 else "buy"
        confidence = min(abs(deviation) * 100 * 2, 90)  # Max 90% confidence

        return {
            "id": str(uuid4()),
            "strategy": "mean_reversion",
            "instrument": instrument,
            "direction": direction,
            "confidence": round(confidence, 2),
            "target_exposure_usd": params.get("fixed_exposure_usd", 5000),
            "entry_price": price,
            "stop_loss_pct": params.get("stop_loss_pct", 0.015),
            "take_profit_pct": abs(deviation) * params["reversion_target"],
            "horizon_minutes": params.get("horizon_minutes", 30),
            "metadata": {
                "deviation": round(deviation, 4),
                "vwap": vwap,
                "generated_at": datetime.utcnow().isoformat(),
            },
        }

    async def _funding_arbitrage_signal(
        self, instrument: str, market_data: Dict
    ) -> Optional[Dict]:
        """Generate funding rate arbitrage signal"""
        params = self._strategy_params["funding_arbitrage"]

        funding_rate = market_data.get("funding_rate", 0)

        if abs(funding_rate) < params["min_spread"]:
            return None

        # Positive funding = shorts pay longs, so go long
        # Negative funding = longs pay shorts, so go short
        direction = "buy" if funding_rate > 0 else "sell"

        return {
            "id": str(uuid4()),
            "strategy": "funding_arbitrage",
            "instrument": instrument,
            "direction": direction,
            "confidence": params.get("confidence", 75.0),
            "target_exposure_usd": min(
                abs(funding_rate) * 1000000, params["max_exposure"]
            ),
            "entry_price": market_data.get("price", 0),
            "stop_loss_pct": params.get("stop_loss_pct", 0.01),
            "take_profit_pct": abs(funding_rate),
            "horizon_minutes": params.get("horizon_minutes", 480),
            "metadata": {
                "funding_rate": funding_rate,
                "generated_at": datetime.utcnow().isoformat(),
            },
        }

    async def _publish_signal(self, signal: Dict):
        """Publish signal for risk approval"""
        # Check if we already have an active signal for this instrument/strategy
        key = f"{signal['instrument']}:{signal['strategy']}"
        if key in self._active_signals:
            # Don't spam duplicate signals
            last_signal = self._active_signals[key]
            if last_signal.get("direction") == signal["direction"]:
                return

        self._active_signals[key] = signal

        logger.info(
            f"[{self.agent_id}] Generated {signal['strategy']} signal: "
            f"{signal['direction']} {signal['instrument']} @ {signal['entry_price']} "
            f"(confidence: {signal['confidence']}%)"
        )

        await self.publish(
            AgentChannel.RISK_CHECK,
            {"type": "trade_intent", "signal": signal},
            correlation_id=signal["id"],
        )

    async def on_start(self):
        """Initialize on start"""
        logger.info(
            f"[{self.agent_id}] Signal agent starting with strategies: {self.strategies}"
        )

    async def on_pause(self):
        """Pause signal generation"""
        self._paused = True
        logger.info(f"[{self.agent_id}] Signal generation paused")

    async def on_resume(self):
        """Resume signal generation"""
        self._paused = False
        logger.info(f"[{self.agent_id}] Signal generation resumed")
