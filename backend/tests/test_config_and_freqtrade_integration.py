import importlib
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import app.config as config_module
import pytest
from app.services import freqtrade_integration as ft_integration


class ConfigManagerStub:
    def __init__(self):
        self.listeners = []

    def load_configuration(self, _config_name, _environment):
        return {"ok": True}

    def add_config_listener(self, listener):
        self.listeners.append(listener)

    def cleanup(self):
        return None


class FallbackMarketDataStub:
    def __init__(self):
        self.cleanup = MagicMock()
        self.get_historical_data = AsyncMock(return_value={"source": "fallback"})


@pytest.fixture(autouse=True)
def reset_freqtrade_hub():
    ft_integration._freqtrade_hub = None
    yield
    ft_integration._freqtrade_hub = None


def test_settings_loads_secret_from_file_and_sets_compat_aliases(tmp_path, monkeypatch):
    secret_file = tmp_path / "supabase_service_role_key"
    secret_file.write_text("service-from-file\n", encoding="utf-8")

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY_FILE", str(secret_file))
    monkeypatch.setenv("BINANCE_US_API_KEY", "binance-key")
    monkeypatch.setenv("BINANCE_US_API_SECRET", "binance-secret")
    monkeypatch.setenv("COINBASE_API_KEY", "coinbase-key")
    monkeypatch.setenv("COINBASE_API_SECRET", "coinbase-secret")
    monkeypatch.setenv("MAX_OPEN_TRADES", "7")
    monkeypatch.setenv("STAKE_AMOUNT", "2500")

    settings = config_module.Settings()

    assert settings.supabase_service_role_key == "service-from-file"
    assert settings.BINANCE_API_KEY == "binance-key"
    assert settings.BINANCE_SECRET_KEY == "binance-secret"
    assert settings.COINBASE_API_KEY == "coinbase-key"
    assert settings.COINBASE_SECRET_KEY == "coinbase-secret"
    assert settings.MAX_OPEN_TRADES == 7
    assert settings.STAKE_AMOUNT == 2500.0


@pytest.mark.asyncio
async def test_freqtrade_hub_initializes_in_degraded_mode(monkeypatch):
    monkeypatch.setattr(ft_integration, "MarketDataService", FallbackMarketDataStub)

    def fake_import(module_name):
        if module_name == "app.core.enhanced_config":
            return SimpleNamespace(EnhancedConfigManager=ConfigManagerStub)
        raise ImportError("missing enhanced module")

    monkeypatch.setattr(ft_integration, "import_module", fake_import)

    hub = ft_integration.FreqTradeIntegrationHub()
    monkeypatch.setattr(hub, "_register_signal_handlers", lambda: None)
    monkeypatch.setattr(hub, "_run_startup_handlers", AsyncMock())

    initialized = await hub.initialize()

    assert initialized is True
    assert hub.is_initialized is True
    assert hub.market_data_service is None
    assert hub.fallback_market_data is not None
    assert len(hub.initialization_errors) == 3
    assert hub.get_health_status()["overall_status"] == "degraded"
    assert hub.get_system_status()["freqtrade_integration"]["degraded_features"]


@pytest.mark.asyncio
async def test_freqtrade_hub_get_market_data_falls_back_on_error(monkeypatch):
    monkeypatch.setattr(ft_integration, "MarketDataService", FallbackMarketDataStub)

    hub = ft_integration.FreqTradeIntegrationHub()
    hub.market_data_service = SimpleNamespace(
        get_historical_data=AsyncMock(side_effect=RuntimeError("enhanced failed"))
    )
    hub.fallback_market_data = FallbackMarketDataStub()

    result = await hub.get_market_data("BTC/USDT")

    assert result == {"source": "fallback"}
    hub.fallback_market_data.get_historical_data.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_freqtrade_hub_returns_initialized_singleton(monkeypatch):
    monkeypatch.setattr(ft_integration, "MarketDataService", FallbackMarketDataStub)

    def fake_import(module_name):
        if module_name == "app.core.enhanced_config":
            return SimpleNamespace(EnhancedConfigManager=ConfigManagerStub)
        raise ImportError("missing enhanced module")

    monkeypatch.setattr(ft_integration, "import_module", fake_import)

    hub = await ft_integration.get_freqtrade_hub()
    same_hub = await ft_integration.get_freqtrade_hub()

    assert hub is same_hub
    assert hub.is_initialized is True


def test_main_module_imports_cleanly(monkeypatch):
    import app.logging_config as logging_config

    fake_logger = SimpleNamespace(info=lambda *args, **kwargs: None)
    monkeypatch.setattr(logging_config, "configure_logging", lambda: fake_logger)
    sys.modules.pop("app.main", None)

    main_module = importlib.import_module("app.main")

    assert main_module.app.title == "Hedge Fund Trading Platform"
    assert main_module.app.openapi_url == "/openapi.json"
    sys.modules.pop("app.main", None)
