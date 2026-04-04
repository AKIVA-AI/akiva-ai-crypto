"""
Leverage Mixin - Configurable leverage for all strategies.

HIERARCHY (most restrictive wins):
    final_leverage = min(user_wants, admin_allows, exchange_allows)

Config Example:
{
    "leverage": {
        "default": 3,
        "max": 10,
        "pair_leverage": {
            "BTC/USD": 5,
            "ETH/USD": 5
        }
    },
    "enterprise_restrictions": {
        "max_leverage": 10,
        "allow_shorting": true
    },
    "user_preferences": {
        "preferred_leverage": 3,
        "position_size_pct": 10
    }
}
"""

import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Import TradingConfig if available
try:
    from .trading_config import EXCHANGE_LIMITS, TradingConfig
except ImportError:
    TradingConfig = None
    EXCHANGE_LIMITS = {}


class LeverageMixin:
    """
    Mixin class that provides configurable leverage for any strategy.
    Works with TradingConfig for full user/admin/exchange limit hierarchy.

    Usage:
        class MyStrategy(IStrategy, LeverageMixin):
            can_short = True  # Enable shorting support
    """

    # Fallback defaults
    leverage_default = 1
    max_leverage = 10
    _trading_config: Optional["TradingConfig"] = None

    def get_trading_config(self) -> Optional["TradingConfig"]:
        """Get or create TradingConfig instance."""
        if self._trading_config is None and TradingConfig and hasattr(self, "config"):
            self._trading_config = TradingConfig(self.config)
        return self._trading_config

    def get_leverage_config(self) -> dict:
        """Get leverage config from FreqTrade config file."""
        if hasattr(self, "config") and self.config:
            return self.config.get("leverage", {})
        return {}

    def get_pair_leverage(self, pair: str, exchange_max: float = None) -> float:
        """
        Get safe leverage for a pair considering all limits.

        Priority: min(user_wants, admin_allows, exchange_allows)
        """
        trading_config = self.get_trading_config()

        if trading_config:
            return trading_config.get_leverage(pair, exchange_max)

        # Fallback to simple config
        lev_config = self.get_leverage_config()
        pair_leverage = lev_config.get("pair_leverage", {})

        user_wants = float(
            pair_leverage.get(pair, lev_config.get("default", self.leverage_default))
        )
        our_max = float(lev_config.get("max", self.max_leverage))

        if exchange_max:
            return min(user_wants, our_max, exchange_max)
        return min(user_wants, our_max)

    def can_short_pair(self, pair: str = None) -> bool:
        """Check if shorting is allowed for this pair."""
        trading_config = self.get_trading_config()

        if trading_config:
            return trading_config.can_short(pair)

        # Fallback - check config trading_mode
        if hasattr(self, "config") and self.config:
            mode = self.config.get("trading_mode", "spot")
            return mode in ("futures", "margin")

        return False

    def leverage(
        self,
        pair: str,
        current_time: datetime,
        current_rate: float,
        proposed_leverage: float,
        max_leverage: float,
        entry_tag: str | None,
        side: str,
        **kwargs,
    ) -> float:
        """
        Return leverage for a trade.

        Returns: min(user_wants, admin_allows, exchange_allows)
        """
        final_leverage = self.get_pair_leverage(pair, max_leverage)

        logger.info(
            f"[Leverage] {pair} {side}: "
            f"exchange_max={max_leverage}x -> "
            f"using {final_leverage}x"
        )

        return final_leverage

    def validate_trade_params(
        self, pair: str, side: str, leverage: float
    ) -> tuple[bool, str]:
        """Validate trade against all restrictions."""
        trading_config = self.get_trading_config()

        if trading_config:
            return trading_config.validate_trade(pair, side, leverage)

        return True, "OK"


def calculate_leverage(
    config: dict,
    pair: str,
    exchange_max: float,
    fallback_default: float = 1,
    fallback_max: float = 10,
) -> float:
    """
    Standalone function to calculate safe leverage.

    Returns: min(user_wants, admin_allows, exchange_allows)
    """
    if TradingConfig:
        tc = TradingConfig(config)
        return tc.get_leverage(pair, exchange_max)

    # Fallback
    lev_config = config.get("leverage", {})
    pair_leverage = lev_config.get("pair_leverage", {})
    user_wants = pair_leverage.get(pair, lev_config.get("default", fallback_default))
    our_max = lev_config.get("max", fallback_max)

    return min(float(user_wants), float(exchange_max), float(our_max))
