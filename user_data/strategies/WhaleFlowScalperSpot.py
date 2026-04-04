"""
WhaleFlowScalperSpot - SPOT TRADING VERSION

This is the spot trading version of WhaleFlowScalper.
- NO shorting (long-only)
- NO leverage
- Works on Coinbase Advanced Spot, Kraken Spot, etc.

For futures trading with shorting, use WhaleFlowScalper instead.
"""

import logging

from freqtrade.strategy import IStrategy

from user_data.strategies.WhaleFlowScalper import WhaleFlowScalper

logger = logging.getLogger(__name__)


class WhaleFlowScalperSpot(WhaleFlowScalper):
    """
    WhaleFlowScalper for SPOT TRADING ONLY.

    Inherits all logic from WhaleFlowScalper but:
    - can_short = False (long-only trading)
    - No leverage

    Use this strategy for spot markets on any exchange.
    """

    # SPOT MODE - No shorting allowed
    can_short = False

    # No leverage in spot trading
    leverage_default = 1
    max_leverage = 1

    def bot_start(self, **kwargs) -> None:
        """Called when the bot starts."""
        # Call grandparent's bot_start (skip WhaleFlowScalper's)
        IStrategy.bot_start(self, **kwargs)
        logger.info("Enterprise Crypto: WhaleFlowScalperSpot running in SPOT mode")
        logger.info("  - Shorting: DISABLED | Leverage: 1x (no leverage)")

    def populate_entry_trend(self, dataframe, metadata):
        """
        Override to only generate LONG signals (no shorts in spot).
        """
        dataframe = super().populate_entry_trend(dataframe, metadata)

        # Remove any short signals (spot mode = long only)
        if "enter_short" in dataframe.columns:
            dataframe["enter_short"] = 0

        return dataframe
