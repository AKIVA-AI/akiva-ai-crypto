"""
Arbitrage Engine - Unified Arbitrage Management

Orchestrates all arbitrage strategies and provides a unified interface
for opportunity detection, execution, and monitoring.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

from .cross_exchange import CrossExchangeArbitrage, CrossExchangeOpportunity
from .funding_rate import FundingRateArbitrage, FundingRateOpportunity
from .statistical import PairsTradeOpportunity, StatisticalArbitrage
from .triangular import TriangularArbitrage, TriangularOpportunity

logger = logging.getLogger(__name__)

ArbitrageOpportunity = Union[
    FundingRateOpportunity,
    CrossExchangeOpportunity,
    PairsTradeOpportunity,
    TriangularOpportunity,
]


@dataclass
class ArbitrageStats:
    """Aggregated arbitrage statistics."""

    total_opportunities: int
    funding_rate_opportunities: int
    cross_exchange_opportunities: int
    statistical_opportunities: int
    triangular_opportunities: int
    total_estimated_profit_usd: float
    active_positions: int
    total_pnl_usd: float


class ArbitrageEngine:
    """
    Enterprise Arbitrage Engine.

    Coordinates all arbitrage strategies:
    - Funding Rate Arbitrage (8-15% annual)
    - Cross-Exchange Arbitrage (5-12% annual)
    - Statistical Arbitrage (10-20% annual)
    - Triangular Arbitrage (3-8% annual)

    Combined Target: 25-55%+ annual return
    """

    _instance: Optional["ArbitrageEngine"] = None

    def __init__(
        self,
        enable_funding_rate: bool = True,
        enable_cross_exchange: bool = True,
        enable_statistical: bool = True,
        enable_triangular: bool = True,
        exchanges: Optional[List[str]] = None,
    ):
        self.exchanges = exchanges or ["binance", "bybit", "coinbase"]

        # Initialize strategies
        self.funding_rate = (
            FundingRateArbitrage(exchanges=self.exchanges)
            if enable_funding_rate
            else None
        )
        self.cross_exchange = (
            CrossExchangeArbitrage(exchanges=self.exchanges)
            if enable_cross_exchange
            else None
        )
        self.statistical = StatisticalArbitrage() if enable_statistical else None
        self.triangular = (
            TriangularArbitrage(exchanges=self.exchanges[:1])
            if enable_triangular
            else None
        )

        self._running = False
        self._tasks: List[asyncio.Task] = []

    @classmethod
    def get_instance(cls, **kwargs) -> "ArbitrageEngine":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls(**kwargs)
        return cls._instance

    async def start(self) -> None:
        """Start all arbitrage engines."""
        if self._running:
            return

        self._running = True
        logger.info("Starting Arbitrage Engine...")

        # Start each strategy in background
        if self.funding_rate:
            self._tasks.append(asyncio.create_task(self.funding_rate.start()))
        if self.cross_exchange:
            self._tasks.append(asyncio.create_task(self.cross_exchange.start()))

        logger.info(
            "Arbitrage Engine started with strategies: "
            + ", ".join(self._get_enabled_strategies())
        )

    async def stop(self) -> None:
        """Stop all arbitrage engines."""
        self._running = False

        if self.funding_rate:
            await self.funding_rate.stop()
        if self.cross_exchange:
            await self.cross_exchange.stop()

        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

        logger.info("Arbitrage Engine stopped")

    def _get_enabled_strategies(self) -> List[str]:
        """Get list of enabled strategies."""
        strategies = []
        if self.funding_rate:
            strategies.append("FundingRate")
        if self.cross_exchange:
            strategies.append("CrossExchange")
        if self.statistical:
            strategies.append("Statistical")
        if self.triangular:
            strategies.append("Triangular")
        return strategies

    def get_all_opportunities(self) -> List[ArbitrageOpportunity]:
        """Get all opportunities from all strategies."""
        opportunities: List[ArbitrageOpportunity] = []

        if self.funding_rate:
            opportunities.extend(self.funding_rate.get_opportunities())
        if self.cross_exchange:
            opportunities.extend(self.cross_exchange.get_opportunities())
        if self.statistical:
            opportunities.extend(self.statistical.get_opportunities())
        if self.triangular:
            opportunities.extend(self.triangular.get_opportunities())

        return opportunities

    def get_stats(self) -> ArbitrageStats:
        """Get aggregated statistics."""
        funding_opps = (
            self.funding_rate.get_opportunities() if self.funding_rate else []
        )
        cross_opps = (
            self.cross_exchange.get_opportunities() if self.cross_exchange else []
        )
        stat_opps = self.statistical.get_opportunities() if self.statistical else []
        tri_opps = self.triangular.get_opportunities() if self.triangular else []

        all_opps = funding_opps + cross_opps + stat_opps + tri_opps

        total_profit = sum(
            getattr(opp, "estimated_profit_usd", 0)
            or getattr(opp, "recommended_size_usd", 0)
            * getattr(opp, "expected_profit_pct", 0)
            / 100
            for opp in all_opps
        )

        active_positions = len(
            self.funding_rate.get_positions() if self.funding_rate else []
        ) + len(self.statistical._positions if self.statistical else {})

        return ArbitrageStats(
            total_opportunities=len(all_opps),
            funding_rate_opportunities=len(funding_opps),
            cross_exchange_opportunities=len(cross_opps),
            statistical_opportunities=len(stat_opps),
            triangular_opportunities=len(tri_opps),
            total_estimated_profit_usd=total_profit,
            active_positions=active_positions,
            total_pnl_usd=0,  # TODO: Calculate from positions
        )

    def get_status(self) -> Dict[str, Any]:
        """Get comprehensive engine status."""
        stats = self.get_stats()

        return {
            "running": self._running,
            "enabled_strategies": self._get_enabled_strategies(),
            "exchanges": self.exchanges,
            "stats": {
                "total_opportunities": stats.total_opportunities,
                "funding_rate": stats.funding_rate_opportunities,
                "cross_exchange": stats.cross_exchange_opportunities,
                "statistical": stats.statistical_opportunities,
                "triangular": stats.triangular_opportunities,
                "estimated_profit_usd": stats.total_estimated_profit_usd,
                "active_positions": stats.active_positions,
            },
            "strategy_status": {
                "funding_rate": self.funding_rate.get_status()
                if self.funding_rate
                else None,
                "cross_exchange": self.cross_exchange.get_status()
                if self.cross_exchange
                else None,
                "statistical": self.statistical.get_status()
                if self.statistical
                else None,
                "triangular": self.triangular.get_status() if self.triangular else None,
            },
        }


# Global instance getter
def get_arbitrage_engine(**kwargs) -> ArbitrageEngine:
    """Get arbitrage engine singleton."""
    return ArbitrageEngine.get_instance(**kwargs)
