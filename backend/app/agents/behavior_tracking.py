"""
Agent Behavior Change Tracking and Drift Monitoring (D21 Agentic Workspace).

Tracks:
- Agent configuration versions (prompt, model, tool changes)
- Override rates (how often risk overrides signals)
- Fallback rates (how often agents fall back to defaults)
- Behavior drift detection over sliding windows
"""

import logging
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


@dataclass
class BehaviorChange:
    """Records a change to an agent's behavior configuration."""

    change_id: str = field(default_factory=lambda: str(uuid4()))
    agent_id: str = ""
    change_type: str = ""  # config, model, prompt, tool, policy
    field_name: str = ""
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    version: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    reason: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DriftMetrics:
    """Drift metrics for an agent over a time window."""

    agent_id: str
    window_start: str
    window_end: str
    total_decisions: int = 0
    overrides: int = 0  # decisions overridden by risk/meta-decision
    fallbacks: int = 0  # times agent fell back to default behavior
    errors: int = 0
    override_rate: float = 0.0
    fallback_rate: float = 0.0
    error_rate: float = 0.0

    def calculate_rates(self):
        if self.total_decisions > 0:
            self.override_rate = self.overrides / self.total_decisions
            self.fallback_rate = self.fallbacks / self.total_decisions
            self.error_rate = self.errors / self.total_decisions


class AgentBehaviorTracker:
    """
    Tracks agent behavior changes and drift metrics.

    Usage:
        tracker = AgentBehaviorTracker()
        tracker.record_change("risk-agent", "config", "max_leverage", "3.0", "2.0")
        tracker.record_decision("signal-agent", overridden=True)
        metrics = tracker.get_drift_metrics("signal-agent")
    """

    def __init__(self):
        self._changes: List[BehaviorChange] = []
        self._versions: Dict[str, int] = defaultdict(int)
        self._decisions: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    def record_change(
        self,
        agent_id: str,
        change_type: str,
        field_name: str,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        reason: str = "",
    ) -> BehaviorChange:
        """Record a behavior configuration change for an agent."""
        self._versions[agent_id] += 1
        change = BehaviorChange(
            agent_id=agent_id,
            change_type=change_type,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            version=self._versions[agent_id],
            reason=reason,
        )
        self._changes.append(change)
        logger.info(
            "agent_behavior_change",
            extra={
                "agent_id": agent_id,
                "change_type": change_type,
                "field": field_name,
                "version": change.version,
            },
        )
        return change

    def record_decision(
        self,
        agent_id: str,
        overridden: bool = False,
        fallback: bool = False,
        error: bool = False,
    ):
        """Record an agent decision for drift tracking."""
        self._decisions[agent_id].append(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "overridden": overridden,
                "fallback": fallback,
                "error": error,
            }
        )

    def get_drift_metrics(self, agent_id: str, last_n: int = 100) -> DriftMetrics:
        """Get drift metrics for an agent over the last N decisions."""
        decisions = self._decisions.get(agent_id, [])[-last_n:]
        now = datetime.now(UTC).isoformat()
        start = decisions[0]["timestamp"] if decisions else now

        metrics = DriftMetrics(
            agent_id=agent_id,
            window_start=start,
            window_end=now,
            total_decisions=len(decisions),
            overrides=sum(1 for d in decisions if d["overridden"]),
            fallbacks=sum(1 for d in decisions if d["fallback"]),
            errors=sum(1 for d in decisions if d["error"]),
        )
        metrics.calculate_rates()
        return metrics

    def get_change_history(
        self, agent_id: Optional[str] = None
    ) -> List[BehaviorChange]:
        """Get behavior change history, optionally filtered by agent."""
        if agent_id:
            return [c for c in self._changes if c.agent_id == agent_id]
        return list(self._changes)

    def get_current_version(self, agent_id: str) -> int:
        """Get the current behavior version for an agent."""
        return self._versions.get(agent_id, 0)

    def get_all_drift_metrics(self, last_n: int = 100) -> Dict[str, DriftMetrics]:
        """Get drift metrics for all tracked agents."""
        return {
            agent_id: self.get_drift_metrics(agent_id, last_n)
            for agent_id in self._decisions
        }

    def is_drifting(
        self,
        agent_id: str,
        override_threshold: float = 0.5,
        fallback_threshold: float = 0.3,
    ) -> bool:
        """Check if an agent is drifting beyond acceptable thresholds."""
        metrics = self.get_drift_metrics(agent_id)
        if metrics.total_decisions < 10:
            return False  # Not enough data
        return (
            metrics.override_rate > override_threshold
            or metrics.fallback_rate > fallback_threshold
        )


# Global singleton
behavior_tracker = AgentBehaviorTracker()
