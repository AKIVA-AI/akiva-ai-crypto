"""
Tests for strategy lifecycle management (strategy_lifecycle.py).
"""

from datetime import datetime, timedelta

from app.agents.strategy_lifecycle import (
    StrategyLifecycle,
    StrategyLifecycleManager,
    StrategyLifecycleState,
    StrategyStateTransition,
)


class TestStrategyLifecycleState:
    def test_enum_values(self):
        assert StrategyLifecycleState.ACTIVE == "active"
        assert StrategyLifecycleState.QUARANTINED == "quarantined"
        assert StrategyLifecycleState.DISABLED == "disabled"
        assert StrategyLifecycleState.PAPER_ONLY == "paper_only"


class TestStrategyStateTransition:
    def test_create_transition(self):
        t = StrategyStateTransition(
            from_state=StrategyLifecycleState.ACTIVE,
            to_state=StrategyLifecycleState.QUARANTINED,
            reason="edge_decay",
            triggered_by="automatic",
            timestamp=datetime.utcnow().isoformat(),
        )
        assert t.from_state == StrategyLifecycleState.ACTIVE
        assert t.to_state == StrategyLifecycleState.QUARANTINED


class TestStrategyLifecycle:
    def test_defaults(self):
        sl = StrategyLifecycle(
            strategy_id="test",
            current_state=StrategyLifecycleState.PAPER_ONLY,
            state_entered_at=datetime.utcnow().isoformat(),
        )
        assert sl.edge_decay_pct == 0.0
        assert sl.performance_vs_expectation == 1.0
        assert sl.quarantine_reason is None
        assert sl.transition_history == []

    def test_to_dict(self):
        sl = StrategyLifecycle(
            strategy_id="s1",
            current_state=StrategyLifecycleState.ACTIVE,
            state_entered_at="2025-01-01T00:00:00",
        )
        d = sl.to_dict()
        assert d["strategy_id"] == "s1"
        assert d["current_state"] == "active"
        assert d["transition_count"] == 0


