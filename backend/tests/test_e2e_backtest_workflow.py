"""
End-to-End Test Suite for Backtest Workflow

Sprint 6, Task 6.1: Comprehensive E2E tests covering the complete
backtest workflow from strategy configuration to results analysis.
"""

from datetime import datetime, timedelta

import pytest
from app.api import backtest as backtest_api
from app.api.backtest import _backtest_results
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


# Test fixtures
@pytest.fixture
def client():
    """Create test client with backtest router."""
    app = FastAPI()

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/v1"):
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Missing or invalid token"},
                )
        return await call_next(request)

    app.include_router(backtest_api.router, prefix="/api/v1")
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_results():
    """Clear results between tests."""
    _backtest_results.clear()
    yield
    _backtest_results.clear()


def _auth_headers():
    """Get authentication headers for tests."""
    return {"Authorization": "Bearer test-token"}


class TestE2EBacktestWorkflow:
    """
    End-to-end tests for the complete backtest workflow.

    Tests cover:
    1. Strategy configuration → Backtest execution → Results retrieval
    2. Multi-instrument backtests
    3. Different timeframes
    4. Error handling and edge cases
    5. Performance metrics validation
    """

    def test_full_backtest_workflow(self, client):
        """
        E2E Test: Complete workflow from config to analysis.

        1. Run backtest with valid config
        2. Retrieve full results
        3. Get equity curve
        4. Get trade list
        5. Validate all metrics present
        """
        # Step 1: Run backtest
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
                "initial_capital": 100000.0,
                "timeframe": "1h",
                "slippage_bps": 5.0,
                "commission_bps": 10.0,
            },
        )

        assert run_response.status_code == 200
        run_data = run_response.json()
        backtest_id = run_data["id"]

        assert run_data["status"] == "completed"
        assert run_data["strategy_name"] == "RSIMomentumStrategy"

        # Step 2: Get full results
        detail_response = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )

        assert detail_response.status_code == 200
        detail = detail_response.json()

        # Validate required fields
        assert "metrics" in detail
        assert "final_equity" in detail
        assert detail["initial_capital"] == 100000.0

        # Step 3: Get equity curve
        equity_response = client.get(
            f"/api/v1/backtest/{backtest_id}/equity-curve",
            headers=_auth_headers(),
        )

        assert equity_response.status_code == 200
        equity_data = equity_response.json()
        assert len(equity_data["data"]) > 0

        # Validate equity point structure
        first_point = equity_data["data"][0]
        assert "timestamp" in first_point
        assert "equity" in first_point
        assert "drawdown" in first_point

        # Step 4: Get trades
        trades_response = client.get(
            f"/api/v1/backtest/{backtest_id}/trades",
            headers=_auth_headers(),
        )

        assert trades_response.status_code == 200
        trades_data = trades_response.json()
        assert "trades" in trades_data
        assert "total_trades" in trades_data

    def test_backtest_with_different_timeframes(self, client):
        """E2E Test: Verify backtests work across different timeframes."""
        timeframes = ["1h", "4h", "1d"]

        for tf in timeframes:
            response = client.post(
                "/api/v1/backtest/run",
                headers=_auth_headers(),
                json={
                    "strategy_name": "RSIMomentumStrategy",
                    "instruments": ["ETH-USD"],
                    "start_date": "2023-01-01T00:00:00Z",
                    "end_date": "2023-03-01T00:00:00Z",
                    "timeframe": tf,
                },
            )

            assert response.status_code == 200, f"Failed for timeframe {tf}"
            data = response.json()
            # Verify backtest completed successfully
            assert data["status"] == "completed"
            assert "id" in data

    def test_backtest_metrics_validation(self, client):
        """E2E Test: Validate all performance metrics are calculated."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
            },
        )

        backtest_id = response.json()["id"]
        detail = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        ).json()

        metrics = detail["metrics"]

        # Validate core metrics exist
        required_metrics = [
            "total_return",
            "sharpe_ratio",
            "max_drawdown",
            "win_rate",
            "total_trades",
        ]

        for metric in required_metrics:
            assert metric in metrics, f"Missing metric: {metric}"

    def test_backtest_list_and_filter(self, client):
        """E2E Test: List backtests and filter by strategy."""
        # Run two different strategies
        strategies = ["RSIMomentumStrategy", "MACDStrategy"]

        for strategy in strategies:
            client.post(
                "/api/v1/backtest/run",
                headers=_auth_headers(),
                json={
                    "strategy_name": strategy,
                    "instruments": ["BTC-USD"],
                    "start_date": "2023-01-01T00:00:00Z",
                    "end_date": "2023-02-01T00:00:00Z",
                },
            )

        # List all backtests
        list_response = client.get(
            "/api/v1/backtest/list",
            headers=_auth_headers(),
        )

        assert list_response.status_code == 200
        all_backtests = list_response.json()
        assert len(all_backtests) >= 2

        # Filter by strategy
        filter_response = client.get(
            "/api/v1/backtest/list?strategy=RSIMomentumStrategy",
            headers=_auth_headers(),
        )

        assert filter_response.status_code == 200
        filtered = filter_response.json()
        # At least one result should match the filter
        rsi_results = [
            bt for bt in filtered if bt["strategy_name"] == "RSIMomentumStrategy"
        ]
        assert len(rsi_results) >= 1

    def test_backtest_delete_workflow(self, client):
        """E2E Test: Create and delete a backtest."""
        # Create
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "TestDeleteStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-02-01T00:00:00Z",
            },
        )

        backtest_id = run_response.json()["id"]

        # Verify exists
        get_response = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )
        assert get_response.status_code == 200

        # Delete
        delete_response = client.delete(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )
        assert delete_response.status_code in [
            200,
            204,
        ]  # Accept both OK and No Content

        # Verify deleted
        verify_response = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )
        assert verify_response.status_code == 404


class TestE2EErrorHandling:
    """E2E tests for error handling and edge cases."""

    def test_invalid_date_range(self, client):
        """E2E Test: Invalid date range returns proper error."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-06-01T00:00:00Z",
                "end_date": "2023-01-01T00:00:00Z",  # End before start
            },
        )

        # API returns 400 or 422 for validation errors
        assert response.status_code in [400, 422]

    def test_empty_instruments(self, client):
        """E2E Test: Empty instruments list returns error."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": [],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
            },
        )

        assert response.status_code == 422  # Validation error

    def test_nonexistent_backtest(self, client):
        """E2E Test: Requesting nonexistent backtest returns 404."""
        response = client.get(
            "/api/v1/backtest/nonexistent-id-12345",
            headers=_auth_headers(),
        )

        assert response.status_code == 404

    def test_unauthorized_access(self, client):
        """E2E Test: Missing auth token returns 401."""
        response = client.post(
            "/api/v1/backtest/run",
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
            },
        )

        assert response.status_code == 401


class TestE2EPerformanceConsistency:
    """E2E tests for performance calculation consistency."""

    def test_metrics_consistency(self, client):
        """E2E Test: Run same backtest twice, verify consistent results."""
        config = {
            "strategy_name": "RSIMomentumStrategy",
            "instruments": ["BTC-USD"],
            "start_date": "2023-01-01T00:00:00Z",
            "end_date": "2023-03-01T00:00:00Z",
            "initial_capital": 100000.0,
        }

        # Run twice
        result1 = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json=config,
        ).json()

        result2 = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json=config,
        ).json()

        # Should have same final equity (deterministic)
        assert result1["final_equity"] == result2["final_equity"]

    def test_equity_curve_bounds(self, client):
        """E2E Test: Equity curve should start at initial capital."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-03-01T00:00:00Z",
                "initial_capital": 50000.0,
            },
        )

        backtest_id = response.json()["id"]

        equity_response = client.get(
            f"/api/v1/backtest/{backtest_id}/equity-curve",
            headers=_auth_headers(),
        )

        equity_data = equity_response.json()["data"]

        # First equity point should be near initial capital
        first_equity = equity_data[0]["equity"]
        assert abs(first_equity - 50000.0) < 1000  # Allow some variance
