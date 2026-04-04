"""
Unified configuration management for the trading engine.
This is the single source of truth for all application settings.
"""

import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

# Base directories
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
CONFIG_DIR = DATA_DIR / "config"
LOGS_DIR = DATA_DIR / "logs"

# Create directories
DATA_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# FreqTrade directories
FREQTRADE_CONFIG_DIR = CONFIG_DIR / "freqtrade"
FREQTRADE_DATA_DIR = DATA_DIR / "freqtrade"
FREQTRADE_CONFIG_DIR.mkdir(exist_ok=True)
FREQTRADE_DATA_DIR.mkdir(exist_ok=True)


class VenueConfig(BaseModel):
    """Configuration for a trading venue."""

    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    passphrase: Optional[str] = None  # For Coinbase
    enabled: bool = False


class RiskConfig(BaseModel):
    """Risk management configuration."""

    max_leverage: float = 3.0
    max_position_size_usd: float = 100000.0
    max_daily_loss_pct: float = 5.0
    max_drawdown_pct: float = 10.0
    max_correlation_exposure: float = 30.0
    circuit_breaker_latency_ms: int = 5000
    circuit_breaker_error_rate: float = 10.0
    max_notional_per_arb: float = 50000.0
    max_open_arbs: int = 5
    max_total_arb_notional: float = 250000.0
    max_venue_exposure_pct: float = 40.0
    latency_shock_ms: int = 3000


