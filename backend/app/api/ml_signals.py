"""
ML Signal Generation API

Provides endpoints for AI-powered trading signal generation,
allowing the UI to display ML predictions for user-executed trades.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML Signals"])


class MLSignalRequest(BaseModel):
    """Request for ML signal generation."""

    pair: str = Field(..., description="Trading pair (e.g., BTC-USD)")
    timeframe: str = Field(default="5m", description="Candle timeframe")
    model: str = Field(default="LightGBMRegressor", description="ML model to use")
    lookback_candles: int = Field(
        default=200, description="Number of historical candles"
    )


class MLSignalResponse(BaseModel):
    """ML signal response."""

    pair: str
    direction: str  # buy, sell, hold
    confidence: float
    predicted_return: float
    model: str
    features_snapshot: Dict[str, float]
    generated_at: str
    timeframe: str


class MLModelStatus(BaseModel):
    """ML model status."""

    name: str
    trained: bool
    last_trained: Optional[str] = None
    accuracy: Optional[float] = None
    gpu_available: bool


@router.post("/signal", response_model=MLSignalResponse)
async def generate_ml_signal(request: MLSignalRequest):
    """
    Generate an ML-powered trading signal for a given pair.

    The AI analyzes technical indicators and patterns to provide
    a directional signal with confidence score. Users can then
    decide whether to execute the trade from the UI.
    """
    try:
        from app.freqtrade.data_provider import FreqTradeDataProvider
        from app.freqtrade.freqai_manager import FreqAIManager

        # Get market data
        data_provider = FreqTradeDataProvider()
        df = data_provider.get_ohlcv(
            pair=request.pair,
            timeframe=request.timeframe,
            limit=request.lookback_candles,
        )

        if df is None or len(df) < 50:
            raise HTTPException(
                status_code=400, detail=f"Insufficient market data for {request.pair}"
            )

        # Generate ML signal
        manager = FreqAIManager()
        signal = await manager.generate_ml_signals(
            pair=request.pair, df=df, model_name=request.model
        )

        return MLSignalResponse(
            pair=request.pair,
            direction=signal["direction"],
            confidence=signal.get("confidence", 0),
            predicted_return=signal.get("predicted_return", 0),
            model=signal.get("model", request.model),
            features_snapshot=signal.get("features_snapshot", {}),
            generated_at=datetime.utcnow().isoformat(),
            timeframe=request.timeframe,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ML signal generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models", response_model=List[MLModelStatus])
async def list_ml_models():
    """List available ML models and their status."""
    try:
        from app.freqtrade.freqai_manager import FreqAIManager

        manager = FreqAIManager()
        models = manager.list_models()

        return [
            MLModelStatus(
                name=m.get("name", "unknown"),
                trained=m.get("trained", False),
                last_trained=m.get("last_trained"),
                accuracy=m.get("accuracy"),
                gpu_available=manager.gpu_available,
            )
            for m in models
        ]
    except Exception as e:
        logger.error(f"Failed to list ML models: {e}")
        return []


@router.post("/train/{model_name}")
async def train_model(model_name: str, pair: str = "BTC-USD", timeframe: str = "5m"):
    """Trigger ML model training on historical data."""
    try:
        from app.freqtrade.freqai_manager import FreqAIManager

        manager = FreqAIManager()
        result = await manager.train(model_name, pair)

        return {
            "status": "training_started" if result else "training_failed",
            "model": model_name,
            "pair": pair,
            "timeframe": timeframe,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Model Registry endpoints (D13 AI/ML) ──


@router.get("/registry")
async def list_registry_models(
    name: Optional[str] = None,
    framework: Optional[str] = None,
):
    """List all registered model versions with metadata and metrics."""
    from app.services.model_registry import model_registry

    models = model_registry.list_models(name=name, framework=framework)
    return [
        {
            "model_id": m.model_id,
            "name": m.name,
            "version": m.version,
            "framework": m.framework,
            "status": m.status.value,
            "created_at": m.created_at,
            "metrics": m.metrics,
            "input_schema": m.input_schema,
            "output_schema": m.output_schema,
            "tags": m.tags,
            "description": m.description,
        }
        for m in models
    ]


@router.get("/registry/{model_id}")
async def get_registry_model(model_id: str):
    """Get details for a specific registered model version."""
    from app.services.model_registry import model_registry

    model = model_registry.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    from dataclasses import asdict

    return asdict(model)


@router.post("/registry/{model_id}/metrics")
async def record_model_metrics(model_id: str, metrics: Dict[str, float]):
    """Record performance metrics for a model version."""
    from app.services.model_registry import model_registry

    if not model_registry.record_metrics(model_id, metrics):
        raise HTTPException(status_code=404, detail="Model not found")
    return {"status": "recorded", "model_id": model_id, "metrics": metrics}
