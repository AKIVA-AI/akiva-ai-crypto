from app.api import system as system_api
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_client(user: dict | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(system_api.router, prefix="/api/v1")
    app.dependency_overrides[system_api.get_current_user] = lambda: (
        user
        or {
            "id": "admin-1",
            "is_admin": True,
        }
    )
    return TestClient(app)


def test_activate_kill_switch_succeeds(monkeypatch):
    client = _make_client()

    async def fake_activate(reason: str, user_id: str) -> bool:
        assert reason == "operator triggered"
        assert user_id == "admin-1"
        return True

    async def fake_status() -> dict:
        return {"active": True, "timestamp": "2026-03-14T00:00:00Z"}

    monkeypatch.setattr(system_api, "activate_kill_switch", fake_activate)
    monkeypatch.setattr(system_api, "get_kill_switch_status", fake_status)

    response = client.post(
        "/api/v1/system/kill-switch/activate",
        json={"reason": "operator triggered"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Kill switch activated: operator triggered",
        "status": {"active": True, "timestamp": "2026-03-14T00:00:00Z"},
    }


def test_activate_kill_switch_requires_admin():
    client = _make_client({"id": "trader-1", "is_admin": False})

    response = client.post(
        "/api/v1/system/kill-switch/activate",
        json={"reason": "operator triggered"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin privileges required"


def test_deactivate_kill_switch_succeeds(monkeypatch):
    client = _make_client()

    async def fake_deactivate(user_id: str) -> bool:
        assert user_id == "admin-1"
        return True

    async def fake_status() -> dict:
        return {"active": False, "timestamp": "2026-03-14T00:00:00Z"}

    monkeypatch.setattr(system_api, "deactivate_kill_switch", fake_deactivate)
    monkeypatch.setattr(system_api, "get_kill_switch_status", fake_status)

    response = client.post("/api/v1/system/kill-switch/deactivate")

    assert response.status_code == 200
    assert response.json()["status"]["active"] is False


def test_get_kill_switch_status_endpoint(monkeypatch):
    client = _make_client({"id": "viewer-1", "is_admin": False})

    async def fake_status() -> dict:
        return {"active": False, "timestamp": "2026-03-14T00:00:00Z"}

    monkeypatch.setattr(system_api, "get_kill_switch_status", fake_status)

    response = client.get("/api/v1/system/kill-switch/status")

    assert response.status_code == 200
    assert response.json()["system_status"] == "operational"


def test_create_system_alert_passes_user_metadata(monkeypatch):
    client = _make_client({"id": "trader-2", "is_admin": False})
    captured: dict = {}

    async def fake_create_alert(**kwargs) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(system_api, "create_alert", fake_create_alert)

    response = client.post(
        "/api/v1/system/alert",
        params={"title": "Latency", "message": "High latency", "severity": "warning"},
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Alert created successfully"}
    assert captured["source"] == "api"
    assert captured["metadata"] == {"user_id": "trader-2"}


def test_system_health_halts_execution_when_kill_switch_active(monkeypatch):
    client = _make_client()

    async def fake_status() -> dict:
        return {"active": True, "timestamp": "2026-03-14T00:00:00Z"}

    monkeypatch.setattr(system_api, "get_kill_switch_status", fake_status)

    response = client.get("/api/v1/system/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["services"]["execution"] == "halted"


def test_system_health_reports_unhealthy_on_status_failure(monkeypatch):
    client = _make_client()

    async def fake_status() -> dict:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(system_api, "get_kill_switch_status", fake_status)

    response = client.get("/api/v1/system/health")

    assert response.status_code == 200
    assert response.json()["status"] == "unhealthy"
    assert "db unavailable" in response.json()["error"]
