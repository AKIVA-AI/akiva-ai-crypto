import pytest
from app.api import execution as execution_api
from app.services.strategy_registry import strategy_registry
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    app = FastAPI()

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/v1"):
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return JSONResponse(
                    status_code=401, content={"detail": "Missing or invalid token"}
                )
        return await call_next(request)

    app.include_router(execution_api.router, prefix="/api/v1")
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_registry():
    strategy_registry.clear()
    yield
    strategy_registry.clear()


def _auth_headers():
    return {"Authorization": "Bearer test-token"}


def test_register_and_list_strategies(client):
    response = client.post(
        "/api/v1/execution/strategies",
        headers=_auth_headers(),
        json={
            "name": "TestStrategy",
            "description": "Example",
            "parameters": {"window": 20},
        },
    )
    assert response.status_code == 200

    list_response = client.get(
        "/api/v1/execution/strategies",
        headers=_auth_headers(),
    )
    assert list_response.status_code == 200
    data = list_response.json()
    assert len(data) == 1
    assert data[0]["name"] == "TestStrategy"


def test_walk_forward_requires_strategy(client):
    response = client.post(
        "/api/v1/execution/walk-forward",
        headers=_auth_headers(),
        json={
            "strategy_name": "MissingStrategy",
            "instruments": ["BTC-USD"],
            "start_date": "2023-01-01T00:00:00Z",
            "end_date": "2023-02-01T00:00:00Z",
            "train_window": 100,
            "test_window": 50,
            "step_size": 50,
        },
    )
    assert response.status_code == 404


def test_walk_forward_success(client):
    client.post(
        "/api/v1/execution/strategies",
        headers=_auth_headers(),
        json={
            "name": "WalkStrategy",
            "description": "Walk forward strategy",
            "parameters": {},
        },
    )

    response = client.post(
        "/api/v1/execution/walk-forward",
        headers=_auth_headers(),
        json={
            "strategy_name": "WalkStrategy",
            "instruments": ["BTC-USD"],
            "start_date": "2023-01-01T00:00:00Z",
            "end_date": "2023-02-01T00:00:00Z",
            "train_window": 100,
            "test_window": 50,
            "step_size": 50,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["strategy_name"] == "WalkStrategy"
    assert data["total_windows"] > 0


def test_requires_auth(client):
    response = client.get("/api/v1/execution/strategies")
    assert response.status_code == 401
