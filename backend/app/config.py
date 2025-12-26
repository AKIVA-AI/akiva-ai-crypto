"""
Configuration management for the trading engine.
"""
import os
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


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


class Settings:
    """Application settings loaded from environment."""
    
    def __init__(self):
        # Environment
        self.env = os.getenv("ENV", "development")
        self.paper_trading = os.getenv("PAPER_TRADING", "true").lower() == "true"
        
        # Supabase
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY", "")
        
        # Redis
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        
        # API
        self.api_host = os.getenv("API_HOST", "0.0.0.0")
        self.api_port = int(os.getenv("API_PORT", "8000"))
        
        # Venue configurations
        self.coinbase = VenueConfig(
            api_key=os.getenv("COINBASE_API_KEY"),
            api_secret=os.getenv("COINBASE_API_SECRET"),
            passphrase=os.getenv("COINBASE_PASSPHRASE"),
            enabled=bool(os.getenv("COINBASE_API_KEY"))
        )
        
        self.mexc = VenueConfig(
            api_key=os.getenv("MEXC_API_KEY"),
            api_secret=os.getenv("MEXC_API_SECRET"),
            enabled=bool(os.getenv("MEXC_API_KEY"))
        )
        
        self.dex = VenueConfig(
            api_key=os.getenv("DEX_WALLET_PRIVATE_KEY"),
            enabled=bool(os.getenv("DEX_WALLET_PRIVATE_KEY"))
        )
        self.dex_rpc_url = os.getenv("DEX_RPC_URL", "")
        self.dex_wallet_address = os.getenv("DEX_WALLET_ADDRESS", "")
        
        # Risk configuration
        self.risk = RiskConfig(
            max_leverage=float(os.getenv("MAX_LEVERAGE", "3.0")),
            max_position_size_usd=float(os.getenv("MAX_POSITION_SIZE_USD", "100000")),
            max_daily_loss_pct=float(os.getenv("MAX_DAILY_LOSS_PCT", "5.0")),
            max_drawdown_pct=float(os.getenv("MAX_DRAWDOWN_PCT", "10.0")),
        )
    
    @property
    def is_production(self) -> bool:
        return self.env == "production"
    
    @property
    def is_paper_mode(self) -> bool:
        return self.paper_trading or self.env != "production"


settings = Settings()
