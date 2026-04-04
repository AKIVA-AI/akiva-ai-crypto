"""
Venue Adapters

Exchange and DEX integrations for order execution.

STATUS:
- CoinbaseAdapter: PRODUCTION READY (spot trading, signed requests)
- MEXCAdapter: PRODUCTION READY (spot + futures, paper + live)
- KrakenAdapter: PAPER ONLY (live API not yet implemented)
- DEXAdapter: PARTIAL (paper complete, live swap needs wallet integration)
"""

from app.adapters.base import VenueAdapter
from app.adapters.coinbase_adapter import CoinbaseAdapter
from app.adapters.dex_adapter import DEXAdapter
from app.adapters.kraken_adapter import KrakenAdapter
from app.adapters.mexc_adapter import MEXCAdapter

__all__ = [
    "VenueAdapter",
    "CoinbaseAdapter",
    "MEXCAdapter",
    "KrakenAdapter",
    "DEXAdapter",
]
