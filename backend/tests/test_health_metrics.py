"""
Tests for health check and metrics endpoints.

Sprint 0 - Dim 9 (Observability) hardening: metrics, Prometheus export, staleness detection.
"""

import time

import pytest
from app.api.health import (
    HEARTBEAT_STALE_SECONDS,
    _agent_heartbeats,
    _order_count_by_side,
    _percentile,
    _pnl_total,
    _request_count,
    _trade_count,
    _trade_errors,
    _trade_latencies,
    get_stale_agents,
    get_uptime_seconds,
    increment_request_count,
    record_order,
    record_pnl,
    record_trade_error,
    record_trade_latency,
    update_agent_heartbeat,
)


class TestMetricsRecording:
    """Test that metrics recording functions work correctly."""

    def test_record_trade_latency(self):
        """Trade latency should be appended to the list."""
        initial_len = len(_trade_latencies)
        record_trade_latency(42.5)
        assert len(_trade_latencies) == initial_len + 1
        assert _trade_latencies[-1] == 42.5

    def test_record_trade_error(self):
        """Trade error count should increment."""
        import app.api.health as health_mod

        before = health_mod._trade_errors
        record_trade_error()
        assert health_mod._trade_errors == before + 1

    def test_record_order_buy(self):
        """Buy order count should increment."""
        before = _order_count_by_side["buy"]
        record_order("buy")
        assert _order_count_by_side["buy"] == before + 1

    def test_record_order_sell(self):
        """Sell order count should increment."""
        before = _order_count_by_side["sell"]
        record_order("sell")
        assert _order_count_by_side["sell"] == before + 1

    def test_record_order_invalid_side_ignored(self):
        """Invalid order side should be silently ignored."""
        record_order("invalid")  # Should not raise

    def test_record_pnl(self):
        """PnL should accumulate."""
        import app.api.health as health_mod

        before = health_mod._pnl_total
        record_pnl(100.0)
        record_pnl(-30.0)
        assert health_mod._pnl_total == before + 70.0


class TestAgentStaleness:
    """Test agent heartbeat staleness detection."""

    def test_fresh_agent_not_stale(self):
        """Agent with recent heartbeat should not be stale."""
        update_agent_heartbeat("agent-fresh")
        stale = get_stale_agents()
        assert "agent-fresh" not in stale

    def test_stale_agent_detected(self):
        """Agent with old heartbeat should be detected as stale."""
        # Manually set heartbeat to past
        _agent_heartbeats["agent-old"] = time.time() - HEARTBEAT_STALE_SECONDS - 10
        stale = get_stale_agents()
        assert "agent-old" in stale

    def test_heartbeat_update_clears_staleness(self):
        """Updating heartbeat should clear staleness."""
        _agent_heartbeats["agent-revived"] = time.time() - HEARTBEAT_STALE_SECONDS - 10
        assert "agent-revived" in get_stale_agents()

        update_agent_heartbeat("agent-revived")
        assert "agent-revived" not in get_stale_agents()


class TestPercentile:
    """Test percentile calculation helper."""

    def test_empty_data_returns_zero(self):
        """Empty data should return 0."""
        assert _percentile([], 50) == 0.0

    def test_single_value(self):
        """Single value should be returned for any percentile."""
        assert _percentile([42.0], 50) == 42.0
        assert _percentile([42.0], 99) == 42.0

    def test_p50_median(self):
        """P50 should return approximate median."""
        data = [10, 20, 30, 40, 50]
        result = _percentile(data, 50)
        assert result == 30  # Middle value

    def test_p99_high(self):
        """P99 should return near-maximum value."""
        data = list(range(1, 101))  # 1 to 100
        result = _percentile(data, 99)
        assert result >= 99


class TestUptime:
    """Test uptime tracking."""

    def test_uptime_is_positive(self):
        """Uptime should always be positive."""
        assert get_uptime_seconds() > 0
