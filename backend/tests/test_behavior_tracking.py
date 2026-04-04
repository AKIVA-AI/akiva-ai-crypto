"""
Tests for agent behavior change tracking and drift monitoring (D21).
"""

from app.agents.behavior_tracking import (
    AgentBehaviorTracker,
    BehaviorChange,
    DriftMetrics,
)


class TestBehaviorChangeRecording:
    def test_record_change(self):
        tracker = AgentBehaviorTracker()
        change = tracker.record_change(
            "risk-agent",
            "config",
            "max_leverage",
            "3.0",
            "2.0",
            reason="risk reduction",
        )
        assert change.agent_id == "risk-agent"
        assert change.change_type == "config"
        assert change.version == 1
        assert change.old_value == "3.0"
        assert change.new_value == "2.0"

    def test_version_increments(self):
        tracker = AgentBehaviorTracker()
        tracker.record_change("agent-a", "config", "field1")
        tracker.record_change("agent-a", "model", "field2")
        assert tracker.get_current_version("agent-a") == 2

    def test_versions_per_agent(self):
        tracker = AgentBehaviorTracker()
        tracker.record_change("agent-a", "config", "f1")
        tracker.record_change("agent-b", "config", "f1")
        assert tracker.get_current_version("agent-a") == 1
        assert tracker.get_current_version("agent-b") == 1

    def test_change_history_filtered(self):
        tracker = AgentBehaviorTracker()
        tracker.record_change("agent-a", "config", "f1")
        tracker.record_change("agent-b", "config", "f2")
        tracker.record_change("agent-a", "model", "f3")
        history = tracker.get_change_history("agent-a")
        assert len(history) == 2
        assert all(c.agent_id == "agent-a" for c in history)

    def test_change_history_unfiltered(self):
        tracker = AgentBehaviorTracker()
        tracker.record_change("agent-a", "config", "f1")
        tracker.record_change("agent-b", "config", "f2")
        assert len(tracker.get_change_history()) == 2

    def test_change_to_dict(self):
        change = BehaviorChange(agent_id="test", change_type="config", field_name="x")
        d = change.to_dict()
        assert d["agent_id"] == "test"
        assert "change_id" in d

    def test_untracked_agent_version_zero(self):
        tracker = AgentBehaviorTracker()
        assert tracker.get_current_version("nonexistent") == 0


class TestDriftMonitoring:
    def test_record_decisions(self):
        tracker = AgentBehaviorTracker()
        tracker.record_decision("signal-agent")
        tracker.record_decision("signal-agent", overridden=True)
        metrics = tracker.get_drift_metrics("signal-agent")
        assert metrics.total_decisions == 2
        assert metrics.overrides == 1
        assert metrics.override_rate == 0.5

    def test_fallback_rate(self):
        tracker = AgentBehaviorTracker()
        for _ in range(8):
            tracker.record_decision("exec-agent")
        for _ in range(2):
            tracker.record_decision("exec-agent", fallback=True)
        metrics = tracker.get_drift_metrics("exec-agent")
        assert metrics.fallback_rate == 0.2

    def test_error_rate(self):
        tracker = AgentBehaviorTracker()
        for _ in range(9):
            tracker.record_decision("agent")
        tracker.record_decision("agent", error=True)
        metrics = tracker.get_drift_metrics("agent")
        assert abs(metrics.error_rate - 0.1) < 0.01

    def test_empty_metrics(self):
        tracker = AgentBehaviorTracker()
        metrics = tracker.get_drift_metrics("unknown")
        assert metrics.total_decisions == 0
        assert metrics.override_rate == 0.0

    def test_last_n_window(self):
        tracker = AgentBehaviorTracker()
        for _ in range(50):
            tracker.record_decision("agent")
        for _ in range(50):
            tracker.record_decision("agent", overridden=True)
        # Last 50 are all overridden
        metrics = tracker.get_drift_metrics("agent", last_n=50)
        assert metrics.override_rate == 1.0

    def test_get_all_drift_metrics(self):
        tracker = AgentBehaviorTracker()
        tracker.record_decision("agent-a")
        tracker.record_decision("agent-b", overridden=True)
        all_metrics = tracker.get_all_drift_metrics()
        assert "agent-a" in all_metrics
        assert "agent-b" in all_metrics

    def test_drift_metrics_calculate_rates(self):
        m = DriftMetrics(
            agent_id="test",
            window_start="",
            window_end="",
            total_decisions=100,
            overrides=20,
            fallbacks=10,
            errors=5,
        )
        m.calculate_rates()
        assert m.override_rate == 0.2
        assert m.fallback_rate == 0.1
        assert m.error_rate == 0.05


class TestDriftDetection:
    def test_is_drifting_high_override(self):
        tracker = AgentBehaviorTracker()
        for _ in range(20):
            tracker.record_decision("agent", overridden=True)
        assert tracker.is_drifting("agent", override_threshold=0.5) is True

    def test_not_drifting_normal(self):
        tracker = AgentBehaviorTracker()
        for _ in range(18):
            tracker.record_decision("agent")
        for _ in range(2):
            tracker.record_decision("agent", overridden=True)
        assert tracker.is_drifting("agent", override_threshold=0.5) is False

    def test_not_drifting_insufficient_data(self):
        tracker = AgentBehaviorTracker()
        for _ in range(5):
            tracker.record_decision("agent", overridden=True)
        # Less than 10 decisions — not enough data
        assert tracker.is_drifting("agent") is False

    def test_drifting_high_fallback(self):
        tracker = AgentBehaviorTracker()
        for _ in range(7):
            tracker.record_decision("agent")
        for _ in range(5):
            tracker.record_decision("agent", fallback=True)
        # 5/12 ≈ 0.42 > 0.3 threshold
        assert tracker.is_drifting("agent", fallback_threshold=0.3) is True
