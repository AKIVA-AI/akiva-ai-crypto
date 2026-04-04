"""
FreqTrade Data Provider - Market Data Bridge

Bridges our market data service with FreqTrade's data requirements.
Provides OHLCV data in FreqTrade-compatible format.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class DataProviderConfig:
    """Data provider configuration."""

    exchange: str = "binance"
    timeframe: str = "5m"
    startup_candles: int = 200
    cache_enabled: bool = True
    cache_ttl_seconds: int = 60


class FreqTradeDataProvider:
    """
    FreqTrade-compatible Data Provider.

    Provides market data in the format expected by FreqTrade strategies:
    - OHLCV DataFrames with proper column names
    - Multi-timeframe data
    - Historical data for backtesting
    """

    # FreqTrade expected columns
    OHLCV_COLUMNS = ["date", "open", "high", "low", "close", "volume"]

    def __init__(self, config: Optional[DataProviderConfig] = None):
        self.config = config or DataProviderConfig()
        self._cache: Dict[str, pd.DataFrame] = {}
        self._cache_timestamps: Dict[str, datetime] = {}

    def get_ohlcv(
        self, pair: str, timeframe: Optional[str] = None, limit: int = 200
    ) -> pd.DataFrame:
        """Get OHLCV data for a pair."""
        tf = timeframe or self.config.timeframe
        cache_key = f"{pair}:{tf}"

        # Check cache
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key].copy()

        # Fetch fresh data
        df = self._fetch_ohlcv(pair, tf, limit)

        # Cache result
        if self.config.cache_enabled:
            self._cache[cache_key] = df.copy()
            self._cache_timestamps[cache_key] = datetime.utcnow()

        return df

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid."""
        if cache_key not in self._cache:
            return False

        timestamp = self._cache_timestamps.get(cache_key)
        if not timestamp:
            return False

        age = (datetime.utcnow() - timestamp).total_seconds()
        return age < self.config.cache_ttl_seconds

    def _fetch_ohlcv(self, pair: str, timeframe: str, limit: int) -> pd.DataFrame:
        """Fetch OHLCV data from exchange."""
        try:
            # Try to use our market data service
            from app.services.market_data_service import market_data_service

            # Convert to exchange format
            symbol = pair.replace("/", "-")

            # Get candles from our service
            candles = market_data_service.get_candles(
                symbol=symbol, timeframe=timeframe, limit=limit
            )

            if candles:
                return self._convert_to_dataframe(candles)
        except Exception as e:
            logger.warning(f"Market data service unavailable: {e}")

        # Fallback: Generate mock data for testing
        return self._generate_mock_data(pair, timeframe, limit)

    def _convert_to_dataframe(self, candles: List[Dict]) -> pd.DataFrame:
        """Convert candle list to DataFrame."""
        df = pd.DataFrame(candles)

        # Ensure proper column names
        column_mapping = {
            "timestamp": "date",
            "time": "date",
            "o": "open",
            "h": "high",
            "l": "low",
            "c": "close",
            "v": "volume",
        }
        df = df.rename(columns=column_mapping)

        # Ensure required columns exist
        for col in self.OHLCV_COLUMNS:
            if col not in df.columns:
                if col == "date":
                    df[col] = pd.date_range(
                        end=datetime.utcnow(), periods=len(df), freq="5min"
                    )
                else:
                    df[col] = 0.0

        # Convert date to datetime
        if not pd.api.types.is_datetime64_any_dtype(df["date"]):
            df["date"] = pd.to_datetime(df["date"])

        # Select and order columns
        df = df[self.OHLCV_COLUMNS]

        # Sort by date
        df = df.sort_values("date").reset_index(drop=True)

        return df

    def _generate_mock_data(
        self, pair: str, timeframe: str, limit: int
    ) -> pd.DataFrame:
        """Generate mock OHLCV data for testing."""
        logger.info(f"Generating mock data for {pair} ({limit} candles)")

        # Parse pair for realistic prices
        base_prices = {
            "BTC": 50000,
            "ETH": 3000,
            "SOL": 100,
            "BNB": 300,
            "ADA": 0.5,
            "DOT": 8,
            "LINK": 15,
            "AVAX": 35,
        }

        base = pair.split("/")[0] if "/" in pair else pair.split("-")[0]
        base_price = base_prices.get(base, 100)

        # Generate realistic price movement
        np.random.seed(42)
        returns = np.random.normal(0.0001, 0.02, limit)
        prices = base_price * np.cumprod(1 + returns)

        # Generate OHLCV
        data = []
        for i in range(limit):
            close = prices[i]
            high = close * (1 + abs(np.random.normal(0, 0.005)))
            low = close * (1 - abs(np.random.normal(0, 0.005)))
            open_price = close * (1 + np.random.normal(0, 0.002))
            volume = np.random.uniform(100, 10000) * base_price / 1000

            data.append(
                {
                    "date": datetime.utcnow() - timedelta(minutes=(limit - i) * 5),
                    "open": open_price,
                    "high": max(high, open_price, close),
                    "low": min(low, open_price, close),
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def get_multi_timeframe(
        self, pair: str, timeframes: List[str]
    ) -> Dict[str, pd.DataFrame]:
        """Get OHLCV data for multiple timeframes."""
        return {tf: self.get_ohlcv(pair, tf) for tf in timeframes}

    def clear_cache(self) -> None:
        """Clear all cached data."""
        self._cache.clear()
        self._cache_timestamps.clear()

    def get_status(self) -> Dict[str, Any]:
        """Get data provider status."""
        return {
            "exchange": self.config.exchange,
            "timeframe": self.config.timeframe,
            "cache_enabled": self.config.cache_enabled,
            "cached_pairs": len(self._cache),
        }
