"""
Tests for ML Model Registry — version tracking, metadata, and lifecycle (D13).
"""

import pytest
from app.services.model_registry import ModelRegistry, ModelStatus, ModelVersion


@pytest.fixture()
def registry() -> ModelRegistry:
    """Fresh empty registry for each test."""
    return ModelRegistry()


class TestRegisterModel:
    def test_creates_model_with_correct_fields(self, registry: ModelRegistry):
        m = registry.register_model(
            name="test-model",
            version="1.0.0",
            framework="pytorch",
            created_by="tester",
            description="unit test model",
            input_schema={"x": "float"},
            output_schema={"y": "float"},
            parameters={"lr": 0.01},
            tags=["test"],
        )
        assert m.name == "test-model"
        assert m.version == "1.0.0"
        assert m.framework == "pytorch"
        assert m.created_by == "tester"
        assert m.description == "unit test model"
        assert m.input_schema == {"x": "float"}
        assert m.output_schema == {"y": "float"}
        assert m.parameters == {"lr": 0.01}
        assert m.tags == ["test"]
        assert m.status == ModelStatus.REGISTERED
        assert m.model_id  # non-empty UUID
        assert m.created_at  # non-empty ISO timestamp

    def test_creates_unique_ids(self, registry: ModelRegistry):
        m1 = registry.register_model(name="a", version="1", framework="onnx")
        m2 = registry.register_model(name="b", version="1", framework="onnx")
        assert m1.model_id != m2.model_id

    def test_defaults_for_optional_fields(self, registry: ModelRegistry):
        m = registry.register_model(name="x", version="0.1", framework="lightgbm")
        assert m.created_by == "system"
        assert m.input_schema == {}
        assert m.output_schema == {}
        assert m.parameters == {}
        assert m.tags == []
        assert m.description == ""
        assert m.artifact_path is None


class TestUpdateStatus:
    def test_changes_status(self, registry: ModelRegistry):
        m = registry.register_model(name="m", version="1", framework="xgboost")
        assert registry.update_status(m.model_id, ModelStatus.DEPLOYED) is True
        assert registry.get_model(m.model_id).status == ModelStatus.DEPLOYED

    def test_returns_false_for_missing_model(self, registry: ModelRegistry):
        assert registry.update_status("nonexistent-id", ModelStatus.FAILED) is False


class TestRecordMetrics:
    def test_adds_metrics(self, registry: ModelRegistry):
        m = registry.register_model(name="m", version="1", framework="lightgbm")
        result = registry.record_metrics(m.model_id, {"accuracy": 0.95, "f1": 0.90})
        assert result is True
        model = registry.get_model(m.model_id)
        assert model.metrics["accuracy"] == 0.95
        assert model.metrics["f1"] == 0.90

    def test_updates_existing_metrics(self, registry: ModelRegistry):
        m = registry.register_model(name="m", version="1", framework="lightgbm")
        registry.record_metrics(m.model_id, {"accuracy": 0.8})
        registry.record_metrics(m.model_id, {"accuracy": 0.95, "loss": 0.1})
        model = registry.get_model(m.model_id)
        assert model.metrics["accuracy"] == 0.95
        assert model.metrics["loss"] == 0.1

    def test_returns_false_for_missing_model(self, registry: ModelRegistry):
        assert registry.record_metrics("bad-id", {"x": 1.0}) is False


class TestGetLatestByName:
    def test_returns_newest_version(self, registry: ModelRegistry):
        m1 = registry.register_model(name="scorer", version="0.1", framework="lightgbm")
        # Ensure created_at is strictly later by overriding the timestamp
        m2 = registry.register_model(name="scorer", version="0.2", framework="lightgbm")
        m2.created_at = "2099-01-01T00:00:00+00:00"

        latest = registry.get_latest_by_name("scorer")
        assert latest.model_id == m2.model_id
        assert latest.version == "0.2"

    def test_returns_none_for_unknown_name(self, registry: ModelRegistry):
        assert registry.get_latest_by_name("does-not-exist") is None


