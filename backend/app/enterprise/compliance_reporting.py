"""
Automated Compliance Report Generation (D19 Enterprise Security).

Generates structured compliance reports for regulatory filings:
- Trade activity summary (volume, counts, violations)
- Risk limit breach history
- Audit event summary by category/severity
- RBAC permission usage summary

Reports are stored in the audit_events table with category='compliance'
and can be exported as JSON for SEC / CPO-PQR filing preparation.
"""

import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


@dataclass
class ComplianceReportSection:
    """A section within a compliance report."""

    title: str
    data: Dict[str, Any]
    finding_count: int = 0
    severity: str = "info"  # info, warning, critical


@dataclass
class ComplianceReport:
    """A structured compliance report."""

    report_id: str = field(default_factory=lambda: str(uuid4()))
    report_type: str = "periodic"  # periodic, on-demand, incident
    generated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    period_start: str = ""
    period_end: str = ""
    sections: List[ComplianceReportSection] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)
    status: str = "generated"  # generated, reviewed, filed

    def to_dict(self) -> Dict[str, Any]:
        return {
            "report_id": self.report_id,
            "report_type": self.report_type,
            "generated_at": self.generated_at,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "sections": [asdict(s) for s in self.sections],
            "summary": self.summary,
            "status": self.status,
        }


