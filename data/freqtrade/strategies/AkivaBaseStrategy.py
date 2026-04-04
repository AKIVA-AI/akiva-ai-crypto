# pragma pylint: disable=missing-docstring, invalid-name, pointless-string-statement
# flake8: noqa: F401
# isort: skip_file
"""
Akiva Base Strategy - Production FreqTrade Strategy

Based on FreqTrade's official SampleStrategy template.
This is a REAL FreqTrade-compatible strategy that inherits from IStrategy.

IMPORTANT: This strategy requires FreqTrade to be properly installed.
Run backtests before using in production!
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from pandas import DataFrame
from typing import Optional, Union

from freqtrade.strategy import (
    IStrategy,
    Trade,
    Order,
    PairLocks,
    informative,
    BooleanParameter,
    CategoricalParameter,
    DecimalParameter,
    IntParameter,
    RealParameter,
    timeframe_to_minutes,
    timeframe_to_next_date,
    timeframe_to_prev_date,
    merge_informative_pair,
    stoploss_from_absolute,
    stoploss_from_open,
)

import talib.abstract as ta
from technical import qtpylib


class AkivaBaseStrategy(IStrategy):
    """
    Production-ready base strategy for Akiva AI Crypto platform.

    Based on FreqTrade's official template with conservative settings
    suitable for initial production deployment.

    Key Features:
    - RSI-based entry with Bollinger Band confirmation
    - TEMA trend filter
    - Volume confirmation
    - Hyperopt-ready parameters
    - Conservative risk management

    ALWAYS backtest before live trading!
    """

    INTERFACE_VERSION = 3

    # Disable shorting by default for safety
    can_short: bool = False

    # Conservative ROI - adjust after backtesting
    minimal_roi = {
        "120": 0.0,  # Break even after 2 hours
        "60": 0.01,  # 1% after 1 hour
        "30": 0.02,  # 2% after 30 min
        "0": 0.04,  # 4% immediate
    }

    # Conservative stoploss
    stoploss = -0.10

    # Trailing stop for profit protection
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.02
    trailing_only_offset_is_reached = True

    # 5-minute timeframe - good balance of signals and noise
    timeframe = "5m"

    # Only process new candles for efficiency
    process_only_new_candles = True

    # Use exit signals
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False

    # Hyperopt parameters
    buy_rsi = IntParameter(
        low=20, high=40, default=30, space="buy", optimize=True, load=True
    )
    sell_rsi = IntParameter(
        low=60, high=80, default=70, space="sell", optimize=True, load=True
    )

    # Candles needed for indicator warmup
    startup_candle_count: int = 200

    # Order configuration
    order_types = {
        "entry": "limit",
        "exit": "limit",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }

    order_time_in_force = {"entry": "GTC", "exit": "GTC"}

    # Plot configuration for UI
    plot_config = {
        "main_plot": {
            "tema": {},
            "bb_upperband": {"color": "green"},
            "bb_lowerband": {"color": "red"},
        },
        "subplots": {
            "RSI": {
                "rsi": {"color": "red"},
            },
        },
    }

    def informative_pairs(self):
        """Define additional pairs for multi-timeframe analysis."""
        return []

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Populate indicators using TA-Lib (production-grade).
        """
        # RSI
        dataframe["rsi"] = ta.RSI(dataframe)

        # MACD
        macd = ta.MACD(dataframe)
        dataframe["macd"] = macd["macd"]
        dataframe["macdsignal"] = macd["macdsignal"]
        dataframe["macdhist"] = macd["macdhist"]

        # Bollinger Bands
        bollinger = qtpylib.bollinger_bands(
            qtpylib.typical_price(dataframe), window=20, stds=2
        )
        dataframe["bb_lowerband"] = bollinger["lower"]
        dataframe["bb_middleband"] = bollinger["mid"]
        dataframe["bb_upperband"] = bollinger["upper"]

        # TEMA - Triple Exponential Moving Average
        dataframe["tema"] = ta.TEMA(dataframe, timeperiod=9)

        # MFI - Money Flow Index
        dataframe["mfi"] = ta.MFI(dataframe)

        # ADX - Average Directional Index (trend strength)
        dataframe["adx"] = ta.ADX(dataframe)

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Entry conditions - conservative approach.
        """
        dataframe.loc[
            (
                # RSI crosses above buy threshold (oversold recovery)
                (qtpylib.crossed_above(dataframe["rsi"], self.buy_rsi.value))
                # TEMA below BB middle (room to grow)
                & (dataframe["tema"] <= dataframe["bb_middleband"])
                # TEMA rising (momentum)
                & (dataframe["tema"] > dataframe["tema"].shift(1))
                # Volume present
                & (dataframe["volume"] > 0)
            ),
            "enter_long",
        ] = 1

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Exit conditions - protect profits.
        """
        dataframe.loc[
            (
                # RSI crosses above sell threshold (overbought)
                (qtpylib.crossed_above(dataframe["rsi"], self.sell_rsi.value))
                # TEMA above BB middle
                & (dataframe["tema"] > dataframe["bb_middleband"])
                # TEMA falling (momentum loss)
                & (dataframe["tema"] < dataframe["tema"].shift(1))
                # Volume present
                & (dataframe["volume"] > 0)
            ),
            "exit_long",
        ] = 1

        return dataframe
