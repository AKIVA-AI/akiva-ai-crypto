"""
Role-Based Access Control (RBAC) System

Enterprise-grade access control with:
- Hierarchical roles (Admin, CIO, PM, Trader, Analyst, Viewer)
- Granular permissions
- Resource-level access control
- Audit trail integration
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)


class Permission(str, Enum):
    """System permissions."""

    # Trading permissions
    TRADE_VIEW = "trade:view"
    TRADE_CREATE = "trade:create"
    TRADE_APPROVE = "trade:approve"
    TRADE_EXECUTE = "trade:execute"
    TRADE_CANCEL = "trade:cancel"

    # Portfolio permissions
    PORTFOLIO_VIEW = "portfolio:view"
    PORTFOLIO_MANAGE = "portfolio:manage"
    PORTFOLIO_REBALANCE = "portfolio:rebalance"

    # Strategy permissions
    STRATEGY_VIEW = "strategy:view"
    STRATEGY_CREATE = "strategy:create"
    STRATEGY_MODIFY = "strategy:modify"
    STRATEGY_DELETE = "strategy:delete"
    STRATEGY_BACKTEST = "strategy:backtest"

    # Risk permissions
    RISK_VIEW = "risk:view"
    RISK_MODIFY = "risk:modify"
    RISK_OVERRIDE = "risk:override"
    KILL_SWITCH = "risk:kill_switch"

    # Arbitrage permissions
    ARBITRAGE_VIEW = "arbitrage:view"
    ARBITRAGE_EXECUTE = "arbitrage:execute"
    ARBITRAGE_CONFIGURE = "arbitrage:configure"

    # Agent permissions
    AGENT_VIEW = "agent:view"
    AGENT_CONTROL = "agent:control"
    AGENT_CONFIGURE = "agent:configure"

    # Admin permissions
    USER_VIEW = "user:view"
    USER_MANAGE = "user:manage"
    SYSTEM_CONFIGURE = "system:configure"
    AUDIT_VIEW = "audit:view"


@dataclass
class Role:
    """User role with permissions."""

    name: str
    description: str
    permissions: Set[Permission]
    parent_role: Optional[str] = None
    max_trade_size: float = 0
    max_daily_volume: float = 0


# Pre-defined roles with hierarchical permissions
ROLES: Dict[str, Role] = {
    "viewer": Role(
        name="viewer",
        description="Read-only access to dashboards",
        permissions={
            Permission.TRADE_VIEW,
            Permission.PORTFOLIO_VIEW,
            Permission.STRATEGY_VIEW,
            Permission.RISK_VIEW,
            Permission.ARBITRAGE_VIEW,
            Permission.AGENT_VIEW,
        },
        max_trade_size=0,
        max_daily_volume=0,
    ),
    "analyst": Role(
        name="analyst",
        description="View and analyze data, run backtests",
        permissions={
            Permission.TRADE_VIEW,
            Permission.PORTFOLIO_VIEW,
            Permission.STRATEGY_VIEW,
            Permission.STRATEGY_BACKTEST,
            Permission.RISK_VIEW,
            Permission.ARBITRAGE_VIEW,
            Permission.AGENT_VIEW,
        },
        parent_role="viewer",
        max_trade_size=0,
        max_daily_volume=0,
    ),
    "trader": Role(
        name="trader",
        description="Execute trades within limits",
        permissions={
            Permission.TRADE_VIEW,
            Permission.TRADE_CREATE,
            Permission.TRADE_CANCEL,
            Permission.PORTFOLIO_VIEW,
            Permission.STRATEGY_VIEW,
            Permission.STRATEGY_BACKTEST,
            Permission.RISK_VIEW,
            Permission.ARBITRAGE_VIEW,
            Permission.AGENT_VIEW,
        },
        parent_role="analyst",
        max_trade_size=10000,
        max_daily_volume=100000,
    ),
    "portfolio_manager": Role(
        name="portfolio_manager",
        description="Manage portfolios and approve trades",
        permissions={
            Permission.TRADE_VIEW,
            Permission.TRADE_CREATE,
            Permission.TRADE_APPROVE,
            Permission.TRADE_EXECUTE,
            Permission.TRADE_CANCEL,
            Permission.PORTFOLIO_VIEW,
            Permission.PORTFOLIO_MANAGE,
            Permission.PORTFOLIO_REBALANCE,
            Permission.STRATEGY_VIEW,
            Permission.STRATEGY_CREATE,
            Permission.STRATEGY_MODIFY,
            Permission.STRATEGY_BACKTEST,
            Permission.RISK_VIEW,
            Permission.ARBITRAGE_VIEW,
            Permission.ARBITRAGE_EXECUTE,
            Permission.AGENT_VIEW,
            Permission.AGENT_CONTROL,
        },
        parent_role="trader",
        max_trade_size=100000,
        max_daily_volume=1000000,
    ),
    "cio": Role(
        name="cio",
        description="Chief Investment Officer - Full trading authority",
        permissions={
            Permission.TRADE_VIEW,
            Permission.TRADE_CREATE,
            Permission.TRADE_APPROVE,
            Permission.TRADE_EXECUTE,
            Permission.TRADE_CANCEL,
            Permission.PORTFOLIO_VIEW,
            Permission.PORTFOLIO_MANAGE,
            Permission.PORTFOLIO_REBALANCE,
            Permission.STRATEGY_VIEW,
            Permission.STRATEGY_CREATE,
            Permission.STRATEGY_MODIFY,
            Permission.STRATEGY_DELETE,
            Permission.STRATEGY_BACKTEST,
            Permission.RISK_VIEW,
            Permission.RISK_MODIFY,
            Permission.KILL_SWITCH,
            Permission.ARBITRAGE_VIEW,
            Permission.ARBITRAGE_EXECUTE,
            Permission.ARBITRAGE_CONFIGURE,
            Permission.AGENT_VIEW,
            Permission.AGENT_CONTROL,
            Permission.AGENT_CONFIGURE,
            Permission.USER_VIEW,
            Permission.AUDIT_VIEW,
        },
        parent_role="portfolio_manager",
        max_trade_size=1000000,
        max_daily_volume=10000000,
    ),
    "admin": Role(
        name="admin",
        description="System administrator - Full system access",
        permissions=set(Permission),  # All permissions
        parent_role="cio",
        max_trade_size=float("inf"),
        max_daily_volume=float("inf"),
    ),
}


class RBACManager:
    """
    Role-Based Access Control Manager.

    Handles permission checking, role assignment,
    and access control for all system resources.
    """

    def __init__(self):
        self._user_roles: Dict[str, str] = {}
        self._custom_permissions: Dict[str, Set[Permission]] = {}

    def assign_role(self, user_id: str, role_name: str) -> bool:
        """Assign a role to a user."""
        if role_name not in ROLES:
            logger.warning(f"Unknown role: {role_name}")
            return False

        self._user_roles[user_id] = role_name
        logger.info(f"Assigned role '{role_name}' to user '{user_id}'")
        return True

    def get_user_role(self, user_id: str) -> Optional[Role]:
        """Get user's role."""
        role_name = self._user_roles.get(user_id, "viewer")
        return ROLES.get(role_name)

    def has_permission(self, user_id: str, permission: Permission) -> bool:
        """Check if user has a specific permission."""
        role = self.get_user_role(user_id)
        if not role:
            return False

        # Check role permissions
        if permission in role.permissions:
            return True

        # Check custom permissions
        if user_id in self._custom_permissions:
            if permission in self._custom_permissions[user_id]:
                return True

        return False

    def check_trade_limits(
        self, user_id: str, trade_size: float, daily_volume: float = 0
    ) -> tuple[bool, str]:
        """Check if trade is within user's limits."""
        role = self.get_user_role(user_id)
        if not role:
            return False, "No role assigned"

        if trade_size > role.max_trade_size:
            return (
                False,
                f"Trade size ${trade_size:,.2f} exceeds limit ${role.max_trade_size:,.2f}",
            )

        if daily_volume > role.max_daily_volume:
            return (
                False,
                f"Daily volume ${daily_volume:,.2f} exceeds limit ${role.max_daily_volume:,.2f}",
            )

        return True, "OK"

    def grant_permission(self, user_id: str, permission: Permission):
        """Grant additional permission to user."""
        if user_id not in self._custom_permissions:
            self._custom_permissions[user_id] = set()
        self._custom_permissions[user_id].add(permission)

    def revoke_permission(self, user_id: str, permission: Permission):
        """Revoke custom permission from user."""
        if user_id in self._custom_permissions:
            self._custom_permissions[user_id].discard(permission)

    def get_all_permissions(self, user_id: str) -> Set[Permission]:
        """Get all permissions for a user."""
        role = self.get_user_role(user_id)
        permissions = set(role.permissions) if role else set()

        if user_id in self._custom_permissions:
            permissions.update(self._custom_permissions[user_id])

        return permissions


# Global RBAC manager
rbac_manager = RBACManager()