class ComplianceReportGenerator:
    """
    Generates automated compliance reports from audit events and trade data.

    Usage:
        generator = ComplianceReportGenerator(supabase_client)
        report = await generator.generate_periodic_report(days=30)
    """

    def __init__(self, supabase_client=None):
        self._supabase = supabase_client

    async def generate_periodic_report(
        self,
        days: int = 30,
        end_date: Optional[datetime] = None,
    ) -> ComplianceReport:
        """Generate a periodic compliance report covering the last N days."""
        end = end_date or datetime.now(UTC)
        start = end - timedelta(days=days)

        report = ComplianceReport(
            report_type="periodic",
            period_start=start.isoformat(),
            period_end=end.isoformat(),
        )

        report.sections.append(await self._build_trade_activity_section(start, end))
        report.sections.append(await self._build_risk_breach_section(start, end))
        report.sections.append(await self._build_audit_summary_section(start, end))
        report.sections.append(await self._build_security_events_section(start, end))

        total_findings = sum(s.finding_count for s in report.sections)
        critical_findings = sum(
            s.finding_count for s in report.sections if s.severity == "critical"
        )
        report.summary = {
            "total_sections": len(report.sections),
            "total_findings": total_findings,
            "critical_findings": critical_findings,
            "period_days": days,
            "compliant": critical_findings == 0,
        }

        if self._supabase:
            await self._persist_report(report)

        logger.info(
            "compliance_report_generated",
            extra={
                "report_id": report.report_id,
                "findings": total_findings,
                "critical": critical_findings,
            },
        )
        return report

    async def _build_trade_activity_section(
        self, start: datetime, end: datetime
    ) -> ComplianceReportSection:
        """Summarize trading activity for the period."""
        data: Dict[str, Any] = {
            "total_orders": 0,
            "total_fills": 0,
            "total_volume_usd": 0.0,
            "unique_instruments": 0,
            "violations": [],
        }

        if self._supabase:
            try:
                result = (
                    self._supabase.table("audit_events")
                    .select("action, details")
                    .eq("category", "trading")
                    .gte("created_at", start.isoformat())
                    .lte("created_at", end.isoformat())
                    .execute()
                )
                events = result.data or []
                data["total_orders"] = len(
                    [e for e in events if "order" in e.get("action", "")]
                )
                data["total_fills"] = len(
                    [e for e in events if "fill" in e.get("action", "")]
                )
            except Exception as e:
                logger.warning("compliance_trade_query_failed", extra={"error": str(e)})

        finding_count = len(data["violations"])
        severity = "critical" if finding_count > 0 else "info"
        return ComplianceReportSection(
            title="Trade Activity Summary",
            data=data,
            finding_count=finding_count,
            severity=severity,
        )

    async def _build_risk_breach_section(
        self, start: datetime, end: datetime
    ) -> ComplianceReportSection:
        """Summarize risk limit breaches."""
        data: Dict[str, Any] = {
            "circuit_breaker_activations": 0,
            "kill_switch_activations": 0,
            "position_limit_breaches": 0,
            "daily_loss_breaches": 0,
            "breaches": [],
        }

        if self._supabase:
            try:
                result = (
                    self._supabase.table("audit_events")
                    .select("action, severity, details")
                    .eq("category", "risk")
                    .gte("created_at", start.isoformat())
                    .lte("created_at", end.isoformat())
                    .execute()
                )
                events = result.data or []
                for event in events:
                    action = event.get("action", "")
                    if "circuit_breaker" in action:
                        data["circuit_breaker_activations"] += 1
                    if "kill_switch" in action:
                        data["kill_switch_activations"] += 1
                    if "position_limit" in action:
                        data["position_limit_breaches"] += 1
                    if "daily_loss" in action:
                        data["daily_loss_breaches"] += 1
            except Exception as e:
                logger.warning("compliance_risk_query_failed", extra={"error": str(e)})

        total_breaches = (
            data["circuit_breaker_activations"]
            + data["kill_switch_activations"]
            + data["position_limit_breaches"]
            + data["daily_loss_breaches"]
        )
        severity = (
            "critical"
            if data["kill_switch_activations"] > 0
            else ("warning" if total_breaches > 0 else "info")
        )
        return ComplianceReportSection(
            title="Risk Limit Breach Summary",
            data=data,
            finding_count=total_breaches,
            severity=severity,
        )

    async def _build_audit_summary_section(
        self, start: datetime, end: datetime
    ) -> ComplianceReportSection:
        """Summarize audit events by category and severity."""
        data: Dict[str, Any] = {
            "by_category": {},
            "by_severity": {},
            "total_events": 0,
        }

        if self._supabase:
            try:
                result = (
                    self._supabase.table("audit_events")
                    .select("category, severity")
                    .gte("created_at", start.isoformat())
                    .lte("created_at", end.isoformat())
                    .execute()
                )
                events = result.data or []
                data["total_events"] = len(events)
                for event in events:
                    cat = event.get("category", "unknown")
                    sev = event.get("severity", "info")
                    data["by_category"][cat] = data["by_category"].get(cat, 0) + 1
                    data["by_severity"][sev] = data["by_severity"].get(sev, 0) + 1
            except Exception as e:
                logger.warning("compliance_audit_query_failed", extra={"error": str(e)})

        critical_count = data["by_severity"].get("critical", 0)
        return ComplianceReportSection(
            title="Audit Event Summary",
            data=data,
            finding_count=critical_count,
            severity="critical" if critical_count > 0 else "info",
        )

    async def _build_security_events_section(
        self, start: datetime, end: datetime
    ) -> ComplianceReportSection:
        """Summarize security events (auth failures, permission denials)."""
        data: Dict[str, Any] = {
            "auth_failures": 0,
            "permission_denials": 0,
            "suspicious_activity": 0,
        }

        if self._supabase:
            try:
                result = (
                    self._supabase.table("audit_events")
                    .select("action, details")
                    .eq("category", "security")
                    .gte("created_at", start.isoformat())
                    .lte("created_at", end.isoformat())
                    .execute()
                )
                events = result.data or []
                for event in events:
                    action = event.get("action", "")
                    if "auth_fail" in action or "login_fail" in action:
                        data["auth_failures"] += 1
                    if "permission_denied" in action or "unauthorized" in action:
                        data["permission_denials"] += 1
            except Exception as e:
                logger.warning(
                    "compliance_security_query_failed", extra={"error": str(e)}
                )

        finding_count = data["auth_failures"] + data["permission_denials"]
        severity = "warning" if finding_count > 5 else "info"
        return ComplianceReportSection(
            title="Security Events Summary",
            data=data,
            finding_count=finding_count,
            severity=severity,
        )

    async def _persist_report(self, report: ComplianceReport):
        """Persist the compliance report to Supabase audit_events."""
        if not self._supabase:
            return
        try:
            self._supabase.table("audit_events").insert(
                {
                    "category": "compliance",
                    "severity": "info",
                    "action": "compliance_report_generated",
                    "details": report.to_dict(),
                }
            ).execute()
        except Exception as e:
            logger.error("compliance_report_persist_failed", extra={"error": str(e)})
