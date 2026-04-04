"""
Funding Rate Arbitrage Strategy

Exploits funding rate differences between perpetual futures and spot markets.
This is the most profitable and lowest-risk arbitrage strategy.

Expected Returns: 8-15% annually (can be higher in volatile markets)
Risk Level: LOW (market-neutral when properly hedged)

How it works:
1. Monitor funding rates on perpetual futures
2. When funding is positive (longs pay shorts):
   - Buy spot
   - Short perpetual
   - Collect funding every 8 hours
3. When funding is negative (shorts pay longs):
   - Sell/short spot (if allowed)
   - Long perpetual
   - Collect funding every 8 hours
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class FundingDirection(Enum):
    """Funding payment direction."""

    LONGS_PAY = "longs_pay"  # Positive funding rate
    SHORTS_PAY = "shorts_pay"  # Negative funding rate
    NEUTRAL = "neutral"


@dataclass
class FundingRateOpportunity:
    """A funding rate arbitrage opportunity."""

    symbol: str
    exchange: str
    funding_rate: float  # Current funding rate (e.g., 0.01 = 1%)
    next_funding_time: datetime
    predicted_rate: float  # Predicted next funding rate
    direction: FundingDirection
    annualized_return: float  # Expected annual return
    spot_price: float
    perp_price: float
    basis: float  # perp_price - spot_price
    confidence: float  # 0-1 confidence score
    recommended_size_usd: float
    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def hours_until_funding(self) -> float:
        """Hours until next funding payment."""
        delta = self.next_funding_time - datetime.utcnow()
        return max(0, delta.total_seconds() / 3600)

    @property
    def is_profitable(self) -> bool:
        """Check if opportunity is profitable after fees."""
        # Assume 0.1% fees round-trip
        return abs(self.funding_rate) > 0.001


@dataclass
class FundingPosition:
    """Active funding arbitrage position."""

    symbol: str
    exchange: str
    spot_size: float
    perp_size: float
    direction: FundingDirection
    entry_funding_rate: float
    total_funding_collected: float
    entry_time: datetime
    pnl: float = 0.0


class FundingRateArbitrage:
    """
    Funding Rate Arbitrage Engine.

    Monitors funding rates across exchanges and executes
    delta-neutral strategies to collect funding payments.

    Target Annual Return: 8-15%+
    Risk Level: LOW
    """

    def __init__(
        self,
        min_funding_rate: float = 0.0001,  # 0.01% minimum
        max_position_size_usd: float = 100000,
        target_hedge_ratio: float = 1.0,  # 1:1 hedge
        exchanges: Optional[List[str]] = None,
    ):
        self.min_funding_rate = min_funding_rate
        self.max_position_size_usd = max_position_size_usd
        self.target_hedge_ratio = target_hedge_ratio
        self.exchanges = exchanges or ["binance", "bybit", "okx"]

        self._opportunities: Dict[str, FundingRateOpportunity] = {}
        self._positions: Dict[str, FundingPosition] = {}
        self._funding_history: List[Dict[str, Any]] = []
        self._running = False

    async def start(self) -> None:
        """Start monitoring funding rates."""
        self._running = True
        logger.info("Funding Rate Arbitrage started")

        while self._running:
            try:
                await self._scan_opportunities()
                await asyncio.sleep(60)  # Scan every minute
            except Exception as e:
                logger.error(f"Error in funding rate scan: {e}")
                await asyncio.sleep(10)

    async def stop(self) -> None:
        """Stop monitoring."""
        self._running = False
        logger.info("Funding Rate Arbitrage stopped")

    async def _scan_opportunities(self) -> None:
        """Scan for funding rate opportunities."""
        for exchange in self.exchanges:
            try:
                rates = await self._get_funding_rates(exchange)
                for symbol, rate_data in rates.items():
                    opportunity = self._analyze_opportunity(symbol, exchange, rate_data)
                    if opportunity and opportunity.is_profitable:
                        self._opportunities[f"{exchange}:{symbol}"] = opportunity
            except Exception as e:
                logger.warning(f"Error scanning {exchange}: {e}")

    async def _get_funding_rates(self, exchange: str) -> Dict[str, Dict]:
        """Get funding rates from exchange."""
        # TODO: Implement actual exchange API calls
        # For now, return mock data
        return {
            "BTC-PERP": {
                "funding_rate": 0.0005,
                "next_funding_time": datetime.utcnow() + timedelta(hours=4),
                "spot_price": 50000,
                "perp_price": 50050,
            },
            "ETH-PERP": {
                "funding_rate": 0.0008,
                "next_funding_time": datetime.utcnow() + timedelta(hours=4),
                "spot_price": 3000,
                "perp_price": 3010,
            },
        }

    def _analyze_opportunity(
        self, symbol: str, exchange: str, rate_data: Dict
    ) -> Optional[FundingRateOpportunity]:
        """Analyze a potential funding rate opportunity."""
        funding_rate = rate_data.get("funding_rate", 0)

        if abs(funding_rate) < self.min_funding_rate:
            return None

        direction = (
            FundingDirection.LONGS_PAY
            if funding_rate > 0
            else FundingDirection.SHORTS_PAY
            if funding_rate < 0
            else FundingDirection.NEUTRAL
        )

        # Calculate annualized return (3 funding periods per day)
        daily_return = abs(funding_rate) * 3
        annualized = ((1 + daily_return) ** 365 - 1) * 100

        spot_price = rate_data.get("spot_price", 0)
        perp_price = rate_data.get("perp_price", 0)
        basis = perp_price - spot_price

        return FundingRateOpportunity(
            symbol=symbol,
            exchange=exchange,
            funding_rate=funding_rate,
            next_funding_time=rate_data.get("next_funding_time", datetime.utcnow()),
            predicted_rate=funding_rate * 0.8,  # Conservative prediction
            direction=direction,
            annualized_return=annualized,
            spot_price=spot_price,
            perp_price=perp_price,
            basis=basis,
            confidence=0.8,
            recommended_size_usd=min(self.max_position_size_usd, 10000),
        )

    def get_opportunities(self) -> List[FundingRateOpportunity]:
        """Get current opportunities sorted by profitability."""
        return sorted(
            self._opportunities.values(),
            key=lambda x: x.annualized_return,
            reverse=True,
        )

    def get_positions(self) -> List[FundingPosition]:
        """Get active funding arbitrage positions."""
        return list(self._positions.values())

    def get_status(self) -> Dict[str, Any]:
        """Get engine status."""
        return {
            "running": self._running,
            "exchanges": self.exchanges,
            "opportunities_count": len(self._opportunities),
            "positions_count": len(self._positions),
            "total_funding_collected": sum(
                p.total_funding_collected for p in self._positions.values()
            ),
            "config": {
                "min_funding_rate": self.min_funding_rate,
                "max_position_size_usd": self.max_position_size_usd,
                "hedge_ratio": self.target_hedge_ratio,
            },
        }
