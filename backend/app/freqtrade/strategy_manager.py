"""
FreqTrade Strategy Manager - Strategy Lifecycle Management

Manages FreqTrade-compatible strategies:
- Loading and validation (requires IStrategy inheritance)
- Runtime execution
- Performance tracking
- Hot reloading

IMPORTANT: Strategies MUST inherit from freqtrade.strategy.IStrategy
"""

import importlib.util
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Try to import IStrategy for proper validation
try:
    from freqtrade.strategy import IStrategy

    FREQTRADE_AVAILABLE = True
except ImportError:
    FREQTRADE_AVAILABLE = False
    IStrategy = None
    logger.warning("FreqTrade not installed - strategy validation will be limited")


@dataclass
class StrategyInfo:
    """Information about a loaded strategy."""

    name: str
    class_name: str
    file_path: str
    timeframe: str
    minimal_roi: Dict[str, float]
    stoploss: float
    trailing_stop: bool
    can_short: bool
    use_freqai: bool
    loaded_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class StrategyPerformance:
    """Strategy performance metrics."""

    strategy_name: str
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    total_profit_pct: float = 0.0
    win_rate: float = 0.0
    avg_profit_per_trade: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0


class StrategyManager:
    """
    FreqTrade Strategy Manager.

    Manages the full lifecycle of FreqTrade-compatible strategies:
    - Discovery and loading
    - Validation
    - Execution
    - Performance tracking
    """

    def __init__(self, strategy_dir: str = "data/freqtrade/strategies"):
        self.strategy_dir = Path(strategy_dir)
        self._strategies: Dict[str, Any] = {}
        self._strategy_info: Dict[str, StrategyInfo] = {}
        self._performance: Dict[str, StrategyPerformance] = {}

    def discover_strategies(self) -> List[str]:
        """Discover all strategies in the strategy directory."""
        strategies = []

        if not self.strategy_dir.exists():
            self.strategy_dir.mkdir(parents=True, exist_ok=True)
            return strategies

        for file in self.strategy_dir.glob("*.py"):
            if file.stem.startswith("_"):
                continue
            strategies.append(file.stem)

        logger.info(f"Discovered {len(strategies)} strategies")
        return strategies

    def load_strategy(self, strategy_name: str) -> bool:
        """Load a strategy from file."""
        try:
            strategy_file = self.strategy_dir / f"{strategy_name}.py"

            if not strategy_file.exists():
                logger.error(f"Strategy file not found: {strategy_file}")
                return False

            # Dynamic import
            spec = importlib.util.spec_from_file_location(strategy_name, strategy_file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Find strategy class (MUST inherit from IStrategy if FreqTrade available)
            strategy_class = None
            for name, obj in vars(module).items():
                if not isinstance(obj, type):
                    continue

                # If FreqTrade is available, require IStrategy inheritance
                if FREQTRADE_AVAILABLE:
                    if issubclass(obj, IStrategy) and obj is not IStrategy:
                        strategy_class = obj
                        logger.info(f"Found valid IStrategy subclass: {name}")
                        break
                else:
                    # Fallback: check for required attributes
                    if hasattr(obj, "minimal_roi") and hasattr(
                        obj, "populate_indicators"
                    ):
                        strategy_class = obj
                        logger.warning(
                            f"FreqTrade not available - loaded {name} without IStrategy validation"
                        )
                        break

            if not strategy_class:
                logger.error(f"No valid IStrategy subclass found in {strategy_name}")
                logger.error(
                    "Strategies MUST inherit from freqtrade.strategy.IStrategy"
                )
                return False

            # Instantiate and store
            strategy = strategy_class({})
            self._strategies[strategy_name] = strategy

            # Store info
            self._strategy_info[strategy_name] = StrategyInfo(
                name=strategy_name,
                class_name=strategy_class.__name__,
                file_path=str(strategy_file),
                timeframe=getattr(strategy, "timeframe", "5m"),
                minimal_roi=getattr(strategy, "minimal_roi", {}),
                stoploss=getattr(strategy, "stoploss", -0.1),
                trailing_stop=getattr(strategy, "trailing_stop", False),
                can_short=getattr(strategy, "can_short", False),
                use_freqai=hasattr(strategy, "freqai"),
            )

            logger.info(f"Strategy '{strategy_name}' loaded successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to load strategy '{strategy_name}': {e}")
            return False

    def load_all_strategies(self) -> int:
        """Load all discovered strategies."""
        strategies = self.discover_strategies()
        loaded = 0

        for name in strategies:
            if self.load_strategy(name):
                loaded += 1

        return loaded

    def get_strategy(self, name: str) -> Optional[Any]:
        """Get a loaded strategy by name."""
        return self._strategies.get(name)

    def get_strategy_info(self, name: str) -> Optional[StrategyInfo]:
        """Get strategy information."""
        return self._strategy_info.get(name)

    def list_strategies(self) -> List[Dict[str, Any]]:
        """List all loaded strategies with info."""
        return [
            {
                "name": info.name,
                "class_name": info.class_name,
                "timeframe": info.timeframe,
                "stoploss": info.stoploss,
                "trailing_stop": info.trailing_stop,
                "can_short": info.can_short,
                "use_freqai": info.use_freqai,
                "loaded_at": info.loaded_at.isoformat(),
            }
            for info in self._strategy_info.values()
        ]

    def update_performance(
        self, strategy_name: str, trade_result: Dict[str, Any]
    ) -> None:
        """Update strategy performance metrics."""
        if strategy_name not in self._performance:
            self._performance[strategy_name] = StrategyPerformance(strategy_name)

        perf = self._performance[strategy_name]
        profit_pct = trade_result.get("profit_pct", 0)

        perf.total_trades += 1
        perf.total_profit_pct += profit_pct

        if profit_pct > 0:
            perf.winning_trades += 1
        else:
            perf.losing_trades += 1

        if perf.total_trades > 0:
            perf.win_rate = perf.winning_trades / perf.total_trades * 100
            perf.avg_profit_per_trade = perf.total_profit_pct / perf.total_trades

    def get_performance(self, strategy_name: str) -> Optional[StrategyPerformance]:
        """Get strategy performance metrics."""
        return self._performance.get(strategy_name)

    def get_status(self) -> Dict[str, Any]:
        """Get strategy manager status."""
        return {
            "strategy_dir": str(self.strategy_dir),
            "loaded_strategies": len(self._strategies),
            "strategies": self.list_strategies(),
            "freqtrade_available": FREQTRADE_AVAILABLE,
        }

    def validate_strategy(self, strategy_name: str) -> Dict[str, Any]:
        """Validate a strategy for production readiness."""
        validation_results = {
            "strategy_name": strategy_name,
            "valid": False,
            "errors": [],
            "warnings": [],
        }

        strategy = self.get_strategy(strategy_name)
        if not strategy:
            validation_results["errors"].append("Strategy not loaded")
            return validation_results

        # Check required attributes
        required_attrs = [
            "minimal_roi",
            "stoploss",
            "timeframe",
            "populate_indicators",
            "populate_entry_trend",
            "populate_exit_trend",
        ]

        for attr in required_attrs:
            if not hasattr(strategy, attr):
                validation_results["errors"].append(
                    f"Missing required attribute: {attr}"
                )

        # Check IStrategy inheritance
        if FREQTRADE_AVAILABLE:
            if not isinstance(strategy, IStrategy):
                validation_results["errors"].append(
                    "Strategy does not inherit from IStrategy"
                )

        # Warnings for production
        if not hasattr(strategy, "startup_candle_count"):
            validation_results["warnings"].append(
                "Missing startup_candle_count - may cause issues"
            )

        if getattr(strategy, "stoploss", 0) > -0.05:
            validation_results["warnings"].append(
                "Stoploss may be too tight for production"
            )

        if not validation_results["errors"]:
            validation_results["valid"] = True

        return validation_results


def is_freqtrade_available() -> bool:
    """Check if FreqTrade is properly installed."""
    return FREQTRADE_AVAILABLE
