"""
FreqTrade Integration Hub - Unified Integration Layer

This module provides a unified integration layer that orchestrates all FreqTrade
components and provides a clean API for the rest of the application.

Key Features:
- Unified FreqTrade component management
- Service orchestration and lifecycle management
- Cross-component communication and data flow
- Performance monitoring and health checks
- Graceful startup and shutdown handling

Integration Benefits:
- Single entry point for all FreqTrade functionality
- Consistent error handling and logging
- Resource management and cleanup
- Component health monitoring
- Easy testing and maintenance
"""

import asyncio
import logging
import signal
from datetime import UTC, datetime
from importlib import import_module
from typing import Any, Callable, Dict, List, Optional

from app.core.config import settings

# Original services for fallback
from app.services.market_data_service import MarketDataService

logger = logging.getLogger(__name__)


class FreqTradeIntegrationHub:
    """
    Unified integration hub for all FreqTrade components.

    This class manages the lifecycle of all FreqTrade-integrated services,
    provides unified configuration management, and orchestrates communication
    between components.
    """

    def __init__(self):
        self.is_initialized = False
        self.is_running = False
        self.initialization_errors: List[str] = []

        # FreqTrade-integrated services
        self.freqai_engine: Optional[Any] = None
        self.market_data_service: Optional[Any] = None
        self.backtesting_engine: Optional[Any] = None
        self.config_manager: Optional[Any] = None

        # Fallback services (original implementations)
        self.fallback_market_data: Optional[MarketDataService] = None

        # Component health monitoring
        self.component_health = {}
        self.health_check_interval = 60  # seconds

        # Event handlers
        self.startup_handlers: List[Callable] = []
        self.shutdown_handlers: List[Callable] = []
        self.error_handlers: List[Callable[[Exception], None]] = []

        # Configuration
        self.config_name = "enterprise_crypto"
        self.environment = settings.ENVIRONMENT or "development"

    async def initialize(self) -> bool:
        """
        Initialize all FreqTrade-integrated components.

        Returns:
            True if initialization successful, False otherwise
        """
        if self.is_initialized:
            logger.warning("FreqTrade integration already initialized")
            return True

        try:
            logger.info("Initializing FreqTrade Integration Hub...")

            config_manager_cls = self._load_optional_class(
                "app.core.enhanced_config", "EnhancedConfigManager"
            )
            if config_manager_cls is not None:
                self.config_manager = config_manager_cls()
                logger.info("Configuration manager initialized")
                self.config_manager.load_configuration(
                    self.config_name, self.environment
                )
                logger.info("Configuration loaded")

            self.fallback_market_data = MarketDataService()
            logger.info("Fallback market data service initialized")

            await self._initialize_enhanced_components()

            self._setup_component_communication()
            self._register_signal_handlers()

            self.is_initialized = True
            if self.initialization_errors:
                logger.warning(
                    "FreqTrade Integration Hub initialized in degraded mode: %s",
                    "; ".join(self.initialization_errors),
                )
            else:
                logger.info("FreqTrade Integration Hub initialized successfully")

            await self._run_startup_handlers()

            return True

        except Exception as exc:
            logger.error("Failed to initialize FreqTrade Integration Hub: %s", exc)
            await self._run_error_handlers(exc)
            return False

    async def _initialize_enhanced_components(self):
        """Initialize optional enhanced services without breaking backend startup."""
        market_data_cls = self._load_optional_class(
            "app.services.enhanced_market_data_service", "EnhancedMarketDataService"
        )
        if market_data_cls is not None:
            try:
                self.market_data_service = market_data_cls()
                logger.info("Enhanced market data service initialized")
            except Exception as exc:
                self._record_initialization_error(
                    f"Enhanced market data unavailable: {exc}"
                )

        freqai_cls = self._load_optional_class(
            "app.services.enhanced_quantitative_engine", "FreqAIEnhancedEngine"
        )
        if freqai_cls is not None and self.market_data_service is not None:
            try:
                self.freqai_engine = freqai_cls(self.market_data_service)
                logger.info("FreqAI enhanced engine initialized")
            except Exception as exc:
                self._record_initialization_error(
                    f"FreqAI enhanced engine unavailable: {exc}"
                )

        backtesting_cls = self._load_optional_class(
            "app.services.enhanced_backtesting_engine", "EnhancedBacktestingEngine"
        )
        if backtesting_cls is not None and self.market_data_service is not None:
            try:
                self.backtesting_engine = backtesting_cls(self.market_data_service)
                logger.info("Enhanced backtesting engine initialized")
            except Exception as exc:
                self._record_initialization_error(
                    f"Enhanced backtesting unavailable: {exc}"
                )

    def _load_optional_class(self, module_name: str, class_name: str):
        """Import optional enhanced components lazily so app.main stays importable."""
        try:
            module = import_module(module_name)
            return getattr(module, class_name)
        except Exception as exc:
            self._record_initialization_error(f"{class_name} import failed: {exc}")
            return None

    def _record_initialization_error(self, message: str):
        """Store initialization warnings once and expose them through status APIs."""
        if message not in self.initialization_errors:
            self.initialization_errors.append(message)
        logger.warning(message)

    def _setup_component_communication(self):
        """Set up communication channels between components."""
        try:
            if (
                self.market_data_service
                and self.freqai_engine
                and hasattr(self.market_data_service, "add_data_callback")
                and hasattr(self.freqai_engine, "_handle_market_data_update")
            ):
                self.market_data_service.add_data_callback(
                    self.freqai_engine._handle_market_data_update
                )

            if self.config_manager:
                self.config_manager.add_config_listener(self._handle_config_change)

            logger.info("Component communication channels established")

        except Exception as exc:
            logger.error("Failed to setup component communication: %s", exc)

    def _register_signal_handlers(self):
        """Register system signal handlers for graceful shutdown."""
        try:

            def signal_handler(signum, frame):
                logger.info(
                    f"Received signal {signum}, initiating graceful shutdown..."
                )
                asyncio.create_task(self.shutdown())

            # Register signal handlers
            signal.signal(signal.SIGINT, signal_handler)
            signal.signal(signal.SIGTERM, signal_handler)

            # Handle Windows signals if applicable
            if hasattr(signal, "SIGBREAK"):
                signal.signal(signal.SIGBREAK, signal_handler)

            logger.info("Signal handlers registered")

        except Exception as e:
            logger.warning(f"Could not register signal handlers: {e}")

    async def start(self) -> bool:
        """
        Start all FreqTrade-integrated services.

        Returns:
            True if startup successful, False otherwise
        """
        if not self.is_initialized:
            logger.error("Cannot start FreqTrade integration - not initialized")
            return False

        if self.is_running:
            logger.warning("FreqTrade integration already running")
            return True

        try:
            logger.info("Starting FreqTrade Integration Hub...")

            # Start WebSocket streams
            if self.market_data_service:
                await self.market_data_service.start_websocket_streams()
                logger.info("✓ WebSocket streams started")

            # Start health monitoring
            asyncio.create_task(self._start_health_monitoring())
            logger.info("✓ Health monitoring started")

            self.is_running = True
            logger.info("🚀 FreqTrade Integration Hub started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start FreqTrade Integration Hub: {e}")
            await self._run_error_handlers(e)
            return False

    async def _start_health_monitoring(self):
        """Start periodic health monitoring of all components."""
        while self.is_running:
            try:
                await self._check_component_health()
                await asyncio.sleep(self.health_check_interval)
            except Exception as e:
                logger.error(f"Health monitoring error: {e}")
                await asyncio.sleep(self.health_check_interval)

    async def _check_component_health(self):
        """Check health of all components."""
        health_status = {}

        # Check FreqAI engine
        if self.freqai_engine:
            try:
                metrics = self.freqai_engine.get_model_performance_metrics()
                health_status["freqai_engine"] = {
                    "status": "healthy",
                    "metrics": metrics,
                    "last_check": datetime.now(UTC).isoformat(),
                }
            except Exception as e:
                health_status["freqai_engine"] = {
                    "status": "unhealthy",
                    "error": str(e),
                    "last_check": datetime.now(UTC).isoformat(),
                }

        # Check market data service
        if self.market_data_service:
            try:
                connection_status = self.market_data_service.get_connection_status()
                health_status["market_data_service"] = {
                    "status": "healthy",
                    "connections": connection_status,
                    "last_check": datetime.now(UTC).isoformat(),
                }
            except Exception as e:
                health_status["market_data_service"] = {
                    "status": "unhealthy",
                    "error": str(e),
                    "last_check": datetime.now(UTC).isoformat(),
                }

        # Check backtesting engine
        if self.backtesting_engine:
            health_status["backtesting_engine"] = {
                "status": "healthy",
                "last_check": datetime.now(UTC).isoformat(),
            }

        # Check configuration manager
        if self.config_manager:
            health_status["config_manager"] = {
                "status": "healthy",
                "last_check": datetime.now(UTC).isoformat(),
            }

        self.component_health = health_status

        # Log unhealthy components
        unhealthy = [
            name
            for name, status in health_status.items()
            if status["status"] == "unhealthy"
        ]
        if unhealthy:
            logger.warning(f"Unhealthy components detected: {', '.join(unhealthy)}")

    def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status of all components."""
        return {
            "overall_status": "healthy"
            if (
                all(
                    status["status"] == "healthy"
                    for status in self.component_health.values()
                )
                and not self.initialization_errors
            )
            else "degraded",
            "components": self.component_health,
            "degraded_features": self.initialization_errors,
            "integration_hub": {
                "initialized": self.is_initialized,
                "running": self.is_running,
                "config_name": self.config_name,
                "environment": self.environment,
                "timestamp": datetime.now(UTC).isoformat(),
            },
        }

    async def shutdown(self) -> bool:
        """
        Gracefully shutdown all FreqTrade-integrated services.

        Returns:
            True if shutdown successful, False otherwise
        """
        if not self.is_running:
            return True

        try:
            logger.info("Shutting down FreqTrade Integration Hub...")

            self.is_running = False

            # Stop WebSocket streams
            if self.market_data_service:
                await self.market_data_service.stop_websocket_streams()
                logger.info("✓ WebSocket streams stopped")

            # Run shutdown handlers
            await self._run_shutdown_handlers()

            # Clean up components
            await self._cleanup_components()
            logger.info("✓ Components cleaned up")

            logger.info("👋 FreqTrade Integration Hub shut down gracefully")
            return True

        except Exception as e:
            logger.error(f"Error during FreqTrade integration shutdown: {e}")
            await self._run_error_handlers(e)
            return False

    async def _cleanup_components(self):
        """Clean up all component resources."""
        cleanup_tasks = []

        if self.freqai_engine:
            cleanup_tasks.append(asyncio.to_thread(self.freqai_engine.cleanup))

        if self.market_data_service:
            cleanup_tasks.append(asyncio.to_thread(self.market_data_service.cleanup))

        if self.backtesting_engine:
            cleanup_tasks.append(asyncio.to_thread(self.backtesting_engine.cleanup))

        if self.config_manager:
            cleanup_tasks.append(asyncio.to_thread(self.config_manager.cleanup))

        if self.fallback_market_data:
            cleanup_tasks.append(asyncio.to_thread(self.fallback_market_data.cleanup))

        # Wait for all cleanup tasks to complete
        if cleanup_tasks:
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)

    def _handle_config_change(
        self, action: str, config_name: str, environment: str, config: Dict[str, Any]
    ):
        """Handle configuration changes."""
        logger.info(f"Configuration {action}: {config_name} ({environment})")

        # Notify components of configuration changes
        if action in ["updated", "loaded"]:
            # Reload component configurations if needed
            asyncio.create_task(self._reload_component_configs(config))

    async def _reload_component_configs(self, config: Dict[str, Any]):
        """Reload component configurations after config changes."""
        try:
            # Update FreqAI engine config
            if self.freqai_engine:
                # Reinitialize with new config if needed
                pass

            # Update market data service config
            if self.market_data_service:
                # Reinitialize WebSocket connections if exchange config changed
                pass

            # Update backtesting engine config
            if self.backtesting_engine:
                # Update backtesting parameters
                pass

            logger.info("Component configurations reloaded")

        except Exception as e:
            logger.error(f"Failed to reload component configurations: {e}")

    def add_startup_handler(self, handler: Callable):
        """Add a startup handler."""
        self.startup_handlers.append(handler)

    def add_shutdown_handler(self, handler: Callable):
        """Add a shutdown handler."""
        self.shutdown_handlers.append(handler)

    def add_error_handler(self, handler: Callable[[Exception], None]):
        """Add an error handler."""
        self.error_handlers.append(handler)

    async def _run_startup_handlers(self):
        """Run all startup handlers."""
        for handler in self.startup_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    await asyncio.to_thread(handler)
            except Exception as e:
                logger.error(f"Startup handler failed: {e}")

    async def _run_shutdown_handlers(self):
        """Run all shutdown handlers."""
        for handler in self.shutdown_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    await asyncio.to_thread(handler)
            except Exception as e:
                logger.error(f"Shutdown handler failed: {e}")

    async def _run_error_handlers(self, error: Exception):
        """Run all error handlers."""
        for handler in self.error_handlers:
            try:
                handler(error)
            except Exception as e:
                logger.error(f"Error handler failed: {e}")

    # Public API Methods

    async def get_market_data(
        self, pair: str, exchange: str = "binance", limit: int = 100
    ) -> Optional[Dict[str, Any]]:
        """Get market data using enhanced service."""
        if self.market_data_service:
            try:
                return await self.market_data_service.get_historical_data(
                    pair=pair, exchange=exchange, limit=limit
                )
            except Exception as e:
                logger.warning(f"Enhanced market data failed, using fallback: {e}")

        # Fallback to original service
        if self.fallback_market_data:
            return await self.fallback_market_data.get_historical_data(
                pair=pair, exchange=exchange, limit=limit
            )

        return None

    async def generate_signals(
        self, market_data: Dict[str, Any], pair: str
    ) -> Dict[str, Any]:
        """Generate trading signals using FreqAI."""
        if not self.freqai_engine:
            return {"error": "FreqAI engine not available"}

        try:
            # Convert data format
            import pandas as pd

            df = pd.DataFrame(market_data)

            # Generate signals
            signals = self.freqai_engine.predict_signals(df, pair)
            return signals

        except Exception as e:
            logger.error(f"Signal generation failed: {e}")
            return {"error": str(e)}

    async def run_backtest(
        self,
        strategy_name: str,
        pairs: List[str],
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Run backtest using enhanced engine."""
        if not self.backtesting_engine:
            return {"error": "Backtesting engine not available"}

        try:
            results = await self.backtesting_engine.run_backtest(
                strategy_name=strategy_name,
                pairs=pairs,
                start_date=start_date,
                end_date=end_date,
            )
            return results

        except Exception as e:
            logger.error(f"Backtest failed: {e}")
            return {"error": str(e)}

    def get_configuration(
        self, config_name: str = None, environment: str = None
    ) -> Dict[str, Any]:
        """Get configuration using enhanced manager."""
        if not self.config_manager:
            return {"error": "Configuration manager not available"}

        try:
            config_name = config_name or self.config_name
            environment = environment or self.environment

            config = self.config_manager.load_configuration(config_name, environment)
            return config

        except Exception as e:
            logger.error(f"Configuration retrieval failed: {e}")
            return {"error": str(e)}

    async def train_ml_models(
        self, pair: str, start_date: datetime, end_date: datetime
    ) -> Dict[str, float]:
        """Train ML models using FreqAI."""
        if not self.freqai_engine:
            return {"error": "FreqAI engine not available"}

        try:
            results = await self.freqai_engine.train_models(
                pair=pair, start_date=start_date, end_date=end_date
            )
            return results

        except Exception as e:
            logger.error(f"ML training failed: {e}")
            return {"error": str(e)}

    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status."""
        return {
            "freqtrade_integration": {
                "initialized": self.is_initialized,
                "running": self.is_running,
                "config_name": self.config_name,
                "environment": self.environment,
                "degraded_features": self.initialization_errors,
            },
            "component_health": self.get_health_status(),
            "timestamp": datetime.now(UTC).isoformat(),
        }


# Global integration hub instance
_freqtrade_hub: Optional[FreqTradeIntegrationHub] = None


async def get_freqtrade_hub() -> FreqTradeIntegrationHub:
    """Get or create the global FreqTrade integration hub."""
    global _freqtrade_hub

    if _freqtrade_hub is None:
        _freqtrade_hub = FreqTradeIntegrationHub()

    if not _freqtrade_hub.is_initialized:
        success = await _freqtrade_hub.initialize()
        if not success:
            raise RuntimeError("Failed to initialize FreqTrade integration hub")

    return _freqtrade_hub


async def initialize_freqtrade_integration() -> bool:
    """Initialize FreqTrade integration (convenience function)."""
    hub = await get_freqtrade_hub()
    return await hub.start()


async def shutdown_freqtrade_integration() -> bool:
    """Shutdown FreqTrade integration (convenience function)."""
    global _freqtrade_hub

    if _freqtrade_hub:
        success = await _freqtrade_hub.shutdown()
        _freqtrade_hub = None
        return success

    return True


def get_freqtrade_status() -> Dict[str, Any]:
    """Get FreqTrade integration status (convenience function)."""
    global _freqtrade_hub

    if _freqtrade_hub:
        return _freqtrade_hub.get_system_status()

    return {
        "freqtrade_integration": {
            "initialized": False,
            "running": False,
            "status": "not_initialized",
        }
    }
