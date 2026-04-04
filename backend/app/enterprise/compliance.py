"""
Compliance Management System

Enterprise compliance features:
- Trading restrictions
- Position limits
- Regulatory reporting
- KYC/AML integration hooks
- Compliance rule engine
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class ComplianceRuleType(str, Enum):
    """Types of compliance rules."""

    POSITION_LIMIT = "position_limit"
    TRADING_RESTRICTION = "trading_restriction"
    ASSET_RESTRICTION = "asset_restriction"
    JURISDICTION = "jurisdiction"
    TIME_RESTRICTION = "time_restriction"
    CONCENTRATION = "concentration"


@dataclass
class ComplianceRule:
    """A compliance rule definition."""

    rule_id: str
    rule_type: ComplianceRuleType
    name: str
    description: str
    parameters: Dict[str, Any]
    enabled: bool = True
    severity: str = "warning"  # warning, block, alert


@dataclass
class ComplianceViolation:
    """A compliance violation record."""

    violation_id: str
    rule_id: str
    rule_name: str
    timestamp: datetime
    user_id: Optional[str]
    details: Dict[str, Any]
    severity: str
    action_taken: str


class ComplianceManager:
    """
    Compliance management and rule enforcement.

    Features:
    - Pre-trade compliance checks
    - Position limit monitoring
    - Asset restriction enforcement
    - Violation tracking and reporting
    """

    def __init__(self):
        self._rules: Dict[str, ComplianceRule] = {}
        self._violations: List[ComplianceViolation] = []
        self._restricted_assets: Set[str] = set()
        self._position_limits: Dict[str, float] = {}

        # Initialize default rules
        self._init_default_rules()

    def _init_default_rules(self):
        """Initialize default compliance rules."""
        # Maximum position size per asset
        self.add_rule(
            ComplianceRule(
                rule_id="max_position_size",
                rule_type=ComplianceRuleType.POSITION_LIMIT,
                name="Maximum Position Size",
                description="Limit maximum position size per asset",
                parameters={"max_pct": 25.0},  # 25% of portfolio
                severity="block",
            )
        )

        # Concentration limit
        self.add_rule(
            ComplianceRule(
                rule_id="concentration_limit",
                rule_type=ComplianceRuleType.CONCENTRATION,
                name="Portfolio Concentration Limit",
                description="Prevent over-concentration in single asset",
                parameters={"max_pct": 30.0},
                severity="warning",
            )
        )

        # Trading hours restriction (optional)
        self.add_rule(
            ComplianceRule(
                rule_id="trading_hours",
                rule_type=ComplianceRuleType.TIME_RESTRICTION,
                name="Trading Hours",
                description="Restrict trading to specific hours",
                parameters={"enabled": False},
                enabled=False,
                severity="block",
            )
        )

    def add_rule(self, rule: ComplianceRule):
        """Add a compliance rule."""
        self._rules[rule.rule_id] = rule
        logger.info(f"Added compliance rule: {rule.name}")

    def remove_rule(self, rule_id: str):
        """Remove a compliance rule."""
        if rule_id in self._rules:
            del self._rules[rule_id]

    def restrict_asset(self, symbol: str, reason: str = ""):
        """Add asset to restricted list."""
        self._restricted_assets.add(symbol.upper())
        logger.warning(f"Asset restricted: {symbol} - {reason}")

    def unrestrict_asset(self, symbol: str):
        """Remove asset from restricted list."""
        self._restricted_assets.discard(symbol.upper())

    def set_position_limit(self, symbol: str, max_value: float):
        """Set position limit for an asset."""
        self._position_limits[symbol.upper()] = max_value

    def check_trade(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        user_id: Optional[str] = None,
        current_position: float = 0,
        portfolio_value: float = 0,
    ) -> tuple[bool, List[str]]:
        """
        Check if a trade complies with all rules.

        Returns:
            (allowed, list of violations/warnings)
        """
        violations = []
        blocked = False

        symbol = symbol.upper()
        trade_value = quantity * price

        # Check asset restrictions
        if symbol in self._restricted_assets:
            violations.append(f"Asset {symbol} is restricted")
            blocked = True

        # Check position limits
        if symbol in self._position_limits:
            new_position = current_position + (quantity if side == "buy" else -quantity)
            if abs(new_position * price) > self._position_limits[symbol]:
                violations.append(f"Position limit exceeded for {symbol}")
                blocked = True

        # Check concentration
        if portfolio_value > 0:
            concentration_rule = self._rules.get("concentration_limit")
            if concentration_rule and concentration_rule.enabled:
                max_pct = concentration_rule.parameters.get("max_pct", 30)
                position_pct = (trade_value / portfolio_value) * 100
                if position_pct > max_pct:
                    violations.append(
                        f"Concentration limit: {position_pct:.1f}% > {max_pct}%"
                    )
                    if concentration_rule.severity == "block":
                        blocked = True

        return not blocked, violations
