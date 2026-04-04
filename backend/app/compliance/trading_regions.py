"""
Trading Region Compliance Module

Manages US vs International trading mode for regulatory compliance.
Ensures users only access exchanges and features legal in their jurisdiction.

US Regulations:
- No Binance (use Binance.US)
- Limited futures/derivatives access
- Stricter KYC requirements
- Some tokens restricted (privacy coins, etc.)

International:
- Full exchange access
- Futures/margin trading available
- Broader token selection
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class TradingRegion(Enum):
    """Supported trading regions."""

    US = "us"
    INTERNATIONAL = "international"


@dataclass
class ExchangeConfig:
    """Exchange configuration per region."""

    name: str
    class_name: str
    spot: bool = True
    futures: bool = False
    margin: bool = False
    restricted_pairs: List[str] = None

    def __post_init__(self):
        if self.restricted_pairs is None:
            self.restricted_pairs = []


# US-Compliant Exchanges
US_EXCHANGES: Dict[str, ExchangeConfig] = {
    "binanceus": ExchangeConfig(
        name="Binance US",
        class_name="binanceus",
        spot=True,
        futures=False,  # No futures for US
        margin=False,
    ),
    "coinbase": ExchangeConfig(
        name="Coinbase Advanced",
        class_name="coinbase",
        spot=True,
        futures=False,
        margin=False,
    ),
    "kraken": ExchangeConfig(
        name="Kraken",
        class_name="kraken",
        spot=True,
        futures=False,  # Kraken Futures not for US
        margin=False,
    ),
    "gemini": ExchangeConfig(
        name="Gemini",
        class_name="gemini",
        spot=True,
        futures=False,
        margin=False,
    ),
}

# International Exchanges (Full Access)
INTERNATIONAL_EXCHANGES: Dict[str, ExchangeConfig] = {
    "binance": ExchangeConfig(
        name="Binance",
        class_name="binance",
        spot=True,
        futures=True,
        margin=True,
    ),
    "bybit": ExchangeConfig(
        name="Bybit",
        class_name="bybit",
        spot=True,
        futures=True,
        margin=True,
    ),
    "okx": ExchangeConfig(
        name="OKX",
        class_name="okx",
        spot=True,
        futures=True,
        margin=True,
    ),
    "gate": ExchangeConfig(
        name="Gate.io",
        class_name="gate",
        spot=True,
        futures=True,
        margin=True,
    ),
    "bitget": ExchangeConfig(
        name="Bitget",
        class_name="bitget",
        spot=True,
        futures=True,
        margin=False,
    ),
    "kraken": ExchangeConfig(
        name="Kraken",
        class_name="kraken",
        spot=True,
        futures=True,  # Kraken Futures available internationally
        margin=True,
    ),
    "htx": ExchangeConfig(
        name="HTX (Huobi)",
        class_name="htx",
        spot=True,
        futures=True,
        margin=True,
    ),
    "hyperliquid": ExchangeConfig(
        name="Hyperliquid",
        class_name="hyperliquid",
        spot=True,
        futures=True,
        margin=True,
    ),
}

# Restricted tokens for US users
US_RESTRICTED_TOKENS = [
    "XMR",  # Monero - privacy coin
    "ZEC",  # Zcash - privacy features
    "DASH",  # Dash - privacy features
    "XVG",  # Verge - privacy coin
]


class TradingRegionManager:
    """Manages trading region compliance."""

    def __init__(self, region: TradingRegion = TradingRegion.INTERNATIONAL):
        self.region = region
        logger.info(f"Trading region set to: {region.value}")

    def get_available_exchanges(self) -> Dict[str, ExchangeConfig]:
        """Get exchanges available for current region."""
        if self.region == TradingRegion.US:
            return US_EXCHANGES
        return INTERNATIONAL_EXCHANGES

    def is_exchange_allowed(self, exchange: str) -> bool:
        """Check if exchange is allowed in current region."""
        exchanges = self.get_available_exchanges()
        return exchange.lower() in exchanges

    def is_futures_allowed(self) -> bool:
        """Check if futures trading is allowed."""
        return self.region == TradingRegion.INTERNATIONAL

    def is_margin_allowed(self) -> bool:
        """Check if margin trading is allowed."""
        return self.region == TradingRegion.INTERNATIONAL

    def is_token_allowed(self, token: str) -> bool:
        """Check if token is allowed in current region."""
        if self.region == TradingRegion.US:
            return token.upper() not in US_RESTRICTED_TOKENS
        return True

    def filter_pairs(self, pairs: List[str]) -> List[str]:
        """Filter trading pairs based on region restrictions."""
        if self.region != TradingRegion.US:
            return pairs

        allowed = []
        for pair in pairs:
            base = pair.split("/")[0] if "/" in pair else pair.split("USDT")[0]
            if self.is_token_allowed(base):
                allowed.append(pair)
            else:
                logger.warning(f"Pair {pair} restricted in US region")
        return allowed

    def get_config_for_exchange(self, exchange: str) -> Optional[ExchangeConfig]:
        """Get configuration for specific exchange."""
        exchanges = self.get_available_exchanges()
        return exchanges.get(exchange.lower())

    def validate_strategy_for_region(
        self, strategy_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate and adjust strategy config for region compliance."""
        result = {
            "valid": True,
            "warnings": [],
            "adjustments": [],
        }

        # Check if strategy requires shorting (futures)
        if strategy_config.get("can_short", False) and not self.is_futures_allowed():
            result["warnings"].append("Shorting disabled - not available in US region")
            result["adjustments"].append({"can_short": False})

        # Check trading mode
        trading_mode = strategy_config.get("trading_mode", "spot")
        if trading_mode != "spot" and not self.is_futures_allowed():
            result["warnings"].append(
                f"{trading_mode} mode not available in US - defaulting to spot"
            )
            result["adjustments"].append({"trading_mode": "spot"})

        return result

    def get_status(self) -> Dict[str, Any]:
        """Get current region status."""
        exchanges = self.get_available_exchanges()
        return {
            "region": self.region.value,
            "futures_allowed": self.is_futures_allowed(),
            "margin_allowed": self.is_margin_allowed(),
            "available_exchanges": list(exchanges.keys()),
            "exchange_count": len(exchanges),
        }
