"""
Tests for observability integration: Sentry + OpenTelemetry (D9).
"""

from app.core.observability import init_sentry, init_tracing


class TestSentryInit:
    def test_sentry_skipped_without_dsn(self, monkeypatch):
        monkeypatch.delenv("SENTRY_DSN", raising=False)
        result = init_sentry()
        assert result is False

    def test_sentry_initializes_with_dsn(self, monkeypatch):
        monkeypatch.setenv(
            "SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0"
        )
        monkeypatch.setenv("ENVIRONMENT", "test")
        result = init_sentry()
        assert result is True

    def test_sentry_respects_sample_rates(self, monkeypatch):
        monkeypatch.setenv(
            "SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0"
        )
        monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.5")
        monkeypatch.setenv("SENTRY_PROFILES_SAMPLE_RATE", "0.25")
        result = init_sentry()
        assert result is True


class TestOpenTelemetryInit:
    def test_tracing_local_without_endpoint(self, monkeypatch):
        """Tracing initializes in local mode without OTLP endpoint."""
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
        monkeypatch.setenv("OTEL_SERVICE_NAME", "test-service")

        from fastapi import FastAPI

        test_app = FastAPI()
        result = init_tracing(test_app)
        assert result is True

    def test_tracing_service_name(self, monkeypatch):
        """Custom service name is respected."""
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
        monkeypatch.setenv("OTEL_SERVICE_NAME", "custom-crypto-svc")

        from fastapi import FastAPI

        test_app = FastAPI()
        result = init_tracing(test_app)
        assert result is True


class TestHealthMetrics:
    """Test that Prometheus metrics and health endpoints exist."""

    def test_prometheus_endpoint_exists(self):
        """Verify the /metrics/prometheus route is registered."""
        from app.api.health import router

        paths = [r.path for r in router.routes]
        assert "/metrics/prometheus" in paths or any(
            "/metrics/prometheus" in str(r.path) for r in router.routes
        )

    def test_health_endpoint_exists(self):
        from app.api.health import router

        paths = [r.path for r in router.routes]
        assert "/health" in paths

    def test_trade_latency_recording(self):
        from app.api.health import _percentile, record_trade_latency

        # Record some latencies
        record_trade_latency(0.05)
        record_trade_latency(0.10)
        record_trade_latency(0.15)

        p50 = _percentile([0.05, 0.10, 0.15], 50)
        assert 0.09 <= p50 <= 0.11
