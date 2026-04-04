"""
Tests for enterprise audit logging system (D19).
"""

import json

import pytest
from app.enterprise.audit import (
    AuditCategory,
    AuditEvent,
    AuditLogger,
    AuditSeverity,
)


class TestAuditEvent:
    def test_to_dict(self):
        event = AuditEvent(
            category=AuditCategory.COMPLIANCE,
            severity=AuditSeverity.WARNING,
            action="rule_violated",
            user_id="user-1",
            resource_type="order",
            resource_id="ord-123",
            details={"rule": "position_limit"},
            success=False,
            error_message="exceeded limit",
        )
        d = event.to_dict()
        assert d["category"] == "compliance"
        assert d["severity"] == "warning"
        assert d["action"] == "rule_violated"
        assert d["user_id"] == "user-1"
        assert d["resource_type"] == "order"
        assert d["resource_id"] == "ord-123"
        assert d["details"] == {"rule": "position_limit"}
        assert d["success"] is False
        assert d["error_message"] == "exceeded limit"
        assert "timestamp" in d  # ISO format string
        assert isinstance(d["timestamp"], str)
        assert "event_id" in d

    def test_to_json(self):
        event = AuditEvent(action="test_action", user_id="u1")
        j = event.to_json()
        parsed = json.loads(j)
        assert parsed["action"] == "test_action"
        assert parsed["user_id"] == "u1"
        assert parsed["category"] == "system"  # default
        assert parsed["severity"] == "info"  # default

    def test_default_values(self):
        event = AuditEvent()
        assert event.category == AuditCategory.SYSTEM
        assert event.severity == AuditSeverity.INFO
        assert event.action == ""
        assert event.user_id is None
        assert event.success is True
        assert event.details == {}
        assert event.event_id  # auto-generated UUID

    def test_event_ids_are_unique(self):
        e1 = AuditEvent()
        e2 = AuditEvent()
        assert e1.event_id != e2.event_id


class TestAuditLoggerLog:
    @pytest.mark.asyncio
    async def test_log_adds_to_buffer(self):
        al = AuditLogger(buffer_size=100)
        event = AuditEvent(action="test")
        await al.log(event)
        assert len(al._buffer) == 1
        assert al._buffer[0] is event
        assert al._stats["events_logged"] == 1

    @pytest.mark.asyncio
    async def test_log_multiple_events(self):
        al = AuditLogger(buffer_size=100)
        for i in range(5):
            await al.log(AuditEvent(action=f"action_{i}"))
        assert len(al._buffer) == 5
        assert al._stats["events_logged"] == 5


class TestAuditLoggerLogAction:
    @pytest.mark.asyncio
    async def test_creates_proper_event(self):
        al = AuditLogger(buffer_size=100)
        await al.log_action(
            category=AuditCategory.TRADING,
            action="order_placed",
            user_id="trader-1",
            resource_type="order",
            resource_id="ord-456",
            details={"symbol": "BTC", "qty": 1.5},
            severity=AuditSeverity.INFO,
            success=True,
            ip_address="10.0.0.1",
        )
        assert len(al._buffer) == 1
        event = al._buffer[0]
        assert event.category == AuditCategory.TRADING
        assert event.action == "order_placed"
        assert event.user_id == "trader-1"
        assert event.resource_type == "order"
        assert event.resource_id == "ord-456"
        assert event.details == {"symbol": "BTC", "qty": 1.5}
        assert event.severity == AuditSeverity.INFO
        assert event.success is True
        assert event.ip_address == "10.0.0.1"

    @pytest.mark.asyncio
    async def test_defaults(self):
        al = AuditLogger(buffer_size=100)
        await al.log_action(
            category=AuditCategory.SYSTEM,
            action="startup",
        )
        event = al._buffer[0]
        assert event.user_id is None
        assert event.details == {}
        assert event.severity == AuditSeverity.INFO
        assert event.success is True
        assert event.error_message is None


class TestAuditLoggerFlush:
    @pytest.mark.asyncio
    async def test_flush_clears_buffer(self):
        al = AuditLogger(buffer_size=100)
        await al.log(AuditEvent(action="a1"))
        await al.log(AuditEvent(action="a2"))
        assert len(al._buffer) == 2

        await al._flush()
        assert len(al._buffer) == 0
        assert al._stats["events_flushed"] == 2

    @pytest.mark.asyncio
    async def test_flush_empty_buffer_is_noop(self):
        al = AuditLogger(buffer_size=100)
        await al._flush()
        assert al._stats["events_flushed"] == 0

    @pytest.mark.asyncio
    async def test_multiple_flushes_accumulate_count(self):
        al = AuditLogger(buffer_size=100)
        await al.log(AuditEvent(action="a1"))
        await al._flush()
        await al.log(AuditEvent(action="a2"))
        await al.log(AuditEvent(action="a3"))
        await al._flush()
        assert al._stats["events_flushed"] == 3