class TestStrategyLifecycleManager:
    def _m(self):
        return StrategyLifecycleManager()

    def test_register_default(self):
        m = self._m()
        m.register_strategy("s1")
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.PAPER_ONLY

    def test_register_custom(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.ACTIVE

    def test_register_dup(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.register_strategy("s1", StrategyLifecycleState.DISABLED)
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.ACTIVE

    def test_get_missing(self):
        assert self._m().get_strategy("x") is None

    def test_can_trade_active(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        assert m.can_trade("s1") is True

    def test_can_trade_paper(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.PAPER_ONLY)
        assert m.can_trade("s1") is False
        assert m.can_trade("s1", is_paper_mode=True) is True

    def test_can_trade_quarantined(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        assert m.can_trade("s1") is False

    def test_can_trade_disabled(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.DISABLED)
        assert m.can_trade("s1") is False

    def test_can_trade_missing(self):
        assert self._m().can_trade("x") is False

    def test_update_metrics(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", edge_decay_pct=0.15)
        assert m.get_strategy("s1").edge_decay_pct == 0.15

    def test_update_metrics_all(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics(
            "s1",
            edge_decay_pct=0.5,
            performance_vs_expectation=0.6,
            current_drawdown_pct=0.12,
            execution_quality=0.85,
        )
        s = m.get_strategy("s1")
        assert s.edge_decay_pct == 0.5
        assert s.execution_quality == 0.85

    def test_update_metrics_missing(self):
        self._m().update_metrics("x", edge_decay_pct=0.5)

    def test_active_quarantine_edge_decay(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", edge_decay_pct=0.35)
        t = m.evaluate_transitions("s1")
        assert t is not None and t.to_state == StrategyLifecycleState.QUARANTINED

    def test_active_quarantine_underperformance(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", performance_vs_expectation=0.5)
        t = m.evaluate_transitions("s1")
        assert t is not None and "underperformance" in t.reason

    def test_active_quarantine_drawdown(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", current_drawdown_pct=0.15)
        t = m.evaluate_transitions("s1")
        assert t is not None and "drawdown" in t.reason

    def test_active_quarantine_execution(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", execution_quality=0.80)
        t = m.evaluate_transitions("s1")
        assert t is not None and "execution_degraded" in t.reason

    def test_active_no_transition(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        assert m.evaluate_transitions("s1") is None

    def test_active_multiple_reasons(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.update_metrics("s1", edge_decay_pct=0.35, current_drawdown_pct=0.15)
        t = m.evaluate_transitions("s1")
        assert "edge_decay" in t.reason and "drawdown" in t.reason

    def test_quarantine_to_disabled(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        m._quarantine_count_30d["s1"] = 3
        t = m.evaluate_transitions("s1")
        assert t.to_state == StrategyLifecycleState.DISABLED

    def test_quarantine_below_limit(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        m._quarantine_count_30d["s1"] = 1
        assert m.evaluate_transitions("s1") is None

    def test_quarantine_to_active_expired(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        s = m.get_strategy("s1")
        s.quarantine_expires_at = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        s.performance_vs_expectation = 1.0
        s.execution_quality = 0.95
        t = m.evaluate_transitions("s1")
        assert t.to_state == StrategyLifecycleState.ACTIVE

    def test_quarantine_not_expired(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        s = m.get_strategy("s1")
        s.quarantine_expires_at = (datetime.utcnow() + timedelta(hours=4)).isoformat()
        assert m.evaluate_transitions("s1") is None

    def test_quarantine_expired_poor_perf(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        s = m.get_strategy("s1")
        s.quarantine_expires_at = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        s.performance_vs_expectation = 0.5
        assert m.evaluate_transitions("s1") is None

    def test_paper_no_transition(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.PAPER_ONLY)
        assert m.evaluate_transitions("s1") is None

    def test_disabled_no_transition(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.DISABLED)
        assert m.evaluate_transitions("s1") is None

    def test_evaluate_missing(self):
        assert self._m().evaluate_transitions("x") is None

    def test_execute_to_quarantined(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        t = StrategyStateTransition(
            from_state=StrategyLifecycleState.ACTIVE,
            to_state=StrategyLifecycleState.QUARANTINED,
            reason="decay",
            triggered_by="automatic",
            timestamp=datetime.utcnow().isoformat(),
        )
        m.execute_transition("s1", t)
        s = m.get_strategy("s1")
        assert s.current_state == StrategyLifecycleState.QUARANTINED
        assert s.quarantine_expires_at is not None
        assert m._quarantine_count_30d["s1"] == 1

    def test_execute_to_active_clears(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.QUARANTINED)
        s = m.get_strategy("s1")
        s.quarantine_reason = "test"
        t = StrategyStateTransition(
            from_state=StrategyLifecycleState.QUARANTINED,
            to_state=StrategyLifecycleState.ACTIVE,
            reason="recovered",
            triggered_by="automatic",
            timestamp=datetime.utcnow().isoformat(),
        )
        m.execute_transition("s1", t)
        s = m.get_strategy("s1")
        assert s.quarantine_reason is None
        assert s.quarantine_expires_at is None

    def test_execute_missing(self):
        m = self._m()
        t = StrategyStateTransition(
            from_state=StrategyLifecycleState.ACTIVE,
            to_state=StrategyLifecycleState.QUARANTINED,
            reason="x",
            triggered_by="auto",
            timestamp=datetime.utcnow().isoformat(),
        )
        m.execute_transition("x", t)

    def test_quarantine_count_increments(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        for _ in range(3):
            t = StrategyStateTransition(
                from_state=StrategyLifecycleState.ACTIVE,
                to_state=StrategyLifecycleState.QUARANTINED,
                reason="t",
                triggered_by="auto",
                timestamp=datetime.utcnow().isoformat(),
            )
            m.execute_transition("s1", t)
        assert m._quarantine_count_30d["s1"] == 3

    def test_manually_disable(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.manually_disable("s1", "user123", "risky")
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.DISABLED

    def test_manually_disable_missing(self):
        self._m().manually_disable("x", "u", "r")

    def test_manually_enable(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.DISABLED)
        m.manually_enable("s1", "user123")
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.PAPER_ONLY

    def test_manually_enable_missing(self):
        self._m().manually_enable("x", "u")

    def test_promote_to_active(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.PAPER_ONLY)
        m.promote_to_active("s1", "admin")
        assert m.get_strategy("s1").current_state == StrategyLifecycleState.ACTIVE

    def test_promote_wrong_state(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.promote_to_active("s1", "admin")
        assert len(m.get_strategy("s1").transition_history) == 0

    def test_promote_missing(self):
        self._m().promote_to_active("x", "admin")

    def test_get_all_states_empty(self):
        assert self._m().get_all_states() == {}

    def test_get_all_states(self):
        m = self._m()
        m.register_strategy("s1", StrategyLifecycleState.ACTIVE)
        m.register_strategy("s2", StrategyLifecycleState.PAPER_ONLY)
        st = m.get_all_states()
        assert st["s1"]["current_state"] == "active"
        assert st["s2"]["current_state"] == "paper_only"
