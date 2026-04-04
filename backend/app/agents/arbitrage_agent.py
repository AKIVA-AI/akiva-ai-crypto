"""
Arbitrage Agent - Monitors and publishes arbitrage opportunities.

Integrates with the Arbitrage Engine to detect and broadcast
profitable arbitrage opportunities across multiple strategies.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Dict, List

from .base_agent import AgentChannel, AgentMessage, BaseAgent

logger = logging.getLogger(__name__)


class ArbitrageAgent(BaseAgent):
    """
    Arbitrage monitoring and signaling agent.

    Responsibilities:
    - Monitor arbitrage engine for opportunities
    - Filter and rank opportunities by profitability
    - Publish opportunities for risk approval
    - Track executed arbitrage performance

    Supported Strategies:
    - Funding Rate Arbitrage (8-15% annual)
    - Cross-Exchange Arbitrage (5-12% annual)
    - Statistical Arbitrage (10-20% annual)
    - Triangular Arbitrage (3-8% annual)
    """

    def __init__(
        self,
        agent_id: str,
        redis_url: str = "redis://localhost:6379",
        min_profit_bps: float = 5,  # Minimum profit in basis points
        max_opportunities_per_cycle: int = 10,
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="arbitrage",
            redis_url=redis_url,
            subscribed_channels=[AgentChannel.MARKET_DATA],
            capabilities=["arbitrage_detection", "multi_strategy", "real_time"],
        )

        self.min_profit_bps = min_profit_bps
        self.max_opportunities_per_cycle = max_opportunities_per_cycle

        self._arbitrage_engine = None
        self._last_opportunities: Dict[str, Dict] = {}
        self._opportunity_cooldown: Dict[str, datetime] = {}
        self._cooldown_seconds = 60  # 1 minute cooldown
        self._stats = {
            "opportunities_found": 0,
            "opportunities_published": 0,
            "total_estimated_profit": 0.0,
        }

    async def on_start(self):
        """Initialize arbitrage engine on agent start."""
        try:
            from app.arbitrage import get_arbitrage_engine

            self._arbitrage_engine = get_arbitrage_engine()
            logger.info(f"[{self.agent_id}] Arbitrage engine initialized")

            # Start the arbitrage engine if not running
            if not self._arbitrage_engine._running:
                asyncio.create_task(self._arbitrage_engine.start())
                logger.info(f"[{self.agent_id}] Started arbitrage engine")

        except Exception as e:
            logger.error(f"[{self.agent_id}] Failed to initialize arbitrage: {e}")
            await self.send_alert("warning", "Arbitrage Init Failed", str(e))

    async def cycle(self):
        """Run one opportunity detection cycle."""
        if not self._arbitrage_engine:
            await asyncio.sleep(10)
            return

        try:
            # Get all opportunities
            opportunities = self._arbitrage_engine.get_all_opportunities()
            self._stats["opportunities_found"] += len(opportunities)

            # Filter and rank
            filtered = self._filter_opportunities(opportunities)

            # Publish top opportunities
            for opp in filtered[: self.max_opportunities_per_cycle]:
                await self._publish_opportunity(opp)

        except Exception as e:
            logger.error(f"[{self.agent_id}] Error in cycle: {e}")
            self._metrics["errors"] += 1

        await asyncio.sleep(5)  # 5 second cycle

    def _filter_opportunities(self, opportunities: List) -> List:
        """Filter and rank opportunities."""
        filtered = []

        for opp in opportunities:
            # Get profit metric based on opportunity type
            profit_bps = self._get_profit_bps(opp)

            if profit_bps < self.min_profit_bps:
                continue

            # Check cooldown
            opp_key = self._get_opportunity_key(opp)
            if self._is_on_cooldown(opp_key):
                continue

            filtered.append((opp, profit_bps))

        # Sort by profit
        filtered.sort(key=lambda x: x[1], reverse=True)

        return [opp for opp, _ in filtered]

    def _get_profit_bps(self, opp) -> float:
        """Extract profit in basis points from opportunity."""
        if hasattr(opp, "profit_bps"):
            return opp.profit_bps
        elif hasattr(opp, "annualized_return"):
            return opp.annualized_return * 100 / 365  # Daily return in bps
        elif hasattr(opp, "expected_profit_pct"):
            return opp.expected_profit_pct * 100
        elif hasattr(opp, "profit_after_fees_bps"):
            return opp.profit_after_fees_bps
        return 0

    def _get_opportunity_key(self, opp) -> str:
        """Get unique key for opportunity."""
        opp_type = type(opp).__name__
        symbol = getattr(opp, "symbol", getattr(opp, "long_symbol", ""))
        exchange = getattr(opp, "exchange", "")
        return f"{opp_type}:{symbol}:{exchange}"

    def _is_on_cooldown(self, key: str) -> bool:
        """Check if opportunity is on cooldown."""
        if key not in self._opportunity_cooldown:
            return False
        elapsed = (datetime.now(UTC) - self._opportunity_cooldown[key]).total_seconds()
        return elapsed < self._cooldown_seconds

    async def _publish_opportunity(self, opp):
        """Publish opportunity for execution."""
        opp_type = type(opp).__name__
        opp_key = self._get_opportunity_key(opp)

        # Build opportunity message
        message = {
            "type": opp_type,
            "profit_bps": self._get_profit_bps(opp),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        # Add type-specific fields
        for attr in [
            "symbol",
            "exchange",
            "annualized_return",
            "confidence",
            "buy_exchange",
            "sell_exchange",
            "spread_bps",
            "long_symbol",
            "short_symbol",
            "z_score",
        ]:
            if hasattr(opp, attr):
                message[attr] = getattr(opp, attr)

        await self.publish(
            AgentChannel.SIGNALS,
            {
                "signal_type": "arbitrage",
                "opportunity": message,
                "requires_approval": True,
            },
        )

        self._opportunity_cooldown[opp_key] = datetime.now(UTC)
        self._stats["opportunities_published"] += 1
        self._stats["total_estimated_profit"] += self._get_profit_bps(opp)

        logger.info(f"[{self.agent_id}] Published {opp_type} opportunity")

    async def handle_message(self, message: AgentMessage):
        """Handle incoming messages."""
        pass  # React to market data if needed

    def get_status(self) -> Dict:
        """Get agent status."""
        engine_status = {}
        if self._arbitrage_engine:
            engine_status = self._arbitrage_engine.get_status()

        return {
            "agent_id": self.agent_id,
            "min_profit_bps": self.min_profit_bps,
            "stats": self._stats,
            "metrics": self._metrics,
            "engine": engine_status,
        }