class TestConvenienceMethods:
    @pytest.mark.asyncio
    async def test_log_trade(self):
        al = AuditLogger(buffer_size=100)
        await al.log_trade(
            action="order_filled",
            user_id="trader-1",
            trade_id="trade-789",
            details={"symbol": "ETH", "qty": 10, "price": 3000},
        )
        event = al._buffer[0]
        assert event.category == AuditCategory.TRADING
        assert event.action == "order_filled"
        assert event.user_id == "trader-1"
        assert event.resource_type == "trade"
        assert event.resource_id == "trade-789"
        assert event.details["symbol"] == "ETH"

    @pytest.mark.asyncio
    async def test_log_trade_failure(self):
        al = AuditLogger(buffer_size=100)
        await al.log_trade(
            action="order_rejected",
            user_id="trader-1",
            trade_id="trade-bad",
            details={"reason": "insufficient funds"},
            success=False,
        )
        event = al._buffer[0]
        assert event.success is False

    @pytest.mark.asyncio
    async def test_log_risk_event(self):
        al = AuditLogger(buffer_size=100)
        await al.log_risk_event(
            action="circuit_breaker_triggered",
            user_id=None,
            details={"reason": "daily loss limit", "threshold": 50000},
            severity=AuditSeverity.CRITICAL,
        )
        event = al._buffer[0]
        assert event.category == AuditCategory.RISK
        assert event.severity == AuditSeverity.CRITICAL
        assert event.user_id is None

    @pytest.mark.asyncio
    async def test_log_risk_event_default_severity(self):
        al = AuditLogger(buffer_size=100)
        await al.log_risk_event(
            action="var_warning",
            user_id="risk-mgr",
            details={"var_95": 0.05},
        )
        event = al._buffer[0]
        assert event.severity == AuditSeverity.WARNING

    @pytest.mark.asyncio
    async def test_log_security_event_success(self):
        al = AuditLogger(buffer_size=100)
        await al.log_security_event(
            action="login_success",
            user_id="admin-1",
            details={"method": "2fa"},
            success=True,
            ip_address="192.168.1.1",
        )
        event = al._buffer[0]
        assert event.category == AuditCategory.SECURITY
        assert event.severity == AuditSeverity.INFO  # success -> INFO
        assert event.success is True
        assert event.ip_address == "192.168.1.1"

    @pytest.mark.asyncio
    async def test_log_security_event_failure(self):
        al = AuditLogger(buffer_size=100)
        await al.log_security_event(
            action="login_failed",
            user_id="unknown",
            details={"attempts": 5},
            success=False,
            ip_address="10.0.0.99",
        )
        event = al._buffer[0]
        assert event.severity == AuditSeverity.WARNING  # failure -> WARNING
        assert event.success is False


class TestGetStats:
    def test_returns_correct_counts(self):
        al = AuditLogger(buffer_size=100)
        stats = al.get_stats()
        assert stats["events_logged"] == 0
        assert stats["events_flushed"] == 0
        assert stats["errors"] == 0
        assert stats["buffer_size"] == 0
        assert stats["running"] is False

    @pytest.mark.asyncio
    async def test_stats_after_logging(self):
        al = AuditLogger(buffer_size=100)
        await al.log(AuditEvent(action="a1"))
        await al.log(AuditEvent(action="a2"))
        stats = al.get_stats()
        assert stats["events_logged"] == 2
        assert stats["buffer_size"] == 2
        assert stats["events_flushed"] == 0

    @pytest.mark.asyncio
    async def test_stats_after_flush(self):
        al = AuditLogger(buffer_size=100)
        await al.log(AuditEvent(action="a1"))
        await al._flush()
        stats = al.get_stats()
        assert stats["events_logged"] == 1
        assert stats["events_flushed"] == 1
        assert stats["buffer_size"] == 0


class TestBufferOverflowTriggersFlush:
    @pytest.mark.asyncio
    async def test_auto_flush_at_buffer_size(self):
        al = AuditLogger(buffer_size=3)
        await al.log(AuditEvent(action="a1"))
        await al.log(AuditEvent(action="a2"))
        assert len(al._buffer) == 2  # Not yet flushed

        await al.log(AuditEvent(action="a3"))
        # Buffer hit size 3, should auto-flush
        assert len(al._buffer) == 0
        assert al._stats["events_flushed"] == 3
        assert al._stats["events_logged"] == 3

    @pytest.mark.asyncio
    async def test_buffer_size_one_flushes_every_event(self):
        al = AuditLogger(buffer_size=1)
        await al.log(AuditEvent(action="a1"))
        assert len(al._buffer) == 0
        assert al._stats["events_flushed"] == 1

        await al.log(AuditEvent(action="a2"))
        assert len(al._buffer) == 0
        assert al._stats["events_flushed"] == 2


class TestStartStop:
    @pytest.mark.asyncio
    async def test_start_sets_running(self):
        al = AuditLogger(flush_interval=100)
        await al.start()
        assert al._running is True
        # Clean up
        al._running = False

    @pytest.mark.asyncio
    async def test_stop_flushes_and_stops(self):
        al = AuditLogger(flush_interval=100)
        await al.start()
        await al.log(AuditEvent(action="pending"))
        await al.stop()
        assert al._running is False
        assert len(al._buffer) == 0
        assert al._stats["events_flushed"] == 1
