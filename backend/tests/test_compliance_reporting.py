"""
Tests for automated compliance report generation (D19 Enterprise Security).
"""

import pytest
from app.enterprise.compliance_reporting import (
    ComplianceReport,
    ComplianceReportGenerator,
    ComplianceReportSection,
)


class TestComplianceReportSection:
    def test_section_defaults(self):
        s = ComplianceReportSection(title="Test", data={"key": "val"})
        assert s.finding_count == 0
        assert s.severity == "info"

    def test_section_with_findings(self):
        s = ComplianceReportSection(
            title="Risk", data={}, finding_count=3, severity="critical"
        )
        assert s.finding_count == 3
        assert s.severity == "critical"


class TestComplianceReport:
    def test_report_creation(self):
        r = ComplianceReport(
            report_type="periodic", period_start="2026-01-01", period_end="2026-01-31"
        )
        assert r.report_type == "periodic"
        assert r.status == "generated"
        assert r.report_id  # auto-generated

    def test_report_to_dict(self):
        r = ComplianceReport()
        r.sections.append(ComplianceReportSection(title="Test", data={"a": 1}))
        d = r.to_dict()
        assert "report_id" in d
        assert len(d["sections"]) == 1
        assert d["sections"][0]["title"] == "Test"

    def test_report_summary_fields(self):
        r = ComplianceReport()
        r.summary = {"total_findings": 5, "compliant": False}
        d = r.to_dict()
        assert d["summary"]["total_findings"] == 5
        assert d["summary"]["compliant"] is False


class TestComplianceReportGenerator:
    @pytest.mark.asyncio
    async def test_generate_without_supabase(self):
        """Generate report without DB — all sections should return zero counts."""
        gen = ComplianceReportGenerator(supabase_client=None)
        report = await gen.generate_periodic_report(days=7)

        assert report.report_type == "periodic"
        assert len(report.sections) == 4
        assert report.summary["total_findings"] == 0
        assert report.summary["compliant"] is True

    @pytest.mark.asyncio
    async def test_report_section_titles(self):
        gen = ComplianceReportGenerator(supabase_client=None)
        report = await gen.generate_periodic_report(days=1)
        titles = [s.title for s in report.sections]
        assert "Trade Activity Summary" in titles
        assert "Risk Limit Breach Summary" in titles
        assert "Audit Event Summary" in titles
        assert "Security Events Summary" in titles

    @pytest.mark.asyncio
    async def test_report_period(self):
        gen = ComplianceReportGenerator(supabase_client=None)
        report = await gen.generate_periodic_report(days=30)
        assert report.period_start
        assert report.period_end
        assert report.summary["period_days"] == 30


class TestRBACEnforcement:
    """Tests for RBAC roles and permissions (D19)."""

    def test_viewer_has_read_only(self):
        from app.enterprise.rbac import ROLES, Permission

        viewer = ROLES["viewer"]
        assert Permission.TRADE_VIEW in viewer.permissions
        assert Permission.TRADE_CREATE not in viewer.permissions
        assert Permission.KILL_SWITCH not in viewer.permissions

    def test_trader_can_create_trades(self):
        from app.enterprise.rbac import ROLES, Permission

        trader = ROLES["trader"]
        assert Permission.TRADE_CREATE in trader.permissions
        assert Permission.TRADE_CANCEL in trader.permissions
        assert Permission.STRATEGY_DELETE not in trader.permissions

    def test_admin_has_all_permissions(self):
        from app.enterprise.rbac import ROLES, Permission

        admin = ROLES["admin"]
        for perm in Permission:
            assert perm in admin.permissions

    def test_trade_limits_enforced(self):
        from app.enterprise.rbac import rbac_manager

        rbac_manager.assign_role("test-trader", "trader")
        ok, msg = rbac_manager.check_trade_limits("test-trader", 5000)
        assert ok is True

        ok, msg = rbac_manager.check_trade_limits("test-trader", 50000)
        assert ok is False
        assert "exceeds limit" in msg

    def test_cio_kill_switch_permission(self):
        from app.enterprise.rbac import ROLES, Permission

        cio = ROLES["cio"]
        assert Permission.KILL_SWITCH in cio.permissions
        assert Permission.RISK_MODIFY in cio.permissions

    def test_role_hierarchy_escalation(self):
        """Lower roles should not have higher role permissions."""
        from app.enterprise.rbac import ROLES, Permission

        assert Permission.SYSTEM_CONFIGURE not in ROLES["cio"].permissions
        assert Permission.SYSTEM_CONFIGURE in ROLES["admin"].permissions
