"""
FreqTrade Signal Agent - Generates trading signals using FreqTrade strategies.

This agent bridges the FreqTrade strategy system with our multi-agent architecture.
It runs FreqTrade-compatible strategies and publishes signals for risk approval.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from .base_agent import AgentChannel, AgentMessage, BaseAgent

logger = logging.getLogger(__name__)


class FreqTradeSignalAgent(BaseAgent):
    """
    Signal generation agent powered by FreqTrade strategies.

    Responsibilities:
    - Load and run FreqTrade-compatible strategies
    - Generate buy/sell signals
    - Publish signals for risk approval
    - Track strategy performance

    This agent PROPOSES signals only - it never executes trades directly.
    All signals must be approved by the Risk Agent and Meta-Decision Agent.
    """

    def __init__(
        self,
        agent_id: str,
        redis_url: str = "redis://localhost:6379",
        strategies: Optional[List[str]] = None,
        pairs: Optional[List[str]] = None,
        timeframe: str = "5m",
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="freqtrade_signal",
            redis_url=redis_url,
            subscribed_channels=[AgentChannel.MARKET_DATA],
            capabilities=["freqtrade_strategies", "signal_generation", "backtesting"],
        )

        self.strategy_names = strategies or ["TrendStrategy", "MomentumStrategy"]
        self.pairs = pairs or ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
        self.timeframe = timeframe

        self._strategy_manager = None
        self._data_provider = None
        self._strategies: Dict[str, Any] = {}
        self._last_signals: Dict[str, Dict] = {}
        self._signal_cooldown: Dict[str, datetime] = {}
        self._cooldown_seconds = 300  # 5 minute cooldown per pair

    async def on_start(self):
        """Initialize FreqTrade components on agent start."""
        try:
            from app.freqtrade.data_provider import FreqTradeDataProvider
            from app.freqtrade.strategy_manager import StrategyManager

            self._strategy_manager = StrategyManager()
            self._data_provider = FreqTradeDataProvider()

            # Load strategies
            for name in self.strategy_names:
                if self._strategy_manager.load_strategy(name):
                    self._strategies[name] = self._strategy_manager.get_strategy(name)
                    logger.info(f"[{self.agent_id}] Loaded strategy: {name}")

            logger.info(
                f"[{self.agent_id}] Initialized with {len(self._strategies)} strategies"
            )

        except Exception as e:
            logger.error(f"[{self.agent_id}] Failed to initialize FreqTrade: {e}")
            await self.send_alert("warning", "FreqTrade Init Failed", str(e))

    async def cycle(self):
        """Run one signal generation cycle."""
        if not self._strategies:
            await asyncio.sleep(10)
            return

        for pair in self.pairs:
            # Check cooldown
            if self._is_on_cooldown(pair):
                continue

            try:
                # Get market data
                df = self._data_provider.get_ohlcv(pair, self.timeframe, limit=200)

                # Run each strategy
                for name, strategy in self._strategies.items():
                    signal = await self._run_strategy(name, strategy, pair, df)

                    if signal and signal["action"] != "neutral":
                        await self._publish_signal(signal)
                        self._set_cooldown(pair)

            except Exception as e:
                logger.error(f"[{self.agent_id}] Error processing {pair}: {e}")
                self._metrics["errors"] += 1

        # Wait before next cycle
        await asyncio.sleep(10)

    async def _run_strategy(
        self, strategy_name: str, strategy: Any, pair: str, df: Any
    ) -> Optional[Dict]:
        """Run a strategy and extract signals."""
        try:
            # Populate indicators
            df = strategy.populate_indicators(df.copy(), {"pair": pair})
            df = strategy.populate_entry_trend(df, {"pair": pair})
            df = strategy.populate_exit_trend(df, {"pair": pair})

            # Get last row
            last = df.iloc[-1]

            # Determine signal
            action = "neutral"
            if last.get("enter_long", 0) == 1:
                action = "buy"
            elif last.get("exit_long", 0) == 1:
                action = "sell"

            if action == "neutral":
                return None

            return {
                "strategy": strategy_name,
                "pair": pair,
                "action": action,
                "price": float(last["close"]),
                "timeframe": self.timeframe,
                "indicators": {
                    "rsi": float(last.get("rsi", 0)),
                    "ema_fast": float(last.get("ema_fast", last.get("ema_200", 0))),
                },
                "confidence": 0.75,
                "timestamp": datetime.now(UTC).isoformat(),
            }

        except Exception as e:
            logger.error(f"[{self.agent_id}] Strategy {strategy_name} error: {e}")
            return None

    async def _publish_signal(self, signal: Dict):
        """Publish signal for risk approval."""
        await self.publish(
            AgentChannel.SIGNALS,
            {"type": "freqtrade_signal", "signal": signal, "requires_approval": True},
        )

        self._last_signals[signal["pair"]] = signal
        logger.info(
            f"[{self.agent_id}] Published {signal['action']} signal for {signal['pair']}"
        )

    def _is_on_cooldown(self, pair: str) -> bool:
        """Check if pair is on signal cooldown."""
        if pair not in self._signal_cooldown:
            return False
        elapsed = (datetime.now(UTC) - self._signal_cooldown[pair]).total_seconds()
        return elapsed < self._cooldown_seconds

    def _set_cooldown(self, pair: str):
        """Set cooldown for a pair."""
        self._signal_cooldown[pair] = datetime.now(UTC)

    async def handle_message(self, message: AgentMessage):
        """Handle incoming messages."""
        if message.channel == AgentChannel.MARKET_DATA.value:
            # Could trigger immediate strategy evaluation
            pass

    def get_status(self) -> Dict:
        """Get agent status."""
        return {
            "agent_id": self.agent_id,
            "strategies": list(self._strategies.keys()),
            "pairs": self.pairs,
            "timeframe": self.timeframe,
            "last_signals": self._last_signals,
            "metrics": self._metrics,
        }
