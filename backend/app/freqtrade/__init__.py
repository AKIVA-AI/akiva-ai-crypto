"""
FreqTrade Core Integration - 100% Alignment

This module provides complete FreqTrade integration:
- Strategy management (IStrategy-compatible)
- FreqAI machine learning models
- Backtesting engine
- Hyperparameter optimization
- Data provider bridge

All strategies are 100% compatible with FreqTrade's IStrategy interface.
"""

from .core import FreqTradeCore, get_freqtrade_core
from .data_provider import FreqTradeDataProvider
from .freqai_manager import FreqAIManager
from .strategy_manager import StrategyManager

__all__ = [
    "FreqTradeCore",
    "get_freqtrade_core",
    "FreqTradeDataProvider",
    "StrategyManager",
    "FreqAIManager",
]
