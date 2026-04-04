"""
Evidence adapter — converts trading execution results to EvidenceRecord.

Translates two trading event types into immutable EvidenceRecord objects:

  from_fill()               — order fill (success or failure)
  from_meta_decision_veto() — META-DECISION halted / vetoed a trade intent

EvidenceRecord is frozen (immutable) by design — append-only audit trail.
"""

from __future__ import annotations

import logging
from typing import Any

try:
    from akiva_execution_contracts import EvidenceRecord

    _HAS_CONTRACTS = True
except ImportError as _e:  # pragma: no cover
    raise ImportError(
        "evidence_adapter requires akiva-execution-contracts.  "
        "Install with: pip install -e ../akiva-ai-framework/packages/execution-contracts"
    ) from _e

logger = logging.getLogger(__name__)


class EvidenceAdapter:
    """
    Converts trading execution results into immutable :class:`EvidenceRecord`
    objects suitable for an append-only audit trail.
    """

    def from_fill(
        self,
        fill: dict[str, Any],
        *,
        success: bool,
        error: str | None = None,
        agent_id: str | None = None,
    ) -> EvidenceRecord:
        """
        Build an EvidenceRecord from an order-fill event.

        Parameters
        ----------
        fill:
            The fill dict published on ``AgentChannel.FILLS``.
        success:
            ``True`` if the order was fully or partially filled,
            ``False`` if execution failed.
        error:
            Human-readable error message on failure.
        agent_id:
            The agent that executed the order (for authority evidence).
        """
        outcome = "success" if success else "failure"

        # Input summary: key identification fields
        input_summary: dict[str, Any] = {
            k: fill[k]
            for k in ("order_id", "instrument", "side", "size_usd", "venue")
            if k in fill
        }

        # Output summary: execution result metrics
        output_summary: dict[str, Any] = {
            k: fill[k]
            for k in ("filled_price", "slippage", "fee", "latency_ms")
            if k in fill
        }

        # Authority evidence: agent identity and scope
        authority_evidence: dict[str, Any] = {}
        if agent_id:
            authority_evidence["agent_id"] = agent_id
            try:
                from app.control_plane.authority_adapter import AuthorityAdapter

                adapter = AuthorityAdapter()
                boundary = adapter.get_boundary(agent_id)
                authority_evidence["scope"] = boundary.scope.value
                authority_evidence["approval"] = boundary.approval.value
            except Exception:
                pass

        duration_ms: float | None = fill.get("latency_ms")

        logger.debug(
            "EvidenceAdapter.from_fill: order_id=%s outcome=%s",
            fill.get("order_id"),
            outcome,
        )

        return EvidenceRecord(
            capability_name="execute_order",
            outcome=outcome,
            input_summary=input_summary if input_summary else None,
            output_summary=output_summary if output_summary else None,
            error_detail=error,
            duration_ms=duration_ms,
            authority_evidence=authority_evidence if authority_evidence else None,
            metadata={"raw_fill": fill},
        )

    def from_meta_decision_veto(
        self,
        decision: dict[str, Any],
        *,
        agent_id: str = "meta-decision-agent-01",
    ) -> EvidenceRecord:
        """
        Build an EvidenceRecord from a META-DECISION veto.

        Parameters
        ----------
        decision:
            The MetaDecision dict (``MetaDecision.to_dict()`` output or
            the raw payload published on ``AgentChannel.CONTROL``).
        agent_id:
            The meta-decision agent ID (defaults to the canonical singleton).
        """
        reason_codes = decision.get("reason_codes", [])
        global_state = decision.get("global_state", "unknown")
        strategy = decision.get("strategy", "all")

        input_summary: dict[str, Any] = {
            "global_state": global_state,
            "strategy": strategy,
            "reason_codes": reason_codes,
        }

        authority_evidence: dict[str, Any] = {
            "agent_id": agent_id,
            "scope": "full_access",
            "approval": "require_approval",
            "veto_exercised": True,
        }

        logger.info(
            "EvidenceAdapter.from_meta_decision_veto: state=%s reasons=%s",
            global_state,
            reason_codes,
        )

        return EvidenceRecord(
            capability_name="meta_decision_veto",
            outcome="denied",
            input_summary=input_summary,
            output_summary={"halted": True, "global_state": global_state},
            error_detail=f"Trading halted: {', '.join(reason_codes)}"
            if reason_codes
            else None,
            authority_evidence=authority_evidence,
            metadata={"raw_decision": decision},
        )
