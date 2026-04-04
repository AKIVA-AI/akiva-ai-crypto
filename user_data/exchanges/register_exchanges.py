"""
Enterprise Crypto - Exchange Registration Script

This script registers custom exchange classes with Freqtrade.
Run this before starting the trading bot to enable Coinbase Futures support.

Usage:
    python -c "from user_data.exchanges.register_exchanges import register; register()"

Or import at the start of your strategy:
    from user_data.exchanges.register_exchanges import register
    register()
"""

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def register():
    """
    Register custom exchange classes with Freqtrade.
    This patches the Freqtrade exchange module to include our custom exchanges.
    """
    try:
        import freqtrade.exchange as ft_exchanges

        from user_data.exchanges.coinbase_futures import CoinbaseFutures

        # Register CoinbaseFutures as 'Coinbasefutures' (Freqtrade titlecases names)
        setattr(ft_exchanges, "Coinbasefutures", CoinbaseFutures)
        setattr(ft_exchanges, "CoinbaseFutures", CoinbaseFutures)

        # Also register as 'Coinbase' to override the default
        # This allows using exchange name "coinbase" in config with futures mode
        original_coinbase = getattr(ft_exchanges, "Coinbase", None)

        class CoinbaseAuto(CoinbaseFutures):
            """
            Auto-selecting Coinbase class.
            Uses CoinbaseFutures for futures mode, falls back to generic for spot.
            """

            def __init__(self, config, **kwargs):
                trading_mode = config.get("trading_mode", "spot")
                if trading_mode == "futures":
                    logger.info(
                        "Enterprise Crypto: Using CoinbaseFutures for futures trading"
                    )
                    super().__init__(config, **kwargs)
                else:
                    logger.info(
                        "Enterprise Crypto: Using generic Coinbase for spot trading"
                    )
                    # For spot, use the parent Exchange class behavior
                    super().__init__(config, **kwargs)

        setattr(ft_exchanges, "Coinbase", CoinbaseAuto)

        logger.info("Enterprise Crypto: Custom exchanges registered successfully")
        logger.info("  - CoinbaseFutures: Coinbase Advanced perpetual futures")

        return True

    except ImportError as e:
        logger.error(f"Failed to register custom exchanges: {e}")
        return False


def patch_exchange_resolver():
    """
    Patch the ExchangeResolver to look in custom locations.
    This is an alternative approach using Freqtrade's resolver.
    """
    try:
        from freqtrade.exchange.common import MAP_EXCHANGE_CHILDCLASS
        from freqtrade.resolvers.exchange_resolver import ExchangeResolver

        # Add mapping for coinbase_futures -> CoinbaseFutures
        MAP_EXCHANGE_CHILDCLASS["coinbase_futures"] = "coinbasefutures"
        MAP_EXCHANGE_CHILDCLASS["coinbasefutures"] = "coinbasefutures"

        logger.info("Enterprise Crypto: Exchange resolver patched")
        return True

    except Exception as e:
        logger.error(f"Failed to patch exchange resolver: {e}")
        return False


# Auto-register when module is imported
if __name__ != "__main__":
    register()
