"""
Authority adapter — maps trading agent roles to AuthorityBoundary contracts.

Agent hierarchy:
  META-DECISION  → FULL_ACCESS + REQUIRE_APPROVAL  (supreme veto authority)
  Execution      → WORKSPACE_WRITE (bounded by position limits)
  Risk           → WORKSPACE_WRITE (can block / approve trades)
  Capital Alloc  → WORKSPACE_WRITE (allocates capital, modifies budgets)
  Signal         → READ_ONLY  (proposes intents only, never executes)
  Freqtrade Sig  → READ_ONLY  (external signal generator, read only)
  Arbitrage      → WORKSPACE_WRITE (can submit arb orders)
  Unknown        → READ_ONLY + DENY  (fail-closed for unregistered agents)
"""

from __future__ import annotations

import logging

try:
    from akiva_execution_contracts import (
        ApprovalPolicy,
        AuthorityBoundary,
        PermissionScope,
    )
    _HAS_CONTRACTS = True
except ImportError:  # pragma: no cover
    _HAS_CONTRACTS = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent-type classification
# ---------------------------------------------------------------------------

# Prefix → (scope, approval_policy)
_AGENT_TYPE_RULES: dict[str, tuple[str, str]] = {
    "meta-decision": ("full_access",      "require_approval"),
    "execution":     ("workspace_write",  "auto"),
    "risk":          ("workspace_write",  "auto"),
    "capital-allocation": ("workspace_write", "auto"),
    "arbitrage":     ("workspace_write",  "auto"),
    "signal":        ("read_only",        "auto"),
    "freqtrade-signal": ("read_only",     "auto"),
    "strategy-lifecycle": ("workspace_write", "auto"),
}

# Per-agent-type metadata (e.g., position limits for execution agents)
_AGENT_METADATA: dict[str, dict] = {
    "execution": {
        "position_limit_usd": 100_000,
        "description": "Order routing agent bounded by position limits",
    },
    "meta-decision": {
        "position_limit_usd": 0,  # meta-decision does not trade
        "description": "Supreme authority with veto power",
    },
    "risk": {
        "position_limit_usd": 0,
        "description": "Risk validation agent",
    },
    "capital-allocation": {
        "position_limit_usd": 500_000,
        "description": "Capital distribution agent",
    },
    "signal": {
        "position_limit_usd": 0,
        "description": "Signal-only agent — no execution authority",
    },
    "freqtrade-signal": {
        "position_limit_usd": 0,
        "description": "FreqTrade signal generator — read only",
    },
    "arbitrage": {
        "position_limit_usd": 50_000,
        "description": "Arbitrage execution agent",
    },
    "strategy-lifecycle": {
        "position_limit_usd": 0,
        "description": "Strategy lifecycle management agent",
    },
}

_DENY_BOUNDARY: "AuthorityBoundary | None" = None


def _deny_boundary() -> "AuthorityBoundary":
    global _DENY_BOUNDARY
    if _DENY_BOUNDARY is None:
        _DENY_BOUNDARY = AuthorityBoundary(
            scope=PermissionScope.READ_ONLY,
            approval=ApprovalPolicy.DENY,
        )
    return _DENY_BOUNDARY


def _agent_type_from_id(agent_id: str) -> str:
    """
    Derive the agent type from the agent ID.

    Convention: agent IDs follow the pattern ``<type>-agent-<N>`` or
    ``<type>-agent`` (e.g., ``execution-agent-01``, ``meta-decision-agent-01``).
    """
    lower = agent_id.lower()
    for prefix in _AGENT_TYPE_RULES:
        if lower.startswith(prefix):
            return prefix
    return "unknown"


class AuthorityAdapter:
    """
    Maps trading agent IDs (and types) to AuthorityBoundary contracts.

    Usage::

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("execution-agent-01")
        if boundary.is_denied():
            raise PermissionError(...)
    """

    def get_boundary(self, agent_id: str) -> "AuthorityBoundary":
        """
        Return the AuthorityBoundary for the given agent ID.

        Unrecognised agents get READ_ONLY + DENY (fail-closed).
        """
        agent_type = _agent_type_from_id(agent_id)
        return self.get_boundary_for_type(agent_type)

    def get_boundary_for_type(self, agent_type: str) -> "AuthorityBoundary":
        """
        Return the AuthorityBoundary for an agent type string.

        Accepts the same type prefixes as :data:`_AGENT_TYPE_RULES`.
        """
        rule = _AGENT_TYPE_RULES.get(agent_type)
        if rule is None:
            logger.warning(
                "AuthorityAdapter: unrecognised agent type %r — denying",
                agent_type,
            )
            return _deny_boundary()

        scope_str, approval_str = rule
        return AuthorityBoundary(
            scope=PermissionScope(scope_str),
            approval=ApprovalPolicy(approval_str),
        )

    def get_agent_metadata(self, agent_id: str) -> dict:
        """
        Return per-agent-type metadata (position limits, description, etc.).
        """
        agent_type = _agent_type_from_id(agent_id)
        return dict(_AGENT_METADATA.get(agent_type, {}))
