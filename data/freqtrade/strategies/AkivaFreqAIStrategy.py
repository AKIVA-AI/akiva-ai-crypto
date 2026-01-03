"""
Akiva FreqAI Strategy - ML-Powered Production Strategy

Based on FreqTrade's official FreqaiExampleStrategy.
Uses machine learning for signal generation.

IMPORTANT: 
- Requires FreqAI to be properly configured
- Requires model training before live trading
- Run extensive backtests before production!

This is NOT a toy - this is production ML trading.
"""

import logging
from functools import reduce

import numpy as np
import talib.abstract as ta
from pandas import DataFrame
from technical import qtpylib

from freqtrade.strategy import IStrategy, DecimalParameter, IntParameter


logger = logging.getLogger(__name__)


class AkivaFreqAIStrategy(IStrategy):
    """
    Production FreqAI strategy for Akiva AI Crypto platform.
    
    Uses machine learning models to predict price movements.
    The model predicts the smoothed close price change over a future window.
    
    WARNING: ML strategies require:
    1. Proper model training with sufficient data
    2. Regular retraining to adapt to market changes
    3. Extensive backtesting and paper trading
    4. Risk management beyond the strategy itself
    """

    INTERFACE_VERSION = 3

    # Timeframe for the strategy
    timeframe = "5m"

    # Conservative ROI for ML strategy
    minimal_roi = {"0": 0.1, "240": -1}

    # Moderate stoploss - ML should handle exits
    stoploss = -0.05

    # Allow both long and short for ML strategies
    can_short = True

    # Process only new candles
    process_only_new_candles = True
    use_exit_signal = True

    # Candles needed for feature engineering warmup
    startup_candle_count: int = 40

    # Prediction threshold parameters (hyperopt-ready)
    entry_threshold_long = DecimalParameter(
        0.005, 0.03, default=0.01, space="buy", optimize=True, load=True
    )
    entry_threshold_short = DecimalParameter(
        -0.03, -0.005, default=-0.01, space="sell", optimize=True, load=True
    )

    # Plot configuration
    plot_config = {
        "main_plot": {},
        "subplots": {
            "&-s_close": {"&-s_close": {"color": "blue"}},
            "do_predict": {"do_predict": {"color": "brown"}},
        },
    }

    def feature_engineering_expand_all(
        self, dataframe: DataFrame, period: int, metadata: dict, **kwargs
    ) -> DataFrame:
        """
        Features that expand across all configured periods.
        These create multiple features per indicator (one per period).
        """
        # Momentum indicators
        dataframe["%-rsi-period"] = ta.RSI(dataframe, timeperiod=period)
        dataframe["%-mfi-period"] = ta.MFI(dataframe, timeperiod=period)
        dataframe["%-adx-period"] = ta.ADX(dataframe, timeperiod=period)
        
        # Moving averages
        dataframe["%-sma-period"] = ta.SMA(dataframe, timeperiod=period)
        dataframe["%-ema-period"] = ta.EMA(dataframe, timeperiod=period)

        # Bollinger Bands
        bollinger = qtpylib.bollinger_bands(
            qtpylib.typical_price(dataframe), window=period, stds=2.2
        )
        dataframe["bb_lowerband-period"] = bollinger["lower"]
        dataframe["bb_middleband-period"] = bollinger["mid"]
        dataframe["bb_upperband-period"] = bollinger["upper"]

        dataframe["%-bb_width-period"] = (
            dataframe["bb_upperband-period"] - dataframe["bb_lowerband-period"]
        ) / dataframe["bb_middleband-period"]
        dataframe["%-close-bb_lower-period"] = (
            dataframe["close"] / dataframe["bb_lowerband-period"]
        )

        # Rate of change
        dataframe["%-roc-period"] = ta.ROC(dataframe, timeperiod=period)

        # Relative volume
        dataframe["%-relative_volume-period"] = (
            dataframe["volume"] / dataframe["volume"].rolling(period).mean()
        )

        return dataframe

    def feature_engineering_expand_basic(
        self, dataframe: DataFrame, metadata: dict, **kwargs
    ) -> DataFrame:
        """
        Basic features that expand across timeframes but not periods.
        """
        dataframe["%-pct-change"] = dataframe["close"].pct_change()
        dataframe["%-raw_volume"] = dataframe["volume"]
        dataframe["%-raw_price"] = dataframe["close"]
        return dataframe

    def feature_engineering_standard(
        self, dataframe: DataFrame, metadata: dict, **kwargs
    ) -> DataFrame:
        """
        Standard features - no expansion.
        Good for time-based features.
        """
        dataframe["%-day_of_week"] = dataframe["date"].dt.dayofweek
        dataframe["%-hour_of_day"] = dataframe["date"].dt.hour
        return dataframe

    def set_freqai_targets(self, dataframe: DataFrame, metadata: dict, **kwargs) -> DataFrame:
        """
        Define prediction targets for the ML model.
        
        Target: Smoothed close price change over future window.
        """
        label_period = self.freqai_info["feature_parameters"]["label_period_candles"]
        
        dataframe["&-s_close"] = (
            dataframe["close"]
            .shift(-label_period)
            .rolling(label_period)
            .mean()
            / dataframe["close"]
            - 1
        )

        return dataframe

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Indicators populated by FreqAI.
        """
        dataframe = self.freqai.start(dataframe, metadata, self)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Entry based on ML predictions.
        """
        # Long entries
        enter_long_conditions = [
            dataframe["do_predict"] == 1,
            dataframe["&-s_close"] > self.entry_threshold_long.value,
        ]

        if enter_long_conditions:
            dataframe.loc[
                reduce(lambda x, y: x & y, enter_long_conditions),
                ["enter_long", "enter_tag"],
            ] = (1, "ml_long")

        # Short entries
        enter_short_conditions = [
            dataframe["do_predict"] == 1,
            dataframe["&-s_close"] < self.entry_threshold_short.value,
        ]

        if enter_short_conditions:
            dataframe.loc[
                reduce(lambda x, y: x & y, enter_short_conditions),
                ["enter_short", "enter_tag"],
            ] = (1, "ml_short")

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Exit based on ML predictions reversing.
        """
        # Exit long when prediction turns negative
        exit_long_conditions = [
            dataframe["do_predict"] == 1,
            dataframe["&-s_close"] < 0,
        ]
        if exit_long_conditions:
            dataframe.loc[
                reduce(lambda x, y: x & y, exit_long_conditions), "exit_long"
            ] = 1

        # Exit short when prediction turns positive
        exit_short_conditions = [
            dataframe["do_predict"] == 1,
            dataframe["&-s_close"] > 0,
        ]
        if exit_short_conditions:
            dataframe.loc[
                reduce(lambda x, y: x & y, exit_short_conditions), "exit_short"
            ] = 1

        return dataframe

