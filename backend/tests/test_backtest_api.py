import pytest
from app.api import backtest as backtest_api
from app.api.backtest import _backtest_results
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client with backtest router only."""
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


class TestBacktestAPI:
    """Tests for backtest API endpoints."""

    def test_run_backtest_success(self, client):
        """Successfully run a backtest."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
                "initial_capital": 100000.0,
                "timeframe": "1h",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["strategy_name"] == "RSIMomentumStrategy"
        assert data["status"] == "completed"
        assert "id" in data
        assert data["initial_capital"] == 100000.0

    def test_run_backtest_invalid_dates(self, client):
        """End date before start date should fail."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-06-01T00:00:00Z",
                "end_date": "2023-01-01T00:00:00Z",
            },
        )

        assert response.status_code == 422

    def test_run_backtest_invalid_instrument(self, client):
        """Invalid instrument should fail."""
        response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["INVALID-PAIR"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
            },
        )

        assert response.status_code == 422

    def test_run_backtest_empty_instruments(self, client):
        """Empty instruments list should fail."""
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

        assert response.status_code == 422

    def test_get_backtest_result_found(self, client):
        """Get existing backtest result."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-03-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        response = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == backtest_id
        assert "metrics" in data

    def test_get_backtest_result_not_found(self, client):
        """Non-existent backtest should return 404."""
        response = client.get(
            "/api/v1/backtest/non-existent-id",
            headers=_auth_headers(),
        )

        assert response.status_code == 404

    def test_get_equity_curve(self, client):
        """Get equity curve data."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-03-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        response = client.get(
            f"/api/v1/backtest/{backtest_id}/equity-curve",
            headers=_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["backtest_id"] == backtest_id
        assert "data" in data
        assert len(data["data"]) > 0

    def test_get_equity_curve_sampled(self, client):
        """Equity curve with sampling."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-03-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        full_response = client.get(
            f"/api/v1/backtest/{backtest_id}/equity-curve?sample_rate=1",
            headers=_auth_headers(),
        )
        full_data = full_response.json()

        sampled_response = client.get(
            f"/api/v1/backtest/{backtest_id}/equity-curve?sample_rate=10",
            headers=_auth_headers(),
        )
        sampled_data = sampled_response.json()

        assert len(sampled_data["data"]) <= len(full_data["data"])

    def test_get_trades(self, client):
        """Get trades from backtest."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-03-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        response = client.get(
            f"/api/v1/backtest/{backtest_id}/trades",
            headers=_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["backtest_id"] == backtest_id
        assert "trades" in data
        assert "total_trades" in data

    def test_get_trades_pagination(self, client):
        """Trades endpoint should support pagination."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "RSIMomentumStrategy",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-06-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        page1 = client.get(
            f"/api/v1/backtest/{backtest_id}/trades?limit=5&offset=0",
            headers=_auth_headers(),
        )
        page2 = client.get(
            f"/api/v1/backtest/{backtest_id}/trades?limit=5&offset=5",
            headers=_auth_headers(),
        )

        assert page1.status_code == 200
        assert page2.status_code == 200

        if len(page1.json()["trades"]) == 5 and len(page2.json()["trades"]) > 0:
            assert page1.json()["trades"][0]["id"] != page2.json()["trades"][0]["id"]

    def test_list_backtests(self, client):
        """List all backtests."""
        for i in range(3):
            client.post(
                "/api/v1/backtest/run",
                headers=_auth_headers(),
                json={
                    "strategy_name": f"Strategy{i}",
                    "instruments": ["BTC-USD"],
                    "start_date": "2023-01-01T00:00:00Z",
                    "end_date": "2023-02-01T00:00:00Z",
                },
            )

        response = client.get(
            "/api/v1/backtest/list",
            headers=_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_list_backtests_filter_by_strategy(self, client):
        """Filter backtests by strategy name."""
        client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "StrategyA",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-02-01T00:00:00Z",
            },
        )
        client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "StrategyB",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-02-01T00:00:00Z",
            },
        )

        response = client.get(
            "/api/v1/backtest/list?strategy_name=StrategyA",
            headers=_auth_headers(),
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["strategy_name"] == "StrategyA"

    def test_delete_backtest(self, client):
        """Delete a backtest."""
        run_response = client.post(
            "/api/v1/backtest/run",
            headers=_auth_headers(),
            json={
                "strategy_name": "ToDelete",
                "instruments": ["BTC-USD"],
                "start_date": "2023-01-01T00:00:00Z",
                "end_date": "2023-02-01T00:00:00Z",
            },
        )
        backtest_id = run_response.json()["id"]

        delete_response = client.delete(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )
        assert delete_response.status_code == 204

        get_response = client.get(
            f"/api/v1/backtest/{backtest_id}",
            headers=_auth_headers(),
        )
        assert get_response.status_code == 404

    def test_requires_auth(self, client):
        """Requests without auth should be rejected."""
        response = client.get("/api/v1/backtest/list")
        assert response.status_code == 401


def _auth_headers():
    return {"Authorization": "Bearer test-token"}
