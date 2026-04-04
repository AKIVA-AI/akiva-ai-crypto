"""
Triangular Arbitrage Strategy

Exploits pricing inefficiencies across three currency pairs
on a single exchange (no transfer risk).

Expected Returns: 3-8% annually
Risk Level: LOW (but requires very fast execution)

Example:
1. BTC/USDT = $50,000
2. ETH/USDT = $3,000
3. BTC/ETH = 16.8 (but should be 50000/3000 = 16.67)

Trade sequence:
1. Buy ETH with USDT
2. Buy BTC with ETH
3. Sell BTC for USDT
4. Profit from the discrepancy
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class TriangularOpportunity:
    """A triangular arbitrage opportunity."""

    exchange: str
    path: List[str]  # e.g., ["USDT", "ETH", "BTC", "USDT"]
    pairs: List[str]  # e.g., ["ETH/USDT", "BTC/ETH", "BTC/USDT"]
    rates: List[float]  # Exchange rates for each step
    profit_bps: float  # Profit in basis points
    profit_pct: float
    estimated_profit_usd: float
    execution_time_ms: int
    confidence: float
    timestamp: datetime = field(default_factory=datetime.utcnow)

    @property
    def is_profitable(self) -> bool:
        """Check if profitable after fees."""
        # Need at least 5 bps (0.05%) to cover fees
        return self.profit_bps > 5


@dataclass
class TriangularPosition:
    """Active triangular arbitrage position."""

    id: str
    exchange: str
    path: List[str]
    size_usdt: float
    expected_profit: float
    actual_profit: float
    status: str
    entry_time: datetime
    completion_time: Optional[datetime] = None


class TriangularArbitrage:
    """
    Triangular Arbitrage Engine.

    Scans for pricing inefficiencies across three currency
    pairs and executes rapid trades to capture profits.

    Target Annual Return: 3-8%
    Risk Level: LOW (execution risk)
    """

    # Common base currencies
    BASE_CURRENCIES = ["USDT", "USDC", "BTC", "ETH"]

    # Fee per trade in bps (most exchanges)
    DEFAULT_FEE_BPS = 10

    def __init__(
        self,
        min_profit_bps: float = 5,  # 0.05% minimum
        max_position_size_usd: float = 10000,
        fee_bps: float = 10,
        exchanges: Optional[List[str]] = None,
    ):
        self.min_profit_bps = min_profit_bps
        self.max_position_size_usd = max_position_size_usd
        self.fee_bps = fee_bps
        self.exchanges = exchanges or ["binance"]

        self._opportunities: Dict[str, TriangularOpportunity] = {}
        self._positions: Dict[str, TriangularPosition] = {}
        self._orderbooks: Dict[str, Dict] = {}
        self._running = False

    def find_triangular_paths(
        self, available_pairs: List[str], base_currency: str = "USDT"
    ) -> List[List[str]]:
        """Find all valid triangular paths from a base currency."""
        paths = []

        # Parse pairs into graph
        graph: Dict[str, List[str]] = {}
        for pair in available_pairs:
            base, quote = pair.split("/")
            if base not in graph:
                graph[base] = []
            if quote not in graph:
                graph[quote] = []
            graph[base].append(quote)
            graph[quote].append(base)

        if base_currency not in graph:
            return paths

        # Find 3-hop paths back to base
        for step1 in graph[base_currency]:
            for step2 in graph[step1]:
                if step2 != base_currency and base_currency in graph[step2]:
                    path = [base_currency, step1, step2, base_currency]
                    paths.append(path)

        return paths

    def calculate_arbitrage_profit(
        self, path: List[str], rates: Dict[str, float], initial_amount: float = 1.0
    ) -> Tuple[float, List[float]]:
        """Calculate profit for a triangular path."""
        amount = initial_amount
        used_rates = []

        for i in range(len(path) - 1):
            from_currency = path[i]
            to_currency = path[i + 1]

            # Try both pair orderings
            pair1 = f"{to_currency}/{from_currency}"
            pair2 = f"{from_currency}/{to_currency}"

            if pair1 in rates:
                rate = rates[pair1]
                amount = amount * rate
                used_rates.append(rate)
            elif pair2 in rates:
                rate = 1 / rates[pair2]
                amount = amount * rate
                used_rates.append(rate)
            else:
                return 0, []

            # Apply fee
            amount = amount * (1 - self.fee_bps / 10000)

        profit_ratio = amount / initial_amount
        profit_bps = (profit_ratio - 1) * 10000

        return profit_bps, used_rates

    def scan_opportunities(
        self, exchange: str, rates: Dict[str, float]
    ) -> List[TriangularOpportunity]:
        """Scan for triangular arbitrage opportunities."""
        opportunities = []
        available_pairs = list(rates.keys())

        for base in self.BASE_CURRENCIES:
            paths = self.find_triangular_paths(available_pairs, base)

            for path in paths:
                profit_bps, used_rates = self.calculate_arbitrage_profit(path, rates)

                if profit_bps > self.min_profit_bps:
                    # Build pairs list
                    pairs = []
                    for i in range(len(path) - 1):
                        pair1 = f"{path[i + 1]}/{path[i]}"
                        pair2 = f"{path[i]}/{path[i + 1]}"
                        pairs.append(pair1 if pair1 in rates else pair2)

                    estimated_profit = (profit_bps / 10000) * self.max_position_size_usd

                    opportunity = TriangularOpportunity(
                        exchange=exchange,
                        path=path,
                        pairs=pairs,
                        rates=used_rates,
                        profit_bps=profit_bps,
                        profit_pct=profit_bps / 100,
                        estimated_profit_usd=estimated_profit,
                        execution_time_ms=50,  # Target execution time
                        confidence=0.85,
                    )
                    opportunities.append(opportunity)

        return opportunities

    def get_opportunities(self) -> List[TriangularOpportunity]:
        """Get current opportunities sorted by profit."""
        return sorted(
            self._opportunities.values(), key=lambda x: x.profit_bps, reverse=True
        )

    def get_status(self) -> Dict[str, Any]:
        """Get engine status."""
        return {
            "running": self._running,
            "exchanges": self.exchanges,
            "opportunities_count": len(self._opportunities),
            "positions_count": len(self._positions),
            "config": {
                "min_profit_bps": self.min_profit_bps,
                "max_position_size_usd": self.max_position_size_usd,
                "fee_bps": self.fee_bps,
            },
        }
