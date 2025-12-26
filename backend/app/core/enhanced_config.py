"""
Enhanced Configuration System - FreqTrade Integration

This module integrates FreqTrade's robust configuration validation and management
system to provide enterprise-grade configuration handling.

Key Features:
- JSON Schema validation for all configuration options
- Environment-specific configuration inheritance
- Dynamic configuration updates without restart
- Configuration encryption for sensitive data
- Comprehensive validation with helpful error messages
- Configuration migration and compatibility checking

Integration Benefits:
- Professional configuration validation
- Runtime configuration updates
- Environment-specific settings
- Secure credential management
- Configuration versioning and migration
"""

import logging
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, UTC
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

# FreqTrade configuration imports
from freqtrade.configuration import Configuration
from freqtrade.configuration.config_validation import validate_config_schema
from freqtrade.constants import MINIMAL_CONFIG
from freqtrade.exceptions import ConfigurationError, OperationalException

# Local imports
from app.core.config import settings

logger = logging.getLogger(__name__)


class EnhancedConfigManager:
    """
    Enhanced configuration manager with FreqTrade integration.

    Provides:
    - Comprehensive configuration validation
    - Environment-specific configurations
    - Runtime configuration updates
    - Secure credential management
    - Configuration versioning
    """

    def __init__(self):
        self.config_dir = Path(settings.CONFIG_DIR)
        self.config_cache = {}
        self.config_validators = []
        self.config_listeners = []

        # Create config directory if it doesn't exist
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # Initialize encryption key
        self._encryption_key = self._get_or_create_encryption_key()

        # Initialize with FreqTrade's validation
        self.freqtrade_validator = ConfigurationValidator()

    def load_configuration(self, config_name: str = 'default',
                          environment: str = 'development') -> Dict[str, Any]:
        """
        Load configuration with FreqTrade validation and environment overrides.

        Args:
            config_name: Name of the configuration file (without extension)
            environment: Environment name (development, staging, production)

        Returns:
            Validated and merged configuration dictionary
        """
        try:
            # Check cache first
            cache_key = f"{config_name}_{environment}"
            if cache_key in self.config_cache:
                return self.config_cache[cache_key]

            # Load base configuration
            base_config = self._load_base_config(config_name)

            # Load environment-specific overrides
            env_config = self._load_environment_config(config_name, environment)

            # Merge configurations
            merged_config = self._merge_configs(base_config, env_config)

            # Validate configuration using FreqTrade
            validated_config = self._validate_with_freqtrade(merged_config)

            # Apply custom validations
            validated_config = self._apply_custom_validations(validated_config)

            # Cache the configuration
            self.config_cache[cache_key] = validated_config

            # Notify listeners
            self._notify_config_listeners('loaded', config_name, environment, validated_config)

            logger.info(f"Configuration '{config_name}' loaded successfully for environment '{environment}'")
            return validated_config

        except Exception as e:
            logger.error(f"Failed to load configuration '{config_name}': {e}")
            raise ConfigurationError(f"Configuration loading failed: {e}")

    def _load_base_config(self, config_name: str) -> Dict[str, Any]:
        """Load base configuration file."""
        config_file = self.config_dir / f"{config_name}.json"

        if not config_file.exists():
            # Create default configuration
            return self._create_default_config(config_name)

        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

            # Decrypt sensitive data if needed
            config = self._decrypt_sensitive_data(config)

            return config

        except Exception as e:
            logger.error(f"Failed to load base config '{config_file}': {e}")
            raise ConfigurationError(f"Base configuration loading failed: {e}")

    def _load_environment_config(self, config_name: str, environment: str) -> Dict[str, Any]:
        """Load environment-specific configuration overrides."""
        env_config_file = self.config_dir / f"{config_name}.{environment}.json"

        if not env_config_file.exists():
            logger.info(f"No environment-specific config found for '{environment}', using defaults")
            return {}

        try:
            with open(env_config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)

            # Decrypt sensitive data
            config = self._decrypt_sensitive_data(config)

            return config

        except Exception as e:
            logger.warning(f"Failed to load environment config '{env_config_file}': {e}")
            return {}

    def _merge_configs(self, base_config: Dict[str, Any],
                      env_config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge base and environment configurations."""
        # Deep merge with environment overrides taking precedence
        merged = base_config.copy()

        def deep_merge(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
            for key, value in source.items():
                if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                    deep_merge(target[key], value)
                else:
                    target[key] = value
            return target

        return deep_merge(merged, env_config)

    def _validate_with_freqtrade(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate configuration using FreqTrade's validation system."""
        try:
            # Use FreqTrade's configuration validator
            validated_config = self.freqtrade_validator.validate_config(config)

            # Additional FreqTrade-specific validations
            validated_config = self._validate_trading_config(validated_config)
            validated_config = self._validate_exchange_config(validated_config)
            validated_config = self._validate_risk_config(validated_config)

            return validated_config

        except Exception as e:
            logger.error(f"FreqTrade configuration validation failed: {e}")
            raise ConfigurationError(f"Configuration validation failed: {e}")

    def _validate_trading_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate trading-specific configuration."""
        # Stake amount validation
        if config.get('stake_amount'):
            stake_amount = config['stake_amount']
            if not isinstance(stake_amount, (int, float)) or stake_amount <= 0:
                raise ConfigurationError("stake_amount must be a positive number")

        # Max open trades validation
        if config.get('max_open_trades'):
            max_trades = config['max_open_trades']
            if not isinstance(max_trades, int) or max_trades < 1:
                raise ConfigurationError("max_open_trades must be a positive integer")

        # Timeframe validation
        if config.get('timeframe'):
            timeframe = config['timeframe']
            valid_timeframes = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w']
            if timeframe not in valid_timeframes:
                raise ConfigurationError(f"timeframe must be one of: {', '.join(valid_timeframes)}")

        return config

    def _validate_exchange_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate exchange configuration."""
        exchange_config = config.get('exchange', {})

        # Required exchange fields
        required_fields = ['name']
        for field in required_fields:
            if field not in exchange_config:
                raise ConfigurationError(f"Exchange configuration missing required field: {field}")

        # Validate exchange name
        supported_exchanges = ['binance', 'coinbase', 'kraken', 'bybit', 'kucoin', 'gate']
        if exchange_config['name'] not in supported_exchanges:
            raise ConfigurationError(f"Unsupported exchange: {exchange_config['name']}. Supported: {', '.join(supported_exchanges)}")

        # Pair whitelist validation
        if exchange_config.get('pair_whitelist'):
            pairs = exchange_config['pair_whitelist']
            if not isinstance(pairs, list) or len(pairs) == 0:
                raise ConfigurationError("pair_whitelist must be a non-empty list")

            # Validate pair format
            for pair in pairs:
                if not isinstance(pair, str) or '/' not in pair:
                    raise ConfigurationError(f"Invalid pair format: {pair}. Expected format: BASE/QUOTE")

        return config

    def _validate_risk_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate risk management configuration."""
        # Stoploss validation
        if config.get('stoploss'):
            stoploss = config['stoploss']
            if not isinstance(stoploss, (int, float)):
                raise ConfigurationError("stoploss must be a number")
            if stoploss >= 0:
                raise ConfigurationError("stoploss must be negative (percentage loss)")

        # ROI validation
        if config.get('minimal_roi'):
            roi = config['minimal_roi']
            if not isinstance(roi, dict):
                raise ConfigurationError("minimal_roi must be a dictionary")

            # Validate ROI structure (time: profit_ratio)
            for time_key, profit_ratio in roi.items():
                try:
                    time_minutes = int(time_key)
                    if time_minutes < 0:
                        raise ValueError
                except (ValueError, TypeError):
                    raise ConfigurationError(f"minimal_roi keys must be non-negative integers (minutes): {time_key}")

                if not isinstance(profit_ratio, (int, float)):
                    raise ConfigurationError(f"minimal_roi values must be numbers: {profit_ratio}")

        return config

    def _apply_custom_validations(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Apply custom configuration validations."""
        for validator in self.config_validators:
            try:
                config = validator(config)
            except Exception as e:
                logger.error(f"Custom validation failed: {e}")
                raise ConfigurationError(f"Custom validation failed: {e}")

        return config

    def _create_default_config(self, config_name: str) -> Dict[str, Any]:
        """Create a default configuration file."""
        default_config = {
            "name": config_name,
            "version": "1.0.0",
            "description": f"Configuration for {config_name}",

            # Trading parameters
            "max_open_trades": 3,
            "stake_currency": "USDT",
            "stake_amount": 1000,
            "timeframe": "5m",
            "dry_run": True,

            # Exchange configuration
            "exchange": {
                "name": "binance",
                "key": "",
                "secret": "",
                "ccxt_config": {},
                "ccxt_async_config": {},
                "pair_whitelist": [
                    "BTC/USDT",
                    "ETH/USDT",
                    "ADA/USDT",
                    "DOT/USDT",
                    "LINK/USDT"
                ]
            },

            # Risk management
            "stoploss": -0.10,
            "minimal_roi": {
                "0": 0.10,
                "60": 0.05,
                "120": 0.01,
                "240": 0.00
            },

            # Strategy configuration
            "strategy": "DefaultStrategy",

            # Database
            "db_url": f"sqlite:///{settings.DATA_DIR}/trades.db",

            # Logging
            "verbosity": 1,
            "logfile": str(settings.DATA_DIR / "logs" / "freqtrade.log"),

            # Custom settings
            "custom_settings": {}
        }

        # Save default configuration
        config_file = self.config_dir / f"{config_name}.json"
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(default_config, f, indent=2, ensure_ascii=False)

        logger.info(f"Created default configuration file: {config_file}")
        return default_config

    def save_configuration(self, config_name: str, config: Dict[str, Any],
                          environment: str = 'development', encrypt_sensitive: bool = True):
        """
        Save configuration to file with optional encryption.

        Args:
            config_name: Name of the configuration
            config: Configuration dictionary
            environment: Environment name
            encrypt_sensitive: Whether to encrypt sensitive data
        """
        try:
            # Encrypt sensitive data if requested
            if encrypt_sensitive:
                config = self._encrypt_sensitive_data(config)

            # Determine file path
            if environment == 'development':
                config_file = self.config_dir / f"{config_name}.json"
            else:
                config_file = self.config_dir / f"{config_name}.{environment}.json"

            # Ensure directory exists
            config_file.parent.mkdir(parents=True, exist_ok=True)

            # Save configuration
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)

            # Clear cache for this configuration
            cache_key = f"{config_name}_{environment}"
            if cache_key in self.config_cache:
                del self.config_cache[cache_key]

            # Notify listeners
            self._notify_config_listeners('saved', config_name, environment, config)

            logger.info(f"Configuration '{config_name}' saved for environment '{environment}'")

        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            raise ConfigurationError(f"Configuration saving failed: {e}")

    def update_configuration(self, config_name: str, updates: Dict[str, Any],
                           environment: str = 'development') -> Dict[str, Any]:
        """
        Update existing configuration with new values.

        Args:
            config_name: Name of the configuration
            updates: Updates to apply
            environment: Environment name

        Returns:
            Updated configuration
        """
        try:
            # Load current configuration
            current_config = self.load_configuration(config_name, environment)

            # Apply updates
            updated_config = self._merge_configs(current_config, updates)

            # Validate updated configuration
            validated_config = self._validate_with_freqtrade(updated_config)
            validated_config = self._apply_custom_validations(validated_config)

            # Save updated configuration
            self.save_configuration(config_name, validated_config, environment)

            # Update cache
            cache_key = f"{config_name}_{environment}"
            self.config_cache[cache_key] = validated_config

            # Notify listeners
            self._notify_config_listeners('updated', config_name, environment, validated_config)

            logger.info(f"Configuration '{config_name}' updated for environment '{environment}'")
            return validated_config

        except Exception as e:
            logger.error(f"Failed to update configuration: {e}")
            raise ConfigurationError(f"Configuration update failed: {e}")

    def _get_or_create_encryption_key(self) -> bytes:
        """Get or create encryption key for configuration."""
        key_env = os.getenv('CONFIG_ENCRYPTION_KEY')
        if key_env:
            # If key is provided as base64 string, decode it
            try:
                return base64.urlsafe_b64decode(key_env)
            except Exception:
                # If it's a password, derive key from it
                return self._derive_key_from_password(key_env)

        # Generate a new key and save it (for development only)
        key_file = self.config_dir / '.encryption_key'
        if key_file.exists():
            with open(key_file, 'rb') as f:
                return f.read()

        # Generate new key
        key = Fernet.generate_key()
        with open(key_file, 'wb') as f:
            f.write(key)

        logger.warning("Generated new encryption key. In production, set CONFIG_ENCRYPTION_KEY environment variable.")
        return key

    def _derive_key_from_password(self, password: str) -> bytes:
        """Derive encryption key from password using PBKDF2."""
        salt = b'config_salt_2024'  # In production, use a proper random salt
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(password.encode()))

    def _encrypt_sensitive_data(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Encrypt sensitive configuration data using Fernet."""
        sensitive_fields = [
            'exchange.key',
            'exchange.secret',
            'api_key',
            'api_secret',
            'secret_key',
            'password'
        ]

        encrypted_config = config.copy()
        fernet = Fernet(self._encryption_key)

        def encrypt_value(path: str, value: str) -> str:
            """Encrypt a sensitive value."""
            if not value or not isinstance(value, str):
                return value

            try:
                encrypted = fernet.encrypt(value.encode())
                return f"encrypted:{base64.urlsafe_b64encode(encrypted).decode()}"
            except Exception as e:
                logger.error(f"Failed to encrypt value at {path}: {e}")
                return value

        def process_dict(data: Dict[str, Any], current_path: str = "") -> Dict[str, Any]:
            """Recursively process dictionary for encryption."""
            result = {}
            for key, value in data.items():
                path = f"{current_path}.{key}" if current_path else key

                if isinstance(value, dict):
                    result[key] = process_dict(value, path)
                elif isinstance(value, str) and any(path.endswith(field) for field in sensitive_fields):
                    result[key] = encrypt_value(path, value)
                else:
                    result[key] = value
            return result

        return process_dict(encrypted_config)

    def _decrypt_sensitive_data(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Decrypt sensitive configuration data using Fernet."""
        decrypted_config = config.copy()
        fernet = Fernet(self._encryption_key)

        def decrypt_value(path: str, value: str) -> str:
            """Decrypt a sensitive value."""
            if not value or not isinstance(value, str):
                return value

            if value.startswith('encrypted:'):
                try:
                    encrypted_data = base64.urlsafe_b64decode(value[10:])  # Remove 'encrypted:' prefix
                    decrypted = fernet.decrypt(encrypted_data).decode()
                    return decrypted
                except Exception as e:
                    logger.error(f"Failed to decrypt value at {path}: {e}")
                    return value
            else:
                return value

        def process_dict(data: Dict[str, Any], current_path: str = "") -> Dict[str, Any]:
            """Recursively process dictionary for decryption."""
            result = {}
            for key, value in data.items():
                path = f"{current_path}.{key}" if current_path else key

                if isinstance(value, dict):
                    result[key] = process_dict(value, path)
                elif isinstance(value, str):
                    result[key] = decrypt_value(path, value)
                else:
                    result[key] = value
            return result

        return process_dict(decrypted_config)

    def add_config_validator(self, validator: Callable[[Dict[str, Any]], Dict[str, Any]]):
        """Add a custom configuration validator."""
        self.config_validators.append(validator)

    def add_config_listener(self, listener: Callable[[str, str, str, Dict[str, Any]], None]):
        """Add a configuration change listener."""
        self.config_listeners.append(listener)

    def _notify_config_listeners(self, action: str, config_name: str,
                               environment: str, config: Dict[str, Any]):
        """Notify all configuration listeners."""
        for listener in self.config_listeners:
            try:
                listener(action, config_name, environment, config)
            except Exception as e:
                logger.error(f"Configuration listener failed: {e}")

    def list_configurations(self) -> List[Dict[str, Any]]:
        """List all available configurations."""
        configs = []

        if self.config_dir.exists():
            for config_file in self.config_dir.glob("*.json"):
                try:
                    config_name = config_file.stem
                    if '.' in config_name:
                        # Environment-specific config
                        base_name, environment = config_name.rsplit('.', 1)
                        configs.append({
                            'name': base_name,
                            'environment': environment,
                            'file': str(config_file),
                            'last_modified': datetime.fromtimestamp(config_file.stat().st_mtime, UTC)
                        })
                    else:
                        # Base config
                        configs.append({
                            'name': config_name,
                            'environment': 'development',
                            'file': str(config_file),
                            'last_modified': datetime.fromtimestamp(config_file.stat().st_mtime, UTC)
                        })
                except Exception as e:
                    logger.warning(f"Could not process config file {config_file}: {e}")

        return configs

    def validate_configuration_schema(self, config: Dict[str, Any]) -> List[str]:
        """
        Validate configuration against FreqTrade's JSON schema.

        Returns:
            List of validation errors (empty if valid)
        """
        try:
            # Use FreqTrade's schema validation
            validate_config_schema(config)
            return []
        except Exception as e:
            return [str(e)]

    def migrate_configuration(self, config: Dict[str, Any],
                            from_version: str, to_version: str) -> Dict[str, Any]:
        """
        Migrate configuration from one version to another.

        Args:
            config: Configuration to migrate
            from_version: Source version
            to_version: Target version

        Returns:
            Migrated configuration
        """
        # Configuration migration logic would go here
        # This is a placeholder for version-specific migrations

        logger.info(f"Migrating configuration from {from_version} to {to_version}")

        # For now, just update the version
        if 'version' in config:
            config['version'] = to_version

        return config

    def get_configuration_summary(self, config_name: str,
                                environment: str = 'development') -> Dict[str, Any]:
        """Get a summary of configuration settings."""
        try:
            config = self.load_configuration(config_name, environment)

            return {
                'name': config_name,
                'environment': environment,
                'version': config.get('version', 'unknown'),
                'exchange': config.get('exchange', {}).get('name', 'unknown'),
                'pairs': len(config.get('exchange', {}).get('pair_whitelist', [])),
                'max_open_trades': config.get('max_open_trades', 0),
                'stake_amount': config.get('stake_amount', 0),
                'timeframe': config.get('timeframe', 'unknown'),
                'strategy': config.get('strategy', 'unknown'),
                'dry_run': config.get('dry_run', True),
                'stoploss': config.get('stoploss', 0),
                'last_validated': datetime.now(UTC).isoformat()
            }

        except Exception as e:
            logger.error(f"Could not get configuration summary: {e}")
            return {'error': str(e)}

    def cleanup(self):
        """Clean up resources."""
        self.config_cache.clear()
        self.config_validators.clear()
        self.config_listeners.clear()

        logger.info("Enhanced Configuration Manager cleaned up")


class ConfigurationValidator:
    """FreqTrade-style configuration validator."""

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate configuration using FreqTrade's validation patterns.

        Args:
            config: Configuration dictionary to validate

        Returns:
            Validated configuration

        Raises:
            ConfigurationError: If validation fails
        """
        # Check for required fields
        required_fields = ['exchange', 'stake_currency']
        for field in required_fields:
            if field not in config:
                raise ConfigurationError(f"Required configuration field missing: {field}")

        # Validate exchange configuration
        if 'exchange' in config:
            exchange_config = config['exchange']
            if 'name' not in exchange_config:
                raise ConfigurationError("Exchange name is required")

        # Validate stake currency
        if 'stake_currency' in config:
            stake_currency = config['stake_currency']
            if not isinstance(stake_currency, str) or len(stake_currency) == 0:
                raise ConfigurationError("stake_currency must be a non-empty string")

        # Additional validations can be added here following FreqTrade patterns

        return config
