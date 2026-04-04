"""
Risk policy adapters — composable PolicyAdapter implementations.

Three policies map directly to the existing risk-engine checks:

  VaRPolicy          — deny if VaR (Value-at-Risk) exceeds limit
  PositionLimitPolicy — deny if proposed order size exceeds per-agent position limit
  DailyLossPolicy    — deny if cumulative daily loss exceeds limit

All three are designed to be composed inside a PolicyEngine.  The factory
function ``build_risk_engine()`` returns a pre-configured engine using
limits drawn from the app trading configuration.

Import-guard pattern: if akiva_policy_runtime is not installed the module
raises ImportError at import time rather than at call time, so the
orchestrator's try/except guard catches it.
"""

from __future__ import annotations

import logging

try:
    from akiva_policy_runtime import (
        PolicyAdapter,
        PolicyContext,
        PolicyDecision,
        PolicyEngine,
    )
    _HAS_RUNTIME = True
except ImportError as _e:  # pragma: no cover
    raise ImportError(
        "risk_policy requires akiva-policy-runtime.  "
        "Install with: pip install -e ../akiva-ai-framework/packages/policy-runtime"
    ) from _e

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# VaRPolicy
# ---------------------------------------------------------------------------


class VaRPolicy(PolicyAdapter):
    """
    Deny execution when the Value-at-Risk of the proposed order exceeds
    ``max_var_usd``.

    The VaR is read from ``ctx.input_data["var_usd"]``.  If the key is absent
    the policy allows (no data ≠ a breach).
    """

    def __init__(self, max_var_usd: float) -> None:
        self.max_var_usd = max_var_usd

    async def evaluate(self, ctx: PolicyContext) -> PolicyDecision:
        input_data = ctx.input_data or {}
        var_usd = input_data.get("var_usd")

        if var_usd is None:
            return PolicyDecision.allow("VaR not provided — skipping check")

        if var_usd >= self.max_var_usd:
            reason = (
                f"VaR limit breached: {var_usd:,.0f} USD >= "
                f"{self.max_var_usd:,.0f} USD limit"
            )
            logger.warning("VaRPolicy DENY: %s (caller=%s)", reason, ctx.caller_id)
            return PolicyDecision.deny(reason)

        return PolicyDecision.allow(
            f"VaR {var_usd:,.0f} USD within limit {self.max_var_usd:,.0f} USD"
        )


# ---------------------------------------------------------------------------
# PositionLimitPolicy
# ---------------------------------------------------------------------------


class PositionLimitPolicy(PolicyAdapter):
    """
    Deny execution when the proposed order size exceeds ``max_position_usd``.

    The proposed size is read from ``ctx.input_data["order_size_usd"]``.
    Absent key → allow.
    """

    def __init__(self, max_position_usd: float) -> None:
        self.max_position_usd = max_position_usd

    async def evaluate(self, ctx: PolicyContext) -> PolicyDecision:
        input_data = ctx.input_data or {}
        order_size = input_data.get("order_size_usd")

        if order_size is None:
            return PolicyDecision.allow("Order size not provided — skipping check")

        if order_size > self.max_position_usd:
            reason = (
                f"Position limit breached: order size {order_size:,.0f} USD > "
                f"max {self.max_position_usd:,.0f} USD"
            )
            logger.warning("PositionLimitPolicy DENY: %s (caller=%s)", reason, ctx.caller_id)
            return PolicyDecision.deny(reason)

        return PolicyDecision.allow(
            f"Order size {order_size:,.0f} USD within position limit "
            f"{self.max_position_usd:,.0f} USD"
        )


# ---------------------------------------------------------------------------
# DailyLossPolicy
# ---------------------------------------------------------------------------


class DailyLossPolicy(PolicyAdapter):
    """
    Deny execution when the cumulative daily realised loss exceeds
    ``max_daily_loss_usd``.

    The daily loss is read from ``ctx.input_data["daily_loss_usd"]`` as a
    positive number (loss magnitude, not a signed P&L).  Absent key → allow.
    """

    def __init__(self, max_daily_loss_usd: float) -> None:
        self.max_daily_loss_usd = max_daily_loss_usd

    async def evaluate(self, ctx: PolicyContext) -> PolicyDecision:
        input_data = ctx.input_data or {}
        daily_loss = input_data.get("daily_loss_usd")

        if daily_loss is None:
            return PolicyDecision.allow("Daily loss not provided — skipping check")

        if daily_loss > self.max_daily_loss_usd:
            reason = (
                f"Daily loss limit breached: {daily_loss:,.0f} USD > "
                f"{self.max_daily_loss_usd:,.0f} USD limit"
            )
            logger.warning("DailyLossPolicy DENY: %s (caller=%s)", reason, ctx.caller_id)
            return PolicyDecision.deny(reason)

        return PolicyDecision.allow(
            f"Daily loss {daily_loss:,.0f} USD within limit "
            f"{self.max_daily_loss_usd:,.0f} USD"
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def build_risk_engine() -> PolicyEngine:
    """
    Return a PolicyEngine pre-configured with the three core risk policies.

    Limits are sourced from the app's trading configuration when available,
    with conservative fallback defaults.
    """
    try:
        from app.core.trading_config import trading_config

        limits = getattr(trading_config, "risk_limits", {}) or {}
        max_var_usd = float(limits.get("max_var_usd", 50_000))
        max_position_usd = float(limits.get("max_position_size_usd", 100_000))
        max_daily_loss_usd = float(limits.get("max_daily_loss_usd", 10_000))
    except Exception:  # config not available in test context
        max_var_usd = 50_000.0
        max_position_usd = 100_000.0
        max_daily_loss_usd = 10_000.0

    logger.info(
        "build_risk_engine: VaR=%s, position=%s, daily_loss=%s",
        max_var_usd, max_position_usd, max_daily_loss_usd,
    )

    return PolicyEngine([
        VaRPolicy(max_var_usd=max_var_usd),
        PositionLimitPolicy(max_position_usd=max_position_usd),
        DailyLossPolicy(max_daily_loss_usd=max_daily_loss_usd),
    ])
