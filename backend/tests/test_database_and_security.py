from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app import database
from app.core import security
from fastapi import HTTPException


class QueryStub:
    def __init__(self, data=None):
        self.data = data if data is not None else []
        self.insert_payload = None
        self.update_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.insert_payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class SupabaseStub:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return self.tables[name]


@pytest.fixture(autouse=True)
def reset_globals():
    database._supabase_client = None
    database._db_initialized = False
    security._supabase_client = None
    yield
    database._supabase_client = None
    database._db_initialized = False
    security._supabase_client = None


def test_get_supabase_creates_and_caches_client(monkeypatch):
    created = object()
    monkeypatch.setattr(
        database.settings, "supabase_url", "https://example.supabase.co"
    )
    monkeypatch.setattr(database.settings, "supabase_service_role_key", "service-key")
    monkeypatch.setattr(database, "create_client", lambda url, key: (url, key, created))

    client = database.get_supabase()
    assert client[0] == "https://example.supabase.co"
    assert database.get_supabase() is client


@pytest.mark.asyncio
async def test_init_db_and_close_db(monkeypatch):
    stub = SupabaseStub({"global_settings": QueryStub([{"id": "gs-1"}])})
    monkeypatch.setattr(database, "get_supabase", lambda: stub)

    await database.init_db()
    assert database._db_initialized is True

    await database.close_db()
    assert database._db_initialized is False
    assert database._supabase_client is None


@pytest.mark.asyncio
async def test_activate_and_deactivate_kill_switch(monkeypatch):
    global_settings = QueryStub([{"id": "gs-1", "global_kill_switch": False}])
    stub = SupabaseStub({"global_settings": global_settings, "alerts": QueryStub([])})
    monkeypatch.setattr(database, "get_supabase", lambda: stub)
    monkeypatch.setattr(database, "_get_global_settings_id", lambda: "gs-1")
    monkeypatch.setattr(database, "audit_log", AsyncMock())
    monkeypatch.setattr(database, "create_alert", AsyncMock())

    assert await database.activate_kill_switch("breach", user_id="u1") is True
    assert global_settings.update_payload["global_kill_switch"] is True

    assert await database.deactivate_kill_switch(user_id="u1") is True
    assert global_settings.update_payload["global_kill_switch"] is False


@pytest.mark.asyncio
async def test_activate_kill_switch_returns_false_without_settings(monkeypatch):
    monkeypatch.setattr(
        database,
        "get_supabase",
        lambda: SupabaseStub(
            {"global_settings": QueryStub([]), "alerts": QueryStub([])}
        ),
    )
    monkeypatch.setattr(database, "_get_global_settings_id", lambda: None)

    assert await database.activate_kill_switch("missing") is False
    assert await database.deactivate_kill_switch() is False


@pytest.mark.asyncio
async def test_kill_switch_status_helpers(monkeypatch):
    stub = SupabaseStub(
        {
            "global_settings": QueryStub(
                [{"global_kill_switch": True, "updated_at": "now", "updated_by": "u1"}]
            )
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: stub)

    assert await database.is_kill_switch_active() is True
    status = await database.get_kill_switch_status()
    assert status["active"] is True
    assert status["source"] == "database"

    allowed, reason = await database.check_kill_switch_for_trading()
    assert allowed is False
    assert "halted" in reason


@pytest.mark.asyncio
async def test_kill_switch_helpers_fail_safe(monkeypatch):
    monkeypatch.setattr(
        database, "get_supabase", MagicMock(side_effect=RuntimeError("db down"))
    )

    assert await database.is_kill_switch_active() is True
    status = await database.get_kill_switch_status()
    assert status["active"] is True
    assert status["source"] == "error"
    assert await database.get_global_settings() == {}


@pytest.mark.asyncio
async def test_get_global_settings_and_alert_logging(monkeypatch):
    alerts = QueryStub([])
    audit_events = QueryStub([])
    stub = SupabaseStub(
        {
            "global_settings": QueryStub([{"id": "gs-1", "paper_trading_mode": True}]),
            "alerts": alerts,
            "audit_events": audit_events,
        }
    )
    monkeypatch.setattr(database, "get_supabase", lambda: stub)

    settings = await database.get_global_settings()
    assert settings["paper_trading_mode"] is True

    await database.create_alert("Alert", "Message", metadata={"source": "test"})
    assert alerts.insert_payload["metadata"] == {"source": "test"}

    await database.audit_log("action", "resource", resource_id="r1")
    assert audit_events.insert_payload["resource_id"] == "r1"


def test_get_supabase_client_requires_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(ValueError):
        security.get_supabase_client()


@pytest.mark.asyncio
async def test_verify_token_and_get_current_user(monkeypatch):
    auth_user = SimpleNamespace(
        id="user-1",
        email="user@example.com",
        user_metadata={"role": "trader"},
        email_confirmed_at="2026-01-01T00:00:00Z",
    )
    auth_result = SimpleNamespace(user=auth_user)
    user_roles = QueryStub([{"role": "viewer"}, {"role": "admin"}])
    stub = SimpleNamespace(
        auth=SimpleNamespace(get_user=lambda token: auth_result),
        table=lambda _name: user_roles,
    )
    monkeypatch.setattr(security, "get_supabase_client", lambda: stub)

    verified = await security.verify_token("valid")
    assert verified["role"] == "trader"
    assert verified["email_verified"] is True

    current_user = await security.get_current_user("valid")
    assert current_user["role"] == "admin"


@pytest.mark.asyncio
async def test_verify_token_failure_and_role_fallback(monkeypatch):
    bad_stub = SimpleNamespace(
        auth=SimpleNamespace(get_user=lambda token: SimpleNamespace(user=None))
    )
    monkeypatch.setattr(security, "get_supabase_client", lambda: bad_stub)

    with pytest.raises(HTTPException) as exc:
        await security.verify_token("bad")
    assert exc.value.status_code == 401

    monkeypatch.setattr(
        security,
        "verify_token",
        AsyncMock(
            return_value={"id": "u1", "email": "u@example.com", "role": "trader"}
        ),
    )
    role_error_stub = SimpleNamespace(
        table=lambda _name: MagicMock(
            select=MagicMock(
                return_value=MagicMock(
                    eq=MagicMock(side_effect=RuntimeError("no table"))
                )
            )
        )
    )
    monkeypatch.setattr(security, "get_supabase_client", lambda: role_error_stub)

    current_user = await security.get_current_user("valid")
    assert current_user["role"] == "viewer"


@pytest.mark.asyncio
async def test_require_role_dependency():
    checker = security.require_role(["admin", "cio"])
    request = SimpleNamespace(state=SimpleNamespace(user={"id": "u1", "role": "admin"}))
    assert await checker(request) == {"id": "u1", "role": "admin"}

    request.state.user = {"id": "u1", "role": "viewer"}
    with pytest.raises(HTTPException) as exc:
        await checker(request)
    assert exc.value.status_code == 403