class TestGetDeployedModels:
    def test_filters_correctly(self, registry: ModelRegistry):
        m1 = registry.register_model(name="a", version="1", framework="onnx")
        m2 = registry.register_model(name="b", version="1", framework="onnx")
        registry.register_model(name="c", version="1", framework="onnx")

        registry.update_status(m1.model_id, ModelStatus.DEPLOYED)
        registry.update_status(m2.model_id, ModelStatus.DEPLOYED)

        deployed = registry.get_deployed_models()
        assert len(deployed) == 2
        deployed_ids = {m.model_id for m in deployed}
        assert m1.model_id in deployed_ids
        assert m2.model_id in deployed_ids

    def test_empty_when_none_deployed(self, registry: ModelRegistry):
        registry.register_model(name="x", version="1", framework="onnx")
        assert registry.get_deployed_models() == []


class TestListModels:
    def test_filter_by_name(self, registry: ModelRegistry):
        registry.register_model(name="alpha", version="1", framework="pytorch")
        registry.register_model(name="beta", version="1", framework="pytorch")
        result = registry.list_models(name="alpha")
        assert len(result) == 1
        assert result[0].name == "alpha"

    def test_filter_by_status(self, registry: ModelRegistry):
        m = registry.register_model(name="m", version="1", framework="xgboost")
        registry.update_status(m.model_id, ModelStatus.TRAINING)
        result = registry.list_models(status=ModelStatus.TRAINING)
        assert len(result) == 1
        assert result[0].status == ModelStatus.TRAINING

    def test_filter_by_framework(self, registry: ModelRegistry):
        registry.register_model(name="a", version="1", framework="lightgbm")
        registry.register_model(name="b", version="1", framework="xgboost")
        result = registry.list_models(framework="xgboost")
        assert len(result) == 1
        assert result[0].framework == "xgboost"

    def test_combined_filters(self, registry: ModelRegistry):
        m1 = registry.register_model(name="scorer", version="1", framework="lightgbm")
        registry.register_model(name="scorer", version="2", framework="xgboost")
        registry.update_status(m1.model_id, ModelStatus.DEPLOYED)

        result = registry.list_models(
            name="scorer", status=ModelStatus.DEPLOYED, framework="lightgbm"
        )
        assert len(result) == 1
        assert result[0].model_id == m1.model_id

    def test_returns_sorted_by_created_at_descending(self, registry: ModelRegistry):
        m1 = registry.register_model(name="x", version="1", framework="onnx")
        m1.created_at = "2026-01-01T00:00:00+00:00"
        m2 = registry.register_model(name="x", version="2", framework="onnx")
        m2.created_at = "2026-06-01T00:00:00+00:00"
        result = registry.list_models(name="x")
        assert result[0].version == "2"
        assert result[1].version == "1"

    def test_returns_all_when_no_filters(self, registry: ModelRegistry):
        registry.register_model(name="a", version="1", framework="onnx")
        registry.register_model(name="b", version="1", framework="pytorch")
        result = registry.list_models()
        assert len(result) == 2


class TestExportCatalog:
    def test_returns_all_models_as_dicts(self, registry: ModelRegistry):
        registry.register_model(name="a", version="1", framework="onnx")
        registry.register_model(name="b", version="2", framework="pytorch")
        catalog = registry.export_catalog()
        assert len(catalog) == 2
        assert all(isinstance(c, dict) for c in catalog)
        names = {c["name"] for c in catalog}
        assert names == {"a", "b"}

    def test_empty_registry_returns_empty_list(self, registry: ModelRegistry):
        assert registry.export_catalog() == []


class TestRegisterDefaultModels:
    def test_creates_three_models(self, registry: ModelRegistry):
        registry.register_default_models()
        all_models = registry.list_models()
        assert len(all_models) == 3
        names = {m.name for m in all_models}
        assert names == {"signal-scorer-lgbm", "regime-detector", "risk-scorer-xgb"}

    def test_default_models_have_schemas(self, registry: ModelRegistry):
        registry.register_default_models()
        for m in registry.list_models():
            assert m.input_schema  # non-empty
            assert m.output_schema  # non-empty

    def test_default_models_have_tags(self, registry: ModelRegistry):
        registry.register_default_models()
        for m in registry.list_models():
            assert len(m.tags) >= 1


class TestSetArtifactPath:
    def test_sets_path(self, registry: ModelRegistry):
        m = registry.register_model(name="m", version="1", framework="onnx")
        assert m.artifact_path is None
        result = registry.set_artifact_path(m.model_id, "/models/m/v1.onnx")
        assert result is True
        assert registry.get_model(m.model_id).artifact_path == "/models/m/v1.onnx"

    def test_returns_false_for_missing_model(self, registry: ModelRegistry):
        assert registry.set_artifact_path("bad-id", "/path") is False
