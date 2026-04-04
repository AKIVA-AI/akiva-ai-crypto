"""
Risk Limits Management System

Enterprise risk limit controls:
- Position limits (per asset, per strategy)
- Loss limits (daily, weekly, monthly)
- Drawdown limits
- Exposure limits
- Velocity limits (trade frequency)
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class LimitType(str, Enum):
    """Types of risk limits."""

    POSITION = "position"
    LOSS = "loss"
    DRAWDOWN = "drawdown"
    EXPOSURE = "exposure"
    VELOCITY = "velocity"
    LEVERAGE = "leverage"


class LimitPeriod(str, Enum):
    """Time periods for limits."""

    TRADE = "trade"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    ROLLING = "rolling"


@dataclass
class RiskLimit:
    """A risk limit definition."""

    limit_id: str
    limit_type: LimitType
    period: LimitPeriod
    max_value: float
    current_value: float = 0
    enabled: bool = True
    breach_action: str = "block"  # block, warn, alert
    last_reset: datetime = field(default_factory=lambda: datetime.now(UTC))


class RiskLimitsManager:
    """
    Risk limits management and enforcement.

    Features:
    - Real-time limit monitoring
    - Automatic limit resets
    - Breach detection and alerting
    - Multi-level limits (user, strategy, portfolio)
    """

    def __init__(self):
        self._limits: Dict[str, RiskLimit] = {}
        self._user_limits: Dict[str, Dict[str, RiskLimit]] = {}
        self._strategy_limits: Dict[str, Dict[str, RiskLimit]] = {}
        self._breaches: list = []

        # Initialize default limits
        self._init_default_limits()

    def _init_default_limits(self):
        """Initialize default risk limits."""
        # Daily loss limit
        self.add_limit(
            RiskLimit(
                limit_id="daily_loss",
                limit_type=LimitType.LOSS,
                period=LimitPeriod.DAILY,
                max_value=50000,  # $50k daily loss limit
                breach_action="block",
            )
        )

        # Maximum drawdown
        self.add_limit(
            RiskLimit(
                limit_id="max_drawdown",
                limit_type=LimitType.DRAWDOWN,
                period=LimitPeriod.ROLLING,
                max_value=15.0,  # 15% max drawdown
                breach_action="block",
            )
        )

        # Maximum leverage
        self.add_limit(
            RiskLimit(
                limit_id="max_leverage",
                limit_type=LimitType.LEVERAGE,
                period=LimitPeriod.TRADE,
                max_value=3.0,  # 3x max leverage
                breach_action="block",
            )
        )

        # Trade velocity (trades per minute)
        self.add_limit(
            RiskLimit(
                limit_id="trade_velocity",
                limit_type=LimitType.VELOCITY,
                period=LimitPeriod.ROLLING,
                max_value=10,  # 10 trades per minute
                breach_action="warn",
            )
        )

        # Maximum single position
        self.add_limit(
            RiskLimit(
                limit_id="max_position",
                limit_type=LimitType.POSITION,
                period=LimitPeriod.TRADE,
                max_value=100000,  # $100k max position
                breach_action="block",
            )
        )

    def add_limit(self, limit: RiskLimit):
        """Add a risk limit."""
        self._limits[limit.limit_id] = limit
        logger.info(f"Added risk limit: {limit.limit_id}")

    def update_limit(self, limit_id: str, max_value: float):
        """Update a limit's max value."""
        if limit_id in self._limits:
            self._limits[limit_id].max_value = max_value

    def check_limit(
        self, limit_id: str, value: float, user_id: Optional[str] = None
    ) -> tuple[bool, str]:
        """
        Check if a value is within limit.

        Returns:
            (within_limit, message)
        """
        limit = self._limits.get(limit_id)
        if not limit or not limit.enabled:
            return True, "OK"

        if value > limit.max_value:
            message = f"Limit breach: {limit_id} ({value:.2f} > {limit.max_value:.2f})"
            self._record_breach(limit, value, user_id)

            if limit.breach_action == "block":
                return False, message
            else:
                logger.warning(message)
                return True, message

        return True, "OK"

    def _record_breach(self, limit: RiskLimit, value: float, user_id: Optional[str]):
        """Record a limit breach."""
        breach = {
            "limit_id": limit.limit_id,
            "limit_type": limit.limit_type.value,
            "max_value": limit.max_value,
            "actual_value": value,
            "user_id": user_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "action": limit.breach_action,
        }
        self._breaches.append(breach)
        logger.warning(f"Risk limit breach: {breach}")

    def get_limit_status(self) -> Dict[str, Any]:
        """Get status of all limits."""
        return {
            limit_id: {
                "type": limit.limit_type.value,
                "max": limit.max_value,
                "current": limit.current_value,
                "utilization": (limit.current_value / limit.max_value * 100)
                if limit.max_value > 0
                else 0,
                "enabled": limit.enabled,
            }
            for limit_id, limit in self._limits.items()
        }

    def get_recent_breaches(self, hours: int = 24) -> list:
        """Get recent limit breaches."""
        cutoff = datetime.now(UTC) - timedelta(hours=hours)
        return [
            b for b in self._breaches if datetime.fromisoformat(b["timestamp"]) > cutoff
        ]


# Global risk limits manager
risk_limits_manager = RiskLimitsManager()
