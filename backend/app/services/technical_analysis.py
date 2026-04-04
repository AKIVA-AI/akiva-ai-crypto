"""
Technical Analysis Engine - Real TA Indicators

Production-grade technical analysis with proper calculations:
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- ATR (Average True Range)
- EMA/SMA Moving Averages
- Volume Profile
- Support/Resistance Detection
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import structlog

logger = structlog.get_logger()


@dataclass
class TASignal:
    """Technical analysis signal."""

    indicator: str
    instrument: str
    direction: str  # 'bullish', 'bearish', 'neutral'
    strength: float  # 0-1
    value: float
    threshold: Optional[float] = None
    timestamp: datetime = None
    metadata: Dict = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        if self.metadata is None:
            self.metadata = {}


@dataclass
class PriceData:
    """OHLCV price data."""

    timestamp: List[datetime]
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray


class TechnicalAnalysisEngine:
    """
    Production technical analysis engine with real indicator calculations.
    """

    def __init__(self):
        self._price_cache: Dict[str, PriceData] = {}

    def calculate_rsi(
        self, prices: np.ndarray, period: int = 14
    ) -> Tuple[float, TASignal]:
        """
        Calculate Relative Strength Index.

        RSI = 100 - (100 / (1 + RS))
        RS = Average Gain / Average Loss
        """
        if len(prices) < period + 1:
            return 50.0, None

        # Calculate price changes
        deltas = np.diff(prices)

        # Separate gains and losses
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        # Calculate average gains and losses using EMA
        avg_gain = self._ema(gains, period)[-1]
        avg_loss = self._ema(losses, period)[-1]

        if avg_loss == 0:
            rsi = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

        # Determine signal
        if rsi < 30:
            direction = "bullish"
            strength = (30 - rsi) / 30
        elif rsi > 70:
            direction = "bearish"
            strength = (rsi - 70) / 30
        else:
            direction = "neutral"
            strength = 0.0

        signal = TASignal(
            indicator="RSI",
            instrument="",
            direction=direction,
            strength=min(1.0, strength),
            value=rsi,
            threshold=30
            if direction == "bullish"
            else 70
            if direction == "bearish"
            else 50,
            metadata={"period": period},
        )

        return rsi, signal

    def calculate_macd(
        self,
        prices: np.ndarray,
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9,
    ) -> Tuple[Dict, TASignal]:
        """
        Calculate MACD (Moving Average Convergence Divergence).

        MACD Line = 12-period EMA - 26-period EMA
        Signal Line = 9-period EMA of MACD Line
        Histogram = MACD Line - Signal Line
        """
        if len(prices) < slow_period + signal_period:
            return {}, None

        # Calculate EMAs
        fast_ema = self._ema(prices, fast_period)
        slow_ema = self._ema(prices, slow_period)

        # MACD line
        macd_line = fast_ema - slow_ema

        # Signal line (EMA of MACD)
        signal_line = self._ema(macd_line[slow_period - fast_period :], signal_period)

        # Align arrays
        macd_trimmed = macd_line[-(len(signal_line)) :]
        histogram = macd_trimmed - signal_line

        current_macd = macd_trimmed[-1]
        current_signal = signal_line[-1]
        current_histogram = histogram[-1]

        # Determine signal
        # Bullish: MACD crosses above signal, or histogram turning positive
        # Bearish: MACD crosses below signal, or histogram turning negative
        prev_histogram = histogram[-2] if len(histogram) > 1 else 0

        if current_histogram > 0 and prev_histogram <= 0:
            direction = "bullish"
            strength = min(
                1.0,
                abs(current_histogram) / abs(current_macd)
                if current_macd != 0
                else 0.5,
            )
        elif current_histogram < 0 and prev_histogram >= 0:
            direction = "bearish"
            strength = min(
                1.0,
                abs(current_histogram) / abs(current_macd)
                if current_macd != 0
                else 0.5,
            )
        elif current_histogram > 0:
            direction = "bullish"
            strength = 0.3  # Continuation, not crossover
        elif current_histogram < 0:
            direction = "bearish"
            strength = 0.3
        else:
            direction = "neutral"
            strength = 0.0

        result = {
            "macd": current_macd,
            "signal": current_signal,
            "histogram": current_histogram,
            "histogram_prev": prev_histogram,
        }

        signal = TASignal(
            indicator="MACD",
            instrument="",
            direction=direction,
            strength=strength,
            value=current_macd,
            metadata={
                "signal_line": current_signal,
                "histogram": current_histogram,
                "crossover": direction != "neutral"
                and abs(prev_histogram) < abs(current_histogram),
            },
        )

        return result, signal

    def calculate_bollinger_bands(
        self, prices: np.ndarray, period: int = 20, std_dev: float = 2.0
    ) -> Tuple[Dict, TASignal]:
        """
        Calculate Bollinger Bands.

        Middle Band = 20-period SMA
        Upper Band = Middle Band + (2 * 20-period standard deviation)
        Lower Band = Middle Band - (2 * 20-period standard deviation)
        """
        if len(prices) < period:
            return {}, None

        # Calculate SMA
        sma = self._sma(prices, period)

        # Calculate rolling standard deviation
        rolling_std = np.array(
            [np.std(prices[max(0, i - period + 1) : i + 1]) for i in range(len(prices))]
        )

        upper_band = sma + (std_dev * rolling_std)
        lower_band = sma - (std_dev * rolling_std)

        current_price = prices[-1]
        current_upper = upper_band[-1]
        current_lower = lower_band[-1]
        current_middle = sma[-1]

        # Bandwidth (volatility indicator)
        bandwidth = (current_upper - current_lower) / current_middle

        # %B indicator (where price is within the bands)
        percent_b = (
            (current_price - current_lower) / (current_upper - current_lower)
            if current_upper != current_lower
            else 0.5
        )

        # Determine signal
        if percent_b < 0:
            # Below lower band - oversold
            direction = "bullish"
            strength = min(1.0, abs(percent_b))
        elif percent_b > 1:
            # Above upper band - overbought
            direction = "bearish"
            strength = min(1.0, percent_b - 1)
        elif percent_b < 0.2:
            direction = "bullish"
            strength = 0.4
        elif percent_b > 0.8:
            direction = "bearish"
            strength = 0.4
        else:
            direction = "neutral"
            strength = 0.0

        result = {
            "upper": current_upper,
            "middle": current_middle,
            "lower": current_lower,
            "bandwidth": bandwidth,
            "percent_b": percent_b,
        }

        signal = TASignal(
            indicator="BollingerBands",
            instrument="",
            direction=direction,
            strength=strength,
            value=percent_b,
            metadata={
                "bandwidth": bandwidth,
                "upper": current_upper,
                "lower": current_lower,
                "price": current_price,
            },
        )

        return result, signal

    def calculate_atr(
        self, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14
    ) -> Tuple[float, Dict]:
        """
        Calculate Average True Range.

        True Range = max(High - Low, |High - Previous Close|, |Low - Previous Close|)
        ATR = EMA of True Range
        """
        if len(close) < period + 1:
            return 0.0, {}

        # Calculate True Range
        high_low = high[1:] - low[1:]
        high_close = np.abs(high[1:] - close[:-1])
        low_close = np.abs(low[1:] - close[:-1])

        true_range = np.maximum(high_low, np.maximum(high_close, low_close))

        # ATR is EMA of True Range
        atr_values = self._ema(true_range, period)
        current_atr = atr_values[-1]

        # ATR as percentage of price
        atr_percent = (current_atr / close[-1]) * 100

        # Volatility assessment
        historical_atr_pct = np.mean(atr_values / close[-(len(atr_values)) :]) * 100

        result = {
            "atr": current_atr,
            "atr_percent": atr_percent,
            "historical_avg_percent": historical_atr_pct,
            "volatility_state": "high"
            if atr_percent > historical_atr_pct * 1.5
            else "low"
            if atr_percent < historical_atr_pct * 0.5
            else "normal",
        }

        return current_atr, result

    def calculate_ema(self, prices: np.ndarray, period: int) -> np.ndarray:
        """Calculate Exponential Moving Average."""
        return self._ema(prices, period)

    def calculate_sma(self, prices: np.ndarray, period: int) -> np.ndarray:
        """Calculate Simple Moving Average."""
        return self._sma(prices, period)

    def calculate_vwap(
        self, high: np.ndarray, low: np.ndarray, close: np.ndarray, volume: np.ndarray
    ) -> float:
        """
        Calculate Volume Weighted Average Price.

        VWAP = Cumulative(Typical Price * Volume) / Cumulative(Volume)
        Typical Price = (High + Low + Close) / 3
        """
        typical_price = (high + low + close) / 3
        cumulative_tp_vol = np.cumsum(typical_price * volume)
        cumulative_vol = np.cumsum(volume)

        vwap = (
            cumulative_tp_vol[-1] / cumulative_vol[-1]
            if cumulative_vol[-1] > 0
            else close[-1]
        )
        return vwap

    def detect_support_resistance(
        self,
        high: np.ndarray,
        low: np.ndarray,
        close: np.ndarray,
        lookback: int = 20,
        tolerance: float = 0.02,
    ) -> Dict[str, List[float]]:
        """
        Detect support and resistance levels using swing highs/lows.
        """
        supports = []
        resistances = []

        for i in range(lookback, len(close) - lookback):
            # Check for swing high (resistance)
            if high[i] == max(high[i - lookback : i + lookback + 1]):
                resistances.append(high[i])

            # Check for swing low (support)
            if low[i] == min(low[i - lookback : i + lookback + 1]):
                supports.append(low[i])

        # Cluster nearby levels
        supports = self._cluster_levels(supports, tolerance)
        resistances = self._cluster_levels(resistances, tolerance)

        return {
            "supports": sorted(supports),
            "resistances": sorted(resistances, reverse=True),
        }

    def generate_composite_signal(
        self,
        instrument: str,
        prices: np.ndarray,
        high: np.ndarray = None,
        low: np.ndarray = None,
        volume: np.ndarray = None,
    ) -> Dict:
        """
        Generate a composite signal from multiple indicators.
        """
        signals = []
        weights = {"RSI": 0.25, "MACD": 0.30, "BollingerBands": 0.25, "ATR": 0.20}

        # RSI
        _, rsi_signal = self.calculate_rsi(prices)
        if rsi_signal:
            rsi_signal.instrument = instrument
            signals.append(("RSI", rsi_signal))

        # MACD
        _, macd_signal = self.calculate_macd(prices)
        if macd_signal:
            macd_signal.instrument = instrument
            signals.append(("MACD", macd_signal))

        # Bollinger Bands
        _, bb_signal = self.calculate_bollinger_bands(prices)
        if bb_signal:
            bb_signal.instrument = instrument
            signals.append(("BollingerBands", bb_signal))

        # ATR (for volatility context)
        if high is not None and low is not None:
            atr_value, atr_data = self.calculate_atr(high, low, prices)
        else:
            _atr_value, atr_data = 0, {"volatility_state": "unknown"}

        # Calculate weighted composite score
        bullish_score = 0
        bearish_score = 0
        total_weight = 0

        for indicator_name, signal in signals:
            weight = weights.get(indicator_name, 0.2)
            total_weight += weight

            if signal.direction == "bullish":
                bullish_score += weight * signal.strength
            elif signal.direction == "bearish":
                bearish_score += weight * signal.strength

        # Normalize
        if total_weight > 0:
            bullish_score /= total_weight
            bearish_score /= total_weight

        # Determine overall direction
        net_score = bullish_score - bearish_score

        if net_score > 0.1:
            direction = "bullish"
            confidence = min(1.0, bullish_score)
        elif net_score < -0.1:
            direction = "bearish"
            confidence = min(1.0, bearish_score)
        else:
            direction = "neutral"
            confidence = 0.5 - abs(net_score)

        return {
            "instrument": instrument,
            "direction": direction,
            "confidence": round(confidence, 3),
            "bullish_score": round(bullish_score, 3),
            "bearish_score": round(bearish_score, 3),
            "net_score": round(net_score, 3),
            "volatility": atr_data.get("volatility_state", "unknown"),
            "signals": {
                name: {
                    "direction": sig.direction,
                    "strength": sig.strength,
                    "value": sig.value,
                }
                for name, sig in signals
            },
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _ema(self, data: np.ndarray, period: int) -> np.ndarray:
        """Calculate EMA using pandas for accuracy."""
        if len(data) < period:
            return np.full(len(data), np.nan)

        multiplier = 2 / (period + 1)
        ema = np.zeros(len(data))
        ema[:period] = np.nan
        ema[period - 1] = np.mean(data[:period])  # First EMA is SMA

        for i in range(period, len(data)):
            ema[i] = (data[i] * multiplier) + (ema[i - 1] * (1 - multiplier))

        return ema

    def _sma(self, data: np.ndarray, period: int) -> np.ndarray:
        """Calculate Simple Moving Average."""
        if len(data) < period:
            return np.full(len(data), np.nan)

        cumsum = np.cumsum(np.insert(data, 0, 0))
        sma = (cumsum[period:] - cumsum[:-period]) / period

        # Pad beginning with NaN
        result = np.full(len(data), np.nan)
        result[period - 1 :] = sma

        return result

    def _cluster_levels(self, levels: List[float], tolerance: float) -> List[float]:
        """Cluster nearby price levels."""
        if not levels:
            return []

        sorted_levels = sorted(levels)
        clusters = []
        current_cluster = [sorted_levels[0]]

        for level in sorted_levels[1:]:
            if (level - current_cluster[-1]) / current_cluster[-1] < tolerance:
                current_cluster.append(level)
            else:
                clusters.append(np.mean(current_cluster))
                current_cluster = [level]

        clusters.append(np.mean(current_cluster))
        return clusters


# Singleton instance
ta_engine = TechnicalAnalysisEngine()
