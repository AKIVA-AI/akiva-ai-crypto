"""
Statistical Arbitrage Strategy (Pairs Trading)

Exploits temporary divergences between correlated assets
by going long the underperformer and short the outperformer.

Expected Returns: 10-20% annually
Risk Level: MEDIUM

How it works:
1. Identify correlated pairs (e.g., BTC/ETH)
2. Calculate the spread (price ratio) and z-score
3. When z-score > threshold (e.g., 2):
   - Short the outperformer
   - Long the underperformer
4. Close when spread reverts to mean
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class PairsTradeOpportunity:
    """A statistical arbitrage opportunity."""

    long_symbol: str
    short_symbol: str
    exchange: str
    z_score: float
    spread: float
    mean_spread: float
    std_spread: float
    correlation: float
    half_life_days: float  # Expected time to mean reversion
    expected_profit_pct: float
    recommended_size_usd: float
    confidence: float
    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_profitable(self) -> bool:
        """Check if opportunity meets criteria."""
        return (
            abs(self.z_score) >= 2.0
            and self.correlation >= 0.7
            and self.half_life_days <= 10
        )


@dataclass
class PairsPosition:
    """Active pairs trade position."""

    id: str
    long_symbol: str
    short_symbol: str
    long_size: float
    short_size: float
    entry_z_score: float
    current_z_score: float
    entry_spread: float
    current_spread: float
    pnl: float
    entry_time: datetime
    status: str  # open, closing, closed


class StatisticalArbitrage:
    """
    Statistical Arbitrage (Pairs Trading) Engine.

    Identifies and trades mean-reverting spread relationships
    between correlated cryptocurrency pairs.

    Target Annual Return: 10-20%
    Risk Level: MEDIUM
    """

    # Pre-defined correlated pairs
    DEFAULT_PAIRS = [
        ("BTC/USDT", "ETH/USDT"),
        ("ETH/USDT", "SOL/USDT"),
        ("BNB/USDT", "ETH/USDT"),
        ("LINK/USDT", "ETH/USDT"),
        ("AVAX/USDT", "SOL/USDT"),
    ]

    def __init__(
        self,
        z_score_entry: float = 2.0,
        z_score_exit: float = 0.5,
        min_correlation: float = 0.7,
        lookback_days: int = 30,
        max_position_size_usd: float = 25000,
        pairs: Optional[List[Tuple[str, str]]] = None,
    ):
        self.z_score_entry = z_score_entry
        self.z_score_exit = z_score_exit
        self.min_correlation = min_correlation
        self.lookback_days = lookback_days
        self.max_position_size_usd = max_position_size_usd
        self.pairs = pairs or self.DEFAULT_PAIRS

        self._opportunities: Dict[str, PairsTradeOpportunity] = {}
        self._positions: Dict[str, PairsPosition] = {}
        self._price_history: Dict[str, List[float]] = {}
        self._running = False

    def calculate_spread_statistics(
        self, prices_a: np.ndarray, prices_b: np.ndarray
    ) -> Dict[str, float]:
        """Calculate spread statistics for a pair."""
        if len(prices_a) != len(prices_b) or len(prices_a) < 20:
            return {}

        # Calculate log returns
        returns_a = np.diff(np.log(prices_a))
        returns_b = np.diff(np.log(prices_b))

        # Calculate correlation
        correlation = np.corrcoef(returns_a, returns_b)[0, 1]

        # Calculate spread (price ratio)
        spread = prices_a / prices_b
        mean_spread = np.mean(spread)
        std_spread = np.std(spread)

        # Current z-score
        current_spread = spread[-1]
        z_score = (current_spread - mean_spread) / std_spread

        # Calculate half-life using Ornstein-Uhlenbeck
        spread_diff = np.diff(spread)
        spread_lag = spread[:-1] - mean_spread

        if len(spread_lag) > 0 and np.var(spread_lag) > 0:
            theta = -np.cov(spread_diff, spread_lag)[0, 1] / np.var(spread_lag)
            half_life = np.log(2) / theta if theta > 0 else 30
        else:
            half_life = 30

        return {
            "z_score": z_score,
            "spread": current_spread,
            "mean_spread": mean_spread,
            "std_spread": std_spread,
            "correlation": correlation,
            "half_life_days": min(half_life, 30),
        }

    def analyze_pair(
        self,
        symbol_a: str,
        symbol_b: str,
        prices_a: np.ndarray,
        prices_b: np.ndarray,
        exchange: str = "binance",
    ) -> Optional[PairsTradeOpportunity]:
        """Analyze a pair for trading opportunity."""
        stats = self.calculate_spread_statistics(prices_a, prices_b)

        if not stats:
            return None

        z_score = stats["z_score"]
        correlation = stats["correlation"]

        if abs(z_score) < self.z_score_entry or correlation < self.min_correlation:
            return None

        # Determine direction
        if z_score > 0:
            long_symbol, short_symbol = symbol_b, symbol_a
        else:
            long_symbol, short_symbol = symbol_a, symbol_b

        # Expected profit based on z-score reversion
        expected_profit = (
            abs(z_score - self.z_score_exit)
            * stats["std_spread"]
            / stats["mean_spread"]
            * 100
        )

        return PairsTradeOpportunity(
            long_symbol=long_symbol,
            short_symbol=short_symbol,
            exchange=exchange,
            z_score=abs(z_score),
            spread=stats["spread"],
            mean_spread=stats["mean_spread"],
            std_spread=stats["std_spread"],
            correlation=correlation,
            half_life_days=stats["half_life_days"],
            expected_profit_pct=expected_profit,
            recommended_size_usd=min(self.max_position_size_usd, 10000),
            confidence=min(0.95, correlation),
        )

    def should_exit_position(self, position: PairsPosition) -> bool:
        """Check if position should be closed."""
        return abs(position.current_z_score) <= self.z_score_exit

    def get_opportunities(self) -> List[PairsTradeOpportunity]:
        """Get current opportunities sorted by expected profit."""
        return sorted(
            self._opportunities.values(),
            key=lambda x: x.expected_profit_pct,
            reverse=True,
        )

    def get_status(self) -> Dict[str, Any]:
        """Get engine status."""
        return {
            "running": self._running,
            "pairs": [f"{a}/{b}" for a, b in self.pairs],
            "opportunities_count": len(self._opportunities),
            "positions_count": len(self._positions),
            "config": {
                "z_score_entry": self.z_score_entry,
                "z_score_exit": self.z_score_exit,
                "min_correlation": self.min_correlation,
                "max_position_size_usd": self.max_position_size_usd,
            },
        }
