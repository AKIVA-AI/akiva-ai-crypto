"""
Tests for health check and metrics endpoints.
"""

from unittest.mock import MagicMock, patch

import app.api.health as health_mod
import pytest
from app.api.health import get_uptime_seconds, increment_request_count, router
from fastapi.testclient import TestClient


class TestHealthEndpoints:
    """Test health check endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client for health router."""
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_health_endpoint_returns_200(self, client):
        """Test /health returns 200 and correct structure."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert "version" in data
        assert "environment" in data

    def test_ready_endpoint_returns_structure(self, client):
        """Test /ready returns correct structure."""
        # Mock database call to avoid actual DB connection
        with patch("app.api.health.get_supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_table.select.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[{"id": 1}])
            )
            mock_supabase.return_value.table.return_value = mock_table

            response = client.get("/ready")

            assert response.status_code in [200, 503]
            data = response.json()

            assert "status" in data
            assert "timestamp" in data
            assert "checks" in data
            assert isinstance(data["checks"], dict)

    def test_ready_endpoint_reports_db_connected(self, client):
        """Test /ready reports database connected when DB is available."""
        with patch("app.api.health.get_supabase") as mock_supabase:
            mock_table = MagicMock()
            mock_table.select.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[{"id": 1}])
            )
            mock_supabase.return_value.table.return_value = mock_table

            response = client.get("/ready")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ready"
            assert data["checks"]["database"] == "connected"

    def test_ready_endpoint_reports_db_error(self, client):
        """Test /ready reports not_ready when DB fails."""
        with patch("app.api.health.get_supabase") as mock_supabase:
            mock_supabase.side_effect = Exception("Connection failed")

            response = client.get("/ready")

            assert response.status_code == 503
            data = response.json()
            assert data["status"] == "not_ready"
            assert "error" in data["checks"]["database"]

    def test_metrics_endpoint_returns_structure(self, client):
        """Test /metrics returns correct structure."""
        response = client.get("/metrics")

        assert response.status_code == 200
        data = response.json()

        assert "request_count" in data
        assert "uptime_seconds" in data
        assert "memory_mb" in data
        assert "cpu_percent" in data
        assert "environment" in data
        assert "timestamp" in data

        # Validate types
        assert isinstance(data["request_count"], int)
        assert isinstance(data["uptime_seconds"], (int, float))
        assert isinstance(data["memory_mb"], (int, float))

    def test_metrics_prometheus_endpoint_returns_expected_series(self, client):
        """Test /metrics/prometheus exposes the expected metric names."""
        health_mod.record_trade_latency(42.5)
        health_mod.record_trade_error()
        health_mod.record_order("buy")
        health_mod.record_pnl(100.0)
        health_mod.update_agent_heartbeat("agent-prometheus")

        response = client.get("/metrics/prometheus")

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]
        assert "ec_requests_total" in response.text
        assert 'ec_orders_total{side="buy"}' in response.text
        assert "ec_trade_latency_p95_ms" in response.text
        assert "ec_agents_tracked" in response.text

    def test_health_endpoint_reports_stale_agents(self, client):
        """Test /health includes stale agents when heartbeats expire."""
        health_mod._agent_heartbeats["agent-stale"] = (
            health_mod.time.time() - health_mod.HEARTBEAT_STALE_SECONDS - 5
        )

        with (
            patch("app.api.health.get_supabase") as mock_supabase,
            patch("redis.from_url") as mock_redis,
        ):
            mock_table = MagicMock()
            mock_table.select.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[{"id": 1}])
            )
            mock_supabase.return_value.table.return_value = mock_table
            mock_redis.return_value.ping.return_value = True

            response = client.get("/health")

        assert response.status_code == 200
        assert "agent-stale" in response.json()["stale_agents"]

    def test_increment_request_count(self):
        """Test request counter increments."""
        from app.api.health import _request_count

        initial_count = _request_count

        increment_request_count()
        increment_request_count()

        from app.api.health import _request_count as new_count

        assert new_count == initial_count + 2

    def test_get_uptime_seconds(self):
        """Test uptime calculation returns positive value."""
        uptime = get_uptime_seconds()
        assert uptime >= 0
        assert isinstance(uptime, float)

    def test_ready_endpoint_reports_redis_degraded_but_non_blocking(self, client):
        """Test /ready stays ready when Redis is degraded but DB is healthy."""
        with (
            patch("app.api.health.get_supabase") as mock_supabase,
            patch("redis.from_url") as mock_redis,
        ):
            mock_table = MagicMock()
            mock_table.select.return_value.limit.return_value.execute.return_value = (
                MagicMock(data=[{"id": 1}])
            )
            mock_supabase.return_value.table.return_value = mock_table
            mock_redis.side_effect = Exception("Redis unavailable")

            response = client.get("/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["checks"]["redis_note"] == "degraded but non-blocking"


class TestHealthIntegration:
    """Integration tests for health endpoints with main app."""

    @pytest.fixture
    def app_client(self):
        """Create test client for main app."""
        # Import here to avoid circular imports
        from app.main import app

        return TestClient(app, raise_server_exceptions=False)

    @pytest.mark.skip(reason="Requires full app context - run manually or in CI")
    def test_health_endpoint_on_main_app(self, app_client):
        """Test /health works on main application."""
        response = app_client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    @pytest.mark.skip(reason="Requires full app context - run manually or in CI")
    def test_health_endpoints_bypass_auth(self, app_client):
        """Test health endpoints don't require authentication."""
        # These should return 200, not 401
        health_response = app_client.get("/health")
        assert health_response.status_code == 200

        metrics_response = app_client.get("/metrics")
        assert metrics_response.status_code == 200
