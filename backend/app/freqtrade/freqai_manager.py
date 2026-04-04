"""
FreqAI Manager - Machine Learning Model Management

Manages FreqAI machine learning models:
- Model training and inference
- Feature engineering
- Model persistence
- GPU acceleration
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import numpy as np

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class FreqAIModelConfig:
    """FreqAI model configuration."""

    model_type: str = "LightGBMRegressor"
    label_period_candles: int = 24
    training_period_days: int = 30
    feature_parameters: Dict[str, Any] = field(
        default_factory=lambda: {
            "include_timeframes": ["5m", "15m", "1h"],
            "include_corr_pairlist": ["BTC/USDT", "ETH/USDT"],
            "indicator_periods_candles": [10, 20, 50],
        }
    )
    data_split_parameters: Dict[str, Any] = field(
        default_factory=lambda: {
            "test_size": 0.1,
            "random_state": 42,
        }
    )


@dataclass
class ModelInfo:
    """Information about a trained model."""

    model_id: str
    model_type: str
    pair: str
    timeframe: str
    training_date: datetime
    training_samples: int
    feature_count: int
    metrics: Dict[str, float]
    file_path: str


class FreqAIManager:
    """
    FreqAI Model Manager.

    Manages machine learning models for FreqTrade:
    - LightGBM, XGBoost, CatBoost regressors/classifiers
    - Neural network models (PyTorch)
    - Reinforcement learning models

    Supports GPU acceleration via CUDA.
    """

    SUPPORTED_MODELS = [
        "LightGBMRegressor",
        "LightGBMClassifier",
        "XGBoostRegressor",
        "XGBoostClassifier",
        "CatBoostRegressor",
        "CatBoostClassifier",
        "PyTorchMLPRegressor",
        "PyTorchMLPClassifier",
        "ReinforcementLearner",
    ]

    def __init__(
        self,
        model_dir: str = "data/freqtrade/models",
        config: Optional[FreqAIModelConfig] = None,
    ):
        self.model_dir = Path(model_dir)
        self.config = config or FreqAIModelConfig()
        self._models: Dict[str, Any] = {}
        self._model_info: Dict[str, ModelInfo] = {}
        self._gpu_available = self._check_gpu()

        self.model_dir.mkdir(parents=True, exist_ok=True)

    @property
    def gpu_available(self) -> bool:
        """Whether GPU acceleration is available."""
        return self._gpu_available

    def _check_gpu(self) -> bool:
        """Check if GPU is available."""
        try:
            import torch

            return torch.cuda.is_available()
        except ImportError:
            return False

    def create_model(self, model_type: str) -> Optional[Any]:
        """Create a new model instance."""
        if model_type not in self.SUPPORTED_MODELS:
            logger.error(f"Unsupported model type: {model_type}")
            return None

        try:
            if "LightGBM" in model_type:
                import lightgbm as lgb

                params = {
                    "objective": "regression"
                    if "Regressor" in model_type
                    else "binary",
                    "boosting_type": "gbdt",
                    "n_estimators": 1000,
                    "learning_rate": 0.05,
                    "num_leaves": 31,
                    "device": "gpu" if self._gpu_available else "cpu",
                }
                return (
                    lgb.LGBMRegressor(**params)
                    if "Regressor" in model_type
                    else lgb.LGBMClassifier(**params)
                )

            elif "XGBoost" in model_type:
                import xgboost as xgb

                params = {
                    "objective": "reg:squarederror"
                    if "Regressor" in model_type
                    else "binary:logistic",
                    "n_estimators": 1000,
                    "learning_rate": 0.05,
                    "max_depth": 6,
                    "tree_method": "gpu_hist" if self._gpu_available else "hist",
                }
                return (
                    xgb.XGBRegressor(**params)
                    if "Regressor" in model_type
                    else xgb.XGBClassifier(**params)
                )

            elif "CatBoost" in model_type:
                from catboost import CatBoostClassifier, CatBoostRegressor

                params = {
                    "iterations": 1000,
                    "learning_rate": 0.05,
                    "depth": 6,
                    "task_type": "GPU" if self._gpu_available else "CPU",
                    "verbose": False,
                }
                return (
                    CatBoostRegressor(**params)
                    if "Regressor" in model_type
                    else CatBoostClassifier(**params)
                )

            else:
                logger.warning(f"Model type {model_type} not yet implemented")
                return None

        except ImportError as e:
            logger.error(f"Required library not installed for {model_type}: {e}")
            return None

    def train_model(
        self,
        model_id: str,
        model_type: str,
        X_train: np.ndarray,
        y_train: np.ndarray,
        pair: str,
        timeframe: str,
    ) -> bool:
        """Train a model."""
        model = self.create_model(model_type)
        if model is None:
            return False

        try:
            logger.info(f"Training {model_type} model for {pair}...")
            model.fit(X_train, y_train)

            self._models[model_id] = model
            self._model_info[model_id] = ModelInfo(
                model_id=model_id,
                model_type=model_type,
                pair=pair,
                timeframe=timeframe,
                training_date=datetime.utcnow(),
                training_samples=len(X_train),
                feature_count=X_train.shape[1],
                metrics={},
                file_path=str(self.model_dir / f"{model_id}.pkl"),
            )

            logger.info(f"Model {model_id} trained successfully")
            return True

        except Exception as e:
            logger.error(f"Model training failed: {e}")
            return False

    def predict(self, model_id: str, X: np.ndarray) -> Optional[np.ndarray]:
        """Make predictions with a model."""
        model = self._models.get(model_id)
        if model is None:
            logger.warning(f"Model {model_id} not found")
            return None

        try:
            return model.predict(X)
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            return None

    def list_models(self) -> List[Dict[str, Any]]:
        """List all available models and their status."""
        models = []

        # Include any trained/loaded models
        for model_id, info in self._model_info.items():
            accuracy = info.metrics.get("accuracy") if info.metrics else None
            models.append(
                {
                    "name": info.model_type,
                    "model_id": model_id,
                    "trained": True,
                    "last_trained": info.training_date.isoformat(),
                    "accuracy": accuracy,
                    "pair": info.pair,
                    "timeframe": info.timeframe,
                    "training_samples": info.training_samples,
                    "feature_count": info.feature_count,
                }
            )

        # Also list supported model types that are not yet trained
        trained_types = {info.model_type for info in self._model_info.values()}
        for model_type in self.SUPPORTED_MODELS:
            if model_type not in trained_types:
                models.append(
                    {
                        "name": model_type,
                        "trained": False,
                        "last_trained": None,
                        "accuracy": None,
                    }
                )

        return models

    def get_status(self) -> Dict[str, Any]:
        """Get FreqAI manager status."""
        return {
            "model_dir": str(self.model_dir),
            "gpu_available": self._gpu_available,
            "loaded_models": len(self._models),
            "supported_models": self.SUPPORTED_MODELS,
            "config": {
                "model_type": self.config.model_type,
                "label_period_candles": self.config.label_period_candles,
                "training_period_days": self.config.training_period_days,
            },
        }

    async def train(self, model_name: str, pair: str) -> bool:
        """
        Train an ML model on historical data for a given pair.

        Fetches data via the data provider, prepares features, creates
        labels (forward returns), and trains the specified model type.
        """
        try:
            from app.freqtrade.data_provider import FreqTradeDataProvider

            data_provider = FreqTradeDataProvider()
            df = data_provider.get_ohlcv(pair=pair, limit=500)

            if df is None or len(df) < 100:
                logger.error(f"Insufficient data to train model for {pair}")
                return False

            featured_df = self.prepare_features(df)
            if len(featured_df) < 50:
                logger.error("Not enough rows after feature preparation")
                return False

            # Create labels: forward return over label_period_candles
            label_period = self.config.label_period_candles
            featured_df["label"] = (
                featured_df["close"].pct_change(label_period).shift(-label_period)
            )
            featured_df = featured_df.dropna()

            exclude_cols = ["open", "high", "low", "close", "volume", "date", "label"]
            feature_cols = [c for c in featured_df.columns if c not in exclude_cols]

            X = featured_df[feature_cols].values
            y = featured_df["label"].values

            # Train/test split
            split_idx = int(len(X) * 0.9)
            X_train, _X_test = X[:split_idx], X[split_idx:]
            y_train, _y_test = y[:split_idx], y[split_idx:]

            model_id = f"{model_name}_{pair.replace('/', '_').replace('-', '_')}"
            success = self.train_model(
                model_id, model_name, X_train, y_train, pair, "5m"
            )

            if success:
                # Store as named model for generate_ml_signals lookup
                self._models[model_name] = {
                    "model": self._models[model_id],
                    "trained": True,
                    "model_id": model_id,
                }
                logger.info(
                    f"Model {model_name} trained for {pair} with {len(X_train)} samples"
                )

            return success

        except Exception as e:
            logger.error(f"Training failed for {model_name} on {pair}: {e}")
            return False

    def prepare_features(self, df: "pd.DataFrame") -> "pd.DataFrame":
        """
        Prepare standard feature set for ML model training/prediction.

        Creates technical indicators as features:
        - Price-based: returns, log returns, price ratios
        - Momentum: RSI, MACD, ROC
        - Volatility: ATR, Bollinger Band width, historical vol
        - Volume: OBV trend, volume ratio, VWAP distance
        - Pattern: Higher highs/lows, support/resistance distance
        """
        try:
            import numpy as np
            import pandas as pd

            features = df.copy()
            close = features["close"]
            high = features["high"]
            low = features["low"]
            volume = features["volume"]

            # Price returns at multiple horizons
            for period in [1, 3, 5, 10, 20]:
                features[f"return_{period}"] = close.pct_change(period)
                features[f"log_return_{period}"] = np.log(close / close.shift(period))

            # RSI
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss.replace(0, np.nan)
            features["rsi_14"] = 100 - (100 / (1 + rs))

            # MACD
            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            features["macd"] = ema12 - ema26
            features["macd_signal"] = features["macd"].ewm(span=9).mean()
            features["macd_histogram"] = features["macd"] - features["macd_signal"]

            # ATR
            tr = pd.DataFrame(
                {
                    "hl": high - low,
                    "hc": (high - close.shift()).abs(),
                    "lc": (low - close.shift()).abs(),
                }
            ).max(axis=1)
            features["atr_14"] = tr.rolling(14).mean()
            features["atr_pct"] = features["atr_14"] / close

            # Bollinger Bands
            sma20 = close.rolling(20).mean()
            std20 = close.rolling(20).std()
            features["bb_upper"] = sma20 + 2 * std20
            features["bb_lower"] = sma20 - 2 * std20
            features["bb_width"] = (features["bb_upper"] - features["bb_lower"]) / sma20
            features["bb_position"] = (close - features["bb_lower"]) / (
                features["bb_upper"] - features["bb_lower"]
            )

            # Volume features
            features["volume_sma_ratio"] = volume / volume.rolling(20).mean()
            features["vwap"] = (close * volume).cumsum() / volume.cumsum()
            features["vwap_distance"] = (close - features["vwap"]) / features["vwap"]

            # Historical volatility
            features["volatility_20"] = close.pct_change().rolling(20).std() * np.sqrt(
                252
            )

            # Rate of change
            features["roc_10"] = close.pct_change(10) * 100
            features["roc_20"] = close.pct_change(20) * 100

            # Drop NaN rows from indicator warmup
            features = features.dropna()

            logger.info(
                f"Prepared {len(features.columns)} features from {len(features)} candles"
            )
            return features

        except ImportError:
            logger.error("pandas/numpy required for feature preparation")
            return df

    async def generate_ml_signals(
        self, pair: str, df: "pd.DataFrame", model_name: str = "LightGBMRegressor"
    ) -> Dict[str, Any]:
        """
        Generate trading signals using ML model prediction.

        Returns signal dict compatible with the agent system:
        - direction: buy/sell/hold
        - confidence: 0-100
        - predicted_return: expected return percentage
        - features_used: list of features that drove the prediction
        """
        try:
            # Prepare features
            featured_df = self.prepare_features(df)

            if len(featured_df) < 50:
                return {
                    "direction": "hold",
                    "confidence": 0,
                    "reason": "insufficient_data",
                }

            # Get feature columns (exclude OHLCV and date)
            exclude_cols = ["open", "high", "low", "close", "volume", "date"]
            feature_cols = [c for c in featured_df.columns if c not in exclude_cols]

            X = featured_df[feature_cols].values
            latest_features = X[-1:]

            # Check if we have a trained model
            if (
                model_name in self._models
                and isinstance(self._models[model_name], dict)
                and self._models[model_name].get("trained")
            ):
                model = self._models[model_name]["model"]
                prediction = model.predict(latest_features)[0]
            else:
                # Fallback: use ensemble of simple indicators
                rsi = featured_df["rsi_14"].iloc[-1]
                macd_hist = featured_df["macd_histogram"].iloc[-1]
                bb_pos = featured_df["bb_position"].iloc[-1]
                vol_ratio = featured_df["volume_sma_ratio"].iloc[-1]

                # Simple scoring
                score = 0
                if rsi < 30:
                    score += 2
                elif rsi > 70:
                    score -= 2
                elif rsi < 45:
                    score += 1
                elif rsi > 55:
                    score -= 1

                if macd_hist > 0:
                    score += 1
                else:
                    score -= 1

                if bb_pos < 0.2:
                    score += 1.5  # Near lower band
                elif bb_pos > 0.8:
                    score -= 1.5  # Near upper band

                if vol_ratio > 1.5:
                    score *= 1.2  # Volume confirmation

                prediction = score / 10  # Normalize to roughly -1 to 1

            # Convert prediction to signal
            if prediction > 0.02:
                direction = "buy"
                confidence = min(abs(prediction) * 200, 95)
            elif prediction < -0.02:
                direction = "sell"
                confidence = min(abs(prediction) * 200, 95)
            else:
                direction = "hold"
                confidence = 0

            return {
                "direction": direction,
                "confidence": round(confidence, 2),
                "predicted_return": round(float(prediction) * 100, 4),
                "model": model_name,
                "pair": pair,
                "features_snapshot": {
                    "rsi_14": round(float(featured_df["rsi_14"].iloc[-1]), 2),
                    "macd_histogram": round(
                        float(featured_df["macd_histogram"].iloc[-1]), 4
                    ),
                    "bb_position": round(float(featured_df["bb_position"].iloc[-1]), 4),
                    "atr_pct": round(float(featured_df["atr_pct"].iloc[-1]), 4),
                    "volume_ratio": round(
                        float(featured_df["volume_sma_ratio"].iloc[-1]), 2
                    ),
                    "volatility_20": round(
                        float(featured_df["volatility_20"].iloc[-1]), 4
                    ),
                },
            }

        except Exception as e:
            logger.error(f"ML signal generation failed: {e}")
            return {"direction": "hold", "confidence": 0, "reason": f"error: {str(e)}"}
