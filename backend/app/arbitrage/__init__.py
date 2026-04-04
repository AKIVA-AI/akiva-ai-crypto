"""
Arbitrage Engine - Enterprise-Grade Arbitrage Trading

This module provides professional arbitrage strategies:
- Funding Rate Arbitrage (8-15% annual, low risk)
- Cross-Exchange Arbitrage (5-12% annual, requires speed)
- Statistical Arbitrage (10-20% annual, pairs trading)
- Triangular Arbitrage (3-8% annual, high frequency)

Key Features:
- Real-time opportunity detection
- Automated execution
- Risk management integration
- Performance tracking
"""

from .cross_exchange import CrossExchangeArbitrage, CrossExchangeOpportunity
from .engine import ArbitrageEngine, get_arbitrage_engine
from .funding_rate import FundingRateArbitrage, FundingRateOpportunity
from .statistical import PairsTradeOpportunity, StatisticalArbitrage
from .triangular import TriangularArbitrage, TriangularOpportunity

__all__ = [
    # Funding Rate
    "FundingRateArbitrage",
    "FundingRateOpportunity",
    # Cross-Exchange
    "CrossExchangeArbitrage",
    "CrossExchangeOpportunity",
    # Statistical
    "StatisticalArbitrage",
    "PairsTradeOpportunity",
    # Triangular
    "TriangularArbitrage",
    "TriangularOpportunity",
    # Engine
    "ArbitrageEngine",
    "get_arbitrage_engine",
]
