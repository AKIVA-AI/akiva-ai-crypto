"""
Strategy Registry - loads strategy definitions and scanner configuration.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Type
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import structlog

from app.config import settings
from app.database import get_supabase

logger = structlog.get_logger()


@dataclass
class StrategyTimeframes:
    fast: str
    medium: str
    slow: str


@dataclass
class StrategyDefinition:
    name: str
    type: str
    description: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    universe: List[str] = field(default_factory=list)
    timeframes: Optional[StrategyTimeframes] = None
    min_confidence: float = 0.6
    max_risk_per_trade: float = 0.01
    expected_holding_minutes: int = 60
    edge_model_inputs: List[str] = field(default_factory=list)
    data_requirements: List[str] = field(default_factory=list)
    venue_routing: List[str] = field(default_factory=list)
    book_type: Optional[str] = None
    book_id: Optional[UUID] = None
    min_edge_bps: Optional[float] = None
    id: UUID = field(default_factory=uuid4)
    strategy_class: Optional[Type[Any]] = None


@dataclass
class ScannerConfig:
    top_k: int = 5
    max_opportunities: int = 50


class StrategyRegistry:
    """Loads strategy definitions from JSON config."""

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or (settings.CONFIG_DIR / "strategies.json")
        self._strategies: Dict[str, StrategyDefinition] = {}
        self._runtime_strategies: Dict[str, StrategyDefinition] = {}
        self._scanner_config = ScannerConfig()

    def load(self) -> None:
        if not self.config_path.exists():
            logger.warning("strategy_config_missing", path=str(self.config_path))
            return

        try:
            with open(self.config_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)

            self._scanner_config = ScannerConfig(**payload.get("scanner", {}))
            self._strategies.clear()

            for raw in payload.get("strategies", []):
                timeframes = None
                if raw.get("timeframes"):
                    timeframes = StrategyTimeframes(**raw["timeframes"])

                strategy_id = raw.get("id")
                if strategy_id:
                    strategy_uuid = UUID(strategy_id)
                else:
                    strategy_uuid = uuid5(NAMESPACE_URL, raw.get("name", "strategy"))

                definition = StrategyDefinition(
                    name=raw.get("name", "unnamed"),
                    type=raw.get("type", "spot"),
                    description=raw.get("description", ""),
                    parameters=raw.get("parameters", {}),
                    enabled=raw.get("enabled", True),
                    universe=raw.get("universe", []),
                    timeframes=timeframes,
                    min_confidence=raw.get("min_confidence", 0.6),
                    max_risk_per_trade=raw.get("max_risk_per_trade", 0.01),
                    expected_holding_minutes=raw.get("expected_holding_minutes", 60),
                    edge_model_inputs=raw.get("edge_model_inputs", []),
                    data_requirements=raw.get("data_requirements", []),
                    venue_routing=raw.get("venue_routing", []),
                    book_type=raw.get("book_type"),
                    book_id=UUID(raw["book_id"]) if raw.get("book_id") else None,
                    min_edge_bps=raw.get("min_edge_bps"),
                    id=strategy_uuid,
                )
                self._strategies[definition.name] = definition

            logger.info("strategy_registry_loaded", count=len(self._strategies))
        except Exception as exc:
            logger.error("strategy_registry_load_failed", error=str(exc))

    def get_enabled_strategies(self) -> List[StrategyDefinition]:
        if not self._strategies:
            self.load()
        combined = list(self._strategies.values()) + list(
            self._runtime_strategies.values()
        )
        return [s for s in combined if s.enabled]

    def get_strategy(self, name: str) -> Optional[StrategyDefinition]:
        if not self._strategies:
            self.load()
        return self._runtime_strategies.get(name) or self._strategies.get(name)

    def list_strategies(
        self,
        include_config: bool = True,
        include_runtime: bool = True,
    ) -> List[StrategyDefinition]:
        """List strategies from config and/or runtime registry."""
        if include_config and not self._strategies:
            self.load()
        combined: Dict[str, StrategyDefinition] = {}
        if include_config:
            combined.update(self._strategies)
        if include_runtime:
            combined.update(self._runtime_strategies)
        return list(combined.values())

    def register_strategy(
        self,
        strategy_class: Type[Any],
        name: str,
        description: str = "",
        parameters: Optional[Dict[str, Any]] = None,
        overwrite: bool = False,
        persist: bool = True,
    ) -> StrategyDefinition:
        """
        Register a strategy for execution.

        Args:
            strategy_class: Strategy class to register.
            name: Unique strategy name.
            description: Strategy description.
            parameters: Parameter definitions.
            overwrite: Allow overwriting existing registration.
            persist: Persist strategy to Supabase.
        """
        if not name:
            raise ValueError("Strategy name is required")
        if name in self._runtime_strategies and not overwrite:
            raise ValueError(f"Strategy '{name}' is already registered")

        definition = StrategyDefinition(
            name=name,
            type="execution",
            description=description,
            parameters=parameters or {},
            enabled=True,
            strategy_class=strategy_class,
        )
        self._runtime_strategies[name] = definition

        if persist:
            self._persist_strategy(definition)

        return definition

    def clear(self) -> None:
        """Clear cached strategies (useful for tests)."""
        self._runtime_strategies.clear()

    def _persist_strategy(self, definition: StrategyDefinition) -> None:
        try:
            supabase = get_supabase()
            supabase.table("strategies").insert(
                {
                    "name": definition.name,
                    "description": definition.description,
                    "parameters": definition.parameters,
                    "strategy_type": definition.type,
                    "enabled": definition.enabled,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.warning("strategy_registry_persist_failed", error=str(exc))

    @property
    def scanner_config(self) -> ScannerConfig:
        if not self._strategies:
            self.load()
        return self._scanner_config


strategy_registry = StrategyRegistry()