class Settings:
    """
    Unified application settings loaded from environment.
    This class consolidates all configuration to prevent inconsistencies.
    """

    def __init__(self):
        # ========== Environment ==========
        self.env = os.getenv("ENVIRONMENT", os.getenv("ENV", "development"))
        self.ENVIRONMENT = self.env  # Alias for compatibility
        self.paper_trading = os.getenv("PAPER_TRADING", "true").lower() == "true"
        self.DEBUG = os.getenv("DEBUG", "false").lower() == "true"
        self.debug = self.DEBUG  # Alias

        # ========== Application Info ==========
        self.app_name = "Enterprise Crypto"
        self.app_version = "1.0.0"

        # ========== Directories ==========
        self.BASE_DIR = BASE_DIR
        self.DATA_DIR = DATA_DIR
        self.CONFIG_DIR = CONFIG_DIR
        self.LOGS_DIR = LOGS_DIR
        self.FREQTRADE_CONFIG_DIR = FREQTRADE_CONFIG_DIR
        self.FREQTRADE_DATA_DIR = FREQTRADE_DATA_DIR

        # ========== Supabase ==========
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_service_role_key = self._get_secret(
            "SUPABASE_SERVICE_ROLE_KEY",
            self._get_secret("SUPABASE_SERVICE_KEY", ""),
        )
        self.supabase_anon_key = self._get_secret(
            "SUPABASE_ANON_KEY",
            self._get_secret("SUPABASE_KEY", ""),
        )
        self.tenant_id = os.getenv("TENANT_ID")

        # ========== Redis ==========
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_password = self._get_secret("REDIS_PASSWORD", "")

        # ========== Agent Identity (Zero Trust) ==========
        self.agent_signing_key = self._get_secret("AGENT_SIGNING_KEY", "")

        # ========== API Server ==========
        self.api_host = os.getenv("API_HOST", "0.0.0.0")  # nosec B104
        self.api_port = int(os.getenv("API_PORT", "8000"))

        # ========== CORS & Hosts ==========
        self.ALLOWED_ORIGINS = self._parse_list(os.getenv("ALLOWED_ORIGINS")) or [
            "http://localhost:3000",
            "http://localhost:5173",
        ]
        self.ALLOWED_HOSTS = self._parse_list(os.getenv("ALLOWED_HOSTS")) or [
            "localhost",
            "127.0.0.1",
        ]

        # ========== Venue Configurations ==========
        self.coinbase = VenueConfig(
            api_key=self._get_secret("COINBASE_API_KEY"),
            api_secret=self._get_secret("COINBASE_API_SECRET"),
            passphrase=self._get_secret("COINBASE_PASSPHRASE"),
            enabled=bool(self._get_secret("COINBASE_API_KEY")),
        )

        self.binance_us = VenueConfig(
            api_key=self._get_secret("BINANCE_US_API_KEY"),
            api_secret=self._get_secret("BINANCE_US_API_SECRET"),
            enabled=bool(self._get_secret("BINANCE_US_API_KEY")),
        )

        self.mexc = VenueConfig(
            api_key=self._get_secret("MEXC_API_KEY"),
            api_secret=self._get_secret("MEXC_API_SECRET"),
            enabled=bool(self._get_secret("MEXC_API_KEY")),
        )

        self.dex = VenueConfig(
            api_key=self._get_secret("DEX_WALLET_PRIVATE_KEY"),
            enabled=bool(self._get_secret("DEX_WALLET_PRIVATE_KEY")),
        )
        self.dex_rpc_url = os.getenv("DEX_RPC_URL", "")
        self.dex_wallet_address = self._get_secret("DEX_WALLET_ADDRESS", "")

        # Additional venue aliases used by older enhanced modules.
        self.KRAKEN_API_KEY = self._get_secret("KRAKEN_API_KEY", "")
        self.KRAKEN_SECRET_KEY = self._get_secret("KRAKEN_SECRET_KEY", "")
        self.BYBIT_API_KEY = self._get_secret("BYBIT_API_KEY", "")
        self.BYBIT_SECRET_KEY = self._get_secret("BYBIT_SECRET_KEY", "")

        # ========== Risk Configuration ==========
        self.risk = RiskConfig(
            max_leverage=float(os.getenv("MAX_LEVERAGE", "3.0")),
            max_position_size_usd=float(os.getenv("MAX_POSITION_SIZE_USD", "100000")),
            max_daily_loss_pct=float(os.getenv("MAX_DAILY_LOSS_PCT", "5.0")),
            max_drawdown_pct=float(os.getenv("MAX_DRAWDOWN_PCT", "10.0")),
            max_correlation_exposure=float(
                os.getenv("MAX_CORRELATION_EXPOSURE", "30.0")
            ),
            circuit_breaker_latency_ms=int(
                os.getenv("CIRCUIT_BREAKER_LATENCY_MS", "5000")
            ),
            circuit_breaker_error_rate=float(
                os.getenv("CIRCUIT_BREAKER_ERROR_RATE", "10.0")
            ),
            max_notional_per_arb=float(os.getenv("MAX_NOTIONAL_PER_ARB", "50000")),
            max_open_arbs=int(os.getenv("MAX_OPEN_ARBS", "5")),
            max_total_arb_notional=float(os.getenv("MAX_TOTAL_ARB_NOTIONAL", "250000")),
            max_venue_exposure_pct=float(os.getenv("MAX_VENUE_EXPOSURE_PCT", "40.0")),
            latency_shock_ms=int(os.getenv("LATENCY_SHOCK_MS", "3000")),
        )

        # ========== External API Keys ==========
        self.coingecko_api_key = self._get_secret("COINGECKO_API_KEY", "")
        self.cryptocompare_api_key = self._get_secret("CRYPTOCOMPARE_API_KEY", "")
        self.lunarcrush_api_key = self._get_secret("LUNARCRUSH_API_KEY", "")
        self.whale_alert_api_key = self._get_secret("WHALE_ALERT_API_KEY", "")

        # Legacy compatibility aliases used by FreqTrade-oriented modules.
        self.DRY_RUN = self.is_paper_mode
        self.BINANCE_API_KEY = self.binance_us.api_key or ""
        self.BINANCE_SECRET_KEY = self.binance_us.api_secret or ""
        self.COINBASE_API_KEY = self.coinbase.api_key or ""
        self.COINBASE_SECRET_KEY = self.coinbase.api_secret or ""
        self.MAX_OPEN_TRADES = int(os.getenv("MAX_OPEN_TRADES", "3"))
        self.STAKE_AMOUNT = float(os.getenv("STAKE_AMOUNT", "1000"))

    def _get_secret(self, name: str, default: Optional[str] = None) -> Optional[str]:
        """Load a secret from env or a mounted secret file via NAME_FILE."""
        file_path = os.getenv(f"{name}_FILE")
        if file_path:
            with open(file_path, "r", encoding="utf-8") as secret_file:
                return secret_file.read().strip()
        return os.getenv(name, default)

    def _parse_list(self, value: Optional[str]) -> Optional[List[str]]:
        """Parse comma-separated environment variable to list."""
        if not value:
            return None
        return [v.strip() for v in value.split(",") if v.strip()]

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_paper_mode(self) -> bool:
        """Check if we should run in paper trading mode."""
        return self.paper_trading or self.env != "production"

    def validate(self) -> list[str]:
        """Validate required configuration. Returns list of errors."""
        errors = []

        if not self.supabase_url:
            errors.append("SUPABASE_URL is required")
        if not self.supabase_service_role_key:
            errors.append("SUPABASE_SERVICE_ROLE_KEY is required")

        return errors


# Global singleton instance
settings = Settings()
