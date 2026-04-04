"""
Tests for enterprise features: compliance, audit, risk limits (D19/D7).
"""

import pytest
from app.enterprise.audit import AuditCategory, AuditEvent, AuditLogger, AuditSeverity
from app.enterprise.compliance import (
    ComplianceManager,
    ComplianceRule,
    ComplianceRuleType,
)


class TestComplianceCheckTrade:
    def setup_method(self):
        self.cm = ComplianceManager()

    def test_normal_trade_allowed(self):
        ok, violations = self.cm.check_trade("BTC", "buy", 1.0, 50_000)
        assert ok is True
        assert len(violations) == 0

    def test_restricted_asset_blocked(self):
        self.cm.restrict_asset("XRP", "regulatory")
        ok, violations = self.cm.check_trade("XRP", "buy", 100, 0.5)
        assert ok is False
        assert any("restricted" in v for v in violations)

    def test_unrestrict_asset(self):
        self.cm.restrict_asset("XRP")
        self.cm.unrestrict_asset("XRP")
        ok, _ = self.cm.check_trade("XRP", "buy", 100, 0.5)
        assert ok is True

    def test_position_limit_enforced(self):
        self.cm.set_position_limit("ETH", 100_000)
        ok, violations = self.cm.check_trade(
            "ETH", "buy", 100, 2_000, current_position=0
        )
        # 100 * 2000 = $200k > $100k limit
        assert ok is False
        assert any("Position limit" in v for v in violations)

    def test_concentration_warning(self):
        ok, violations = self.cm.check_trade(
            "BTC", "buy", 1, 50_000, portfolio_value=100_000
        )
        # 50% concentration > 30% default
        assert len(violations) > 0
        assert any("Concentration" in v for v in violations)

    def test_custom_rule(self):
        self.cm.add_rule(
            ComplianceRule(
                rule_id="test_rule",
                rule_type=ComplianceRuleType.ASSET_RESTRICTION,
                name="Test",
                description="Test rule",
                parameters={},
            )
        )
        assert "test_rule" in self.cm._rules
        self.cm.remove_rule("test_rule")
        assert "test_rule" not in self.cm._rules


class TestAuditLogger:
    @pytest.mark.asyncio
    async def test_log_event(self):
        logger = AuditLogger(buffer_size=10)
        event = AuditEvent(
            category=AuditCategory.TRADING,
            action="order_placed",
            user_id="user-1",
        )
        await logger.log(event)
        assert logger._stats["events_logged"] == 1
        assert len(logger._buffer) == 1

    @pytest.mark.asyncio
    async def test_log_action_convenience(self):
        logger = AuditLogger()
        await logger.log_action(
            category=AuditCategory.SECURITY,
            action="login",
            user_id="user-1",
            success=True,
        )
        assert logger._stats["events_logged"] == 1

    @pytest.mark.asyncio
    async def test_buffer_flush(self):
        logger = AuditLogger(buffer_size=2)
        await logger.log(AuditEvent(action="a1"))
        await logger.log(AuditEvent(action="a2"))
        # Buffer should auto-flush at size 2
        assert logger._stats["events_flushed"] == 2
        assert len(logger._buffer) == 0

    @pytest.mark.asyncio
    async def test_log_trade(self):
        logger = AuditLogger()
        await logger.log_trade(
            action="order_filled",
            user_id="trader-1",
            trade_id="trade-123",
            details={"symbol": "BTC", "qty": 1},
        )
        assert logger._buffer[0].category == AuditCategory.TRADING

    @pytest.mark.asyncio
    async def test_log_risk_event(self):
        logger = AuditLogger()
        await logger.log_risk_event(
            action="circuit_breaker_activated",
            user_id=None,
            details={"reason": "daily loss limit"},
            severity=AuditSeverity.CRITICAL,
        )
        assert logger._buffer[0].severity == AuditSeverity.CRITICAL

    @pytest.mark.asyncio
    async def test_log_security_event(self):
        logger = AuditLogger()
        await logger.log_security_event(
            action="login_failed",
            user_id="attacker",
            details={"ip": "1.2.3.4"},
            success=False,
            ip_address="1.2.3.4",
        )
        assert logger._buffer[0].severity == AuditSeverity.WARNING

    @pytest.mark.asyncio
    async def test_get_stats(self):
        logger = AuditLogger()
        stats = logger.get_stats()
        assert stats["events_logged"] == 0
        assert stats["running"] is False

    @pytest.mark.asyncio
    async def test_start_stop(self):
        logger = AuditLogger(flush_interval=100)
        await logger.start()
        assert logger._running is True
        await logger.log(AuditEvent(action="test"))
        await logger.stop()
        assert logger._running is False
        assert logger._stats["events_flushed"] == 1

    def test_audit_event_to_dict(self):
        event = AuditEvent(
            category=AuditCategory.COMPLIANCE,
            action="report_generated",
            severity=AuditSeverity.INFO,
        )
        d = event.to_dict()
        assert d["category"] == "compliance"
        assert d["severity"] == "info"

    def test_audit_event_to_json(self):
        event = AuditEvent(action="test")
        j = event.to_json()
        assert '"action": "test"' in j
