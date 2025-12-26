"""
Configuration settings for the application.
"""
import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
CONFIG_DIR = DATA_DIR / "config"
LOGS_DIR = DATA_DIR / "logs"

# Create directories
DATA_DIR.mkdir(exist_ok=True)
CONFIG_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Supabase settings
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Application settings
APP_NAME = "AKIVA AI Crypto"
APP_VERSION = "1.0.0"
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# FreqTrade settings
FREQTRADE_CONFIG_DIR = CONFIG_DIR / "freqtrade"
FREQTRADE_DATA_DIR = DATA_DIR / "freqtrade"

# Create FreqTrade directories
FREQTRADE_CONFIG_DIR.mkdir(exist_ok=True)
FREQTRADE_DATA_DIR.mkdir(exist_ok=True)

class Settings:
    """Application settings."""

    def __init__(self):
        self.BASE_DIR = BASE_DIR
        self.DATA_DIR = DATA_DIR
        self.CONFIG_DIR = CONFIG_DIR
        self.LOGS_DIR = LOGS_DIR
        self.FREQTRADE_CONFIG_DIR = FREQTRADE_CONFIG_DIR
        self.FREQTRADE_DATA_DIR = FREQTRADE_DATA_DIR

        self.supabase_url = SUPABASE_URL
        self.supabase_service_role_key = SUPABASE_SERVICE_ROLE_KEY

        self.app_name = APP_NAME
        self.app_version = APP_VERSION
        self.debug = DEBUG

# Global settings instance
settings = Settings()
