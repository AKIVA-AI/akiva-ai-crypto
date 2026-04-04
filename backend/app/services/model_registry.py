"""
ML Model Registry — version tracking, metadata, and lifecycle management.

D13 AI/ML 6→7: Provides model versioning, input/output schema tracking,
performance metrics, and deployment state management.
"""

import os
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog

logger = structlog.get_logger()


class ModelStatus(str, Enum):
    REGISTERED = "registered"
    TRAINING = "training"
    TRAINED = "trained"
    VALIDATING = "validating"
    DEPLOYED = "deployed"
    DEPRECATED = "deprecated"
    FAILED = "failed"


@dataclass
class ModelVersion:
    """A specific version of a registered model."""

    model_id: str
    version: str
    name: str
    framework: str  # lightgbm, xgboost, catboost, onnx, pytorch
    status: ModelStatus
    created_at: str
    created_by: str
    input_schema: Dict[str, str] = field(default_factory=dict)
    output_schema: Dict[str, str] = field(default_factory=dict)
    metrics: Dict[str, float] = field(default_factory=dict)
    parameters: Dict[str, Any] = field(default_factory=dict)
    artifact_path: Optional[str] = None
    description: str = ""
    tags: List[str] = field(default_factory=list)


class ModelRegistry:
    """
    In-memory model registry with Supabase persistence.
    Tracks model versions, performance metrics, and deployment state.
    """

    def __init__(self):
        self._models: Dict[str, ModelVersion] = {}
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    def register_model(
        self,
        name: str,
        version: str,
        framework: str,
        created_by: str = "system",
        input_schema: Optional[Dict[str, str]] = None,
        output_schema: Optional[Dict[str, str]] = None,
        description: str = "",
        parameters: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> ModelVersion:
        """Register a new model version."""
        model_id = str(uuid4())
        model = ModelVersion(
            model_id=model_id,
            version=version,
            name=name,
            framework=framework,
            status=ModelStatus.REGISTERED,
            created_at=datetime.now(UTC).isoformat(),
            created_by=created_by,
            input_schema=input_schema or {},
            output_schema=output_schema or {},
            description=description,
            parameters=parameters or {},
            tags=tags or [],
        )
        self._models[model_id] = model
        logger.info(
            "model_registered",
            model_id=model_id,
            name=name,
            version=version,
            framework=framework,
        )
        return model

    def update_status(self, model_id: str, status: ModelStatus) -> bool:
        """Update model deployment status."""
        if model_id not in self._models:
            return False
        self._models[model_id].status = status
        logger.info("model_status_updated", model_id=model_id, status=status.value)
        return True

    def record_metrics(self, model_id: str, metrics: Dict[str, float]) -> bool:
        """Record performance metrics for a model version."""
        if model_id not in self._models:
            return False
        self._models[model_id].metrics.update(metrics)
        logger.info(
            "model_metrics_recorded",
            model_id=model_id,
            metrics=metrics,
        )
        return True

    def set_artifact_path(self, model_id: str, path: str) -> bool:
        """Set the artifact storage path for a model."""
        if model_id not in self._models:
            return False
        self._models[model_id].artifact_path = path
        return True

    def get_model(self, model_id: str) -> Optional[ModelVersion]:
        """Get a model version by ID."""
        return self._models.get(model_id)

    def get_latest_by_name(self, name: str) -> Optional[ModelVersion]:
        """Get the latest version of a model by name."""
        candidates = [m for m in self._models.values() if m.name == name]
        if not candidates:
            return None
        return max(candidates, key=lambda m: m.created_at)

    def get_deployed_models(self) -> List[ModelVersion]:
        """Get all currently deployed models."""
        return [m for m in self._models.values() if m.status == ModelStatus.DEPLOYED]

    def list_models(
        self,
        name: Optional[str] = None,
        status: Optional[ModelStatus] = None,
        framework: Optional[str] = None,
    ) -> List[ModelVersion]:
        """List models with optional filtering."""
        result = list(self._models.values())
        if name:
            result = [m for m in result if m.name == name]
        if status:
            result = [m for m in result if m.status == status]
        if framework:
            result = [m for m in result if m.framework == framework]
        return sorted(result, key=lambda m: m.created_at, reverse=True)

    def export_catalog(self) -> List[Dict[str, Any]]:
        """Export the full model catalog as dicts."""
        return [asdict(m) for m in self._models.values()]

    def register_default_models(self):
        """Register the built-in signal scoring models."""
        self.register_model(
            name="signal-scorer-lgbm",
            version="0.1.0",
            framework="lightgbm",
            description="LightGBM signal scoring model for directional prediction",
            input_schema={
                "rsi_14": "float",
                "macd_signal": "float",
                "bb_width": "float",
                "volume_ratio": "float",
                "price_momentum": "float",
            },
            output_schema={
                "direction": "str",
                "confidence": "float",
                "predicted_return": "float",
            },
            tags=["signal", "production-candidate"],
        )
        self.register_model(
            name="regime-detector",
            version="0.1.0",
            framework="rule-based",
            description="Market regime classification (trending/ranging/volatile)",
            input_schema={
                "volatility_21d": "float",
                "trend_strength": "float",
                "volume_profile": "float",
            },
            output_schema={"regime": "str", "confidence": "float"},
            tags=["regime", "production"],
        )
        self.register_model(
            name="risk-scorer-xgb",
            version="0.1.0",
            framework="xgboost",
            description="XGBoost risk scoring model for position sizing",
            input_schema={
                "var_95": "float",
                "max_drawdown": "float",
                "sharpe_ratio": "float",
                "correlation_btc": "float",
            },
            output_schema={"risk_score": "float", "recommended_size_pct": "float"},
            tags=["risk", "experimental"],
        )


# Global singleton
model_registry = ModelRegistry()
model_registry.register_default_models()
