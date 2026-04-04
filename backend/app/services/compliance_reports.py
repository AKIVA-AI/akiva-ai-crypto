"""
Automated Compliance Report Generation.

D19 Enterprise Security 7→8: Generates structured compliance reports
(trading activity, risk events, violations) for regulatory use.
Supports JSON and CSV export for SEC/CPO-PQR style reporting.
"""

import csv
import io
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger()


class ReportType(str, Enum):
    TRADING_ACTIVITY = "trading_activity"
    RISK_EVENTS = "risk_events"
    COMPLIANCE_VIOLATIONS = "compliance_violations"
    POSITION_SUMMARY = "position_summary"
    FULL_REGULATORY = "full_regulatory"


class ExportFormat(str, Enum):
    JSON = "json"
    CSV = "csv"


@dataclass
class ReportMetadata:
    report_id: str
    report_type: ReportType
    generated_at: str
    period_start: str
    period_end: str
    generated_by: str
    record_count: int
    version: str = "1.0"


@dataclass
class TradingActivityRecord:
    timestamp: str
    order_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    notional_value: float
    venue: str
    book_id: str
    user_id: str
    status: str
    fees: float = 0.0


@dataclass
class RiskEventRecord:
    timestamp: str
    event_type: str
    severity: str
    description: str
    trigger_value: str
    threshold: str
    action_taken: str
    agent_id: Optional[str] = None
    book_id: Optional[str] = None


@dataclass
class ComplianceViolationRecord:
    timestamp: str
    rule_id: str
    rule_name: str
    violation_type: str
    severity: str
    details: str
    user_id: Optional[str] = None
    action_taken: str = ""
    resolved: bool = False


@dataclass
class PositionSummaryRecord:
    symbol: str
    quantity: float
    avg_entry_price: float
    current_price: float
    unrealized_pnl: float
    realized_pnl: float
    book_id: str
    concentration_pct: float


@dataclass
class ComplianceReport:
    metadata: ReportMetadata
    trading_activity: List[TradingActivityRecord] = field(default_factory=list)
    risk_events: List[RiskEventRecord] = field(default_factory=list)
    violations: List[ComplianceViolationRecord] = field(default_factory=list)
    position_summary: List[PositionSummaryRecord] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)


class ComplianceReportGenerator:
    """
    Generates compliance reports from Supabase data.
    Queries audit_events, orders, positions, and risk tables.
    """

    def __init__(self, supabase_url: str = "", supabase_key: str = ""):
        self._supabase_url = supabase_url
        self._supabase_key = supabase_key

    async def generate_report(
        self,
        report_type: ReportType,
        period_start: datetime,
        period_end: datetime,
        generated_by: str = "system",
        book_id: Optional[str] = None,
    ) -> ComplianceReport:
        """Generate a compliance report for the given period."""
        from uuid import uuid4

        report = ComplianceReport(
            metadata=ReportMetadata(
                report_id=str(uuid4()),
                report_type=report_type,
                generated_at=datetime.now(UTC).isoformat(),
                period_start=period_start.isoformat(),
                period_end=period_end.isoformat(),
                generated_by=generated_by,
                record_count=0,
            )
        )

        if report_type in (ReportType.TRADING_ACTIVITY, ReportType.FULL_REGULATORY):
            report.trading_activity = await self._fetch_trading_activity(
                period_start, period_end, book_id
            )

        if report_type in (ReportType.RISK_EVENTS, ReportType.FULL_REGULATORY):
            report.risk_events = await self._fetch_risk_events(period_start, period_end)

        if report_type in (
            ReportType.COMPLIANCE_VIOLATIONS,
            ReportType.FULL_REGULATORY,
        ):
            report.violations = await self._fetch_violations(period_start, period_end)

        if report_type in (ReportType.POSITION_SUMMARY, ReportType.FULL_REGULATORY):
            report.position_summary = await self._fetch_position_summary(book_id)

        total = (
            len(report.trading_activity)
            + len(report.risk_events)
            + len(report.violations)
            + len(report.position_summary)
        )
        report.metadata.record_count = total

        report.summary = self._compute_summary(report)

        logger.info(
            "compliance_report_generated",
            report_id=report.metadata.report_id,
            report_type=report_type.value,
            record_count=total,
        )

        return report

    async def _fetch_trading_activity(
        self,
        period_start: datetime,
        period_end: datetime,
        book_id: Optional[str] = None,
    ) -> List[TradingActivityRecord]:
        """Fetch trading activity from audit_events table."""
        records: List[TradingActivityRecord] = []
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                query = (
                    f"{self._supabase_url}/rest/v1/audit_events"
                    f"?category=eq.trading"
                    f"&created_at=gte.{period_start.isoformat()}"
                    f"&created_at=lte.{period_end.isoformat()}"
                    f"&order=created_at.asc"
                    f"&limit=10000"
                )
                resp = await client.get(
                    query,
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                    },
                )
                if resp.status_code == 200:
                    for row in resp.json():
                        details = row.get("details", {})
                        records.append(
                            TradingActivityRecord(
                                timestamp=row.get("created_at", ""),
                                order_id=details.get(
                                    "order_id", row.get("resource_id", "")
                                ),
                                symbol=details.get("symbol", ""),
                                side=details.get("side", ""),
                                quantity=float(details.get("quantity", 0)),
                                price=float(details.get("price", 0)),
                                notional_value=float(details.get("notional", 0)),
                                venue=details.get("venue", ""),
                                book_id=details.get("book_id", ""),
                                user_id=row.get("user_id", ""),
                                status=details.get("status", ""),
                                fees=float(details.get("fees", 0)),
                            )
                        )
        except Exception as e:
            logger.error("compliance_trading_fetch_failed", error=str(e))
        return records

    async def _fetch_risk_events(
        self, period_start: datetime, period_end: datetime
    ) -> List[RiskEventRecord]:
        """Fetch risk events from audit_events and circuit_breaker_events."""
        records: List[RiskEventRecord] = []
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                # From audit_events
                query = (
                    f"{self._supabase_url}/rest/v1/audit_events"
                    f"?category=eq.risk"
                    f"&created_at=gte.{period_start.isoformat()}"
                    f"&created_at=lte.{period_end.isoformat()}"
                    f"&order=created_at.asc"
                    f"&limit=5000"
                )
                resp = await client.get(
                    query,
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                    },
                )
                if resp.status_code == 200:
                    for row in resp.json():
                        details = row.get("details", {})
                        records.append(
                            RiskEventRecord(
                                timestamp=row.get("created_at", ""),
                                event_type=row.get("action", ""),
                                severity=row.get("severity", "info"),
                                description=details.get(
                                    "description", row.get("action", "")
                                ),
                                trigger_value=str(details.get("trigger_value", "")),
                                threshold=str(details.get("threshold", "")),
                                action_taken=details.get("action_taken", ""),
                                agent_id=details.get("agent_id"),
                                book_id=details.get("book_id"),
                            )
                        )
        except Exception as e:
            logger.error("compliance_risk_fetch_failed", error=str(e))
        return records

    async def _fetch_violations(
        self, period_start: datetime, period_end: datetime
    ) -> List[ComplianceViolationRecord]:
        """Fetch compliance violations from audit_events."""
        records: List[ComplianceViolationRecord] = []
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                query = (
                    f"{self._supabase_url}/rest/v1/audit_events"
                    f"?category=eq.compliance"
                    f"&created_at=gte.{period_start.isoformat()}"
                    f"&created_at=lte.{period_end.isoformat()}"
                    f"&order=created_at.asc"
                    f"&limit=5000"
                )
                resp = await client.get(
                    query,
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                    },
                )
                if resp.status_code == 200:
                    for row in resp.json():
                        details = row.get("details", {})
                        records.append(
                            ComplianceViolationRecord(
                                timestamp=row.get("created_at", ""),
                                rule_id=details.get("rule_id", ""),
                                rule_name=details.get("rule_name", ""),
                                violation_type=details.get(
                                    "violation_type", row.get("action", "")
                                ),
                                severity=row.get("severity", "warning"),
                                details=str(details),
                                user_id=row.get("user_id"),
                                action_taken=details.get("action_taken", ""),
                                resolved=details.get("resolved", False),
                            )
                        )
        except Exception as e:
            logger.error("compliance_violations_fetch_failed", error=str(e))
        return records

    async def _fetch_position_summary(
        self, book_id: Optional[str] = None
    ) -> List[PositionSummaryRecord]:
        """Fetch current position summary from positions table."""
        records: List[PositionSummaryRecord] = []
        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                query = (
                    f"{self._supabase_url}/rest/v1/positions"
                    f"?status=eq.open"
                    f"&order=symbol.asc"
                    f"&limit=1000"
                )
                if book_id:
                    query += f"&book_id=eq.{book_id}"
                resp = await client.get(
                    query,
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                    },
                )
                if resp.status_code == 200:
                    for row in resp.json():
                        records.append(
                            PositionSummaryRecord(
                                symbol=row.get("symbol", ""),
                                quantity=float(row.get("quantity", 0)),
                                avg_entry_price=float(row.get("avg_entry_price", 0)),
                                current_price=float(row.get("current_price", 0)),
                                unrealized_pnl=float(row.get("unrealized_pnl", 0)),
                                realized_pnl=float(row.get("realized_pnl", 0)),
                                book_id=row.get("book_id", ""),
                                concentration_pct=float(
                                    row.get("concentration_pct", 0)
                                ),
                            )
                        )
        except Exception as e:
            logger.error("compliance_positions_fetch_failed", error=str(e))
        return records

    def _compute_summary(self, report: ComplianceReport) -> Dict[str, Any]:
        """Compute summary statistics for the report."""
        total_volume = sum(r.notional_value for r in report.trading_activity)
        total_fees = sum(r.fees for r in report.trading_activity)
        unique_symbols = {r.symbol for r in report.trading_activity if r.symbol}
        unique_venues = {r.venue for r in report.trading_activity if r.venue}

        critical_risk_events = sum(
            1 for r in report.risk_events if r.severity in ("critical", "error")
        )
        unresolved_violations = sum(1 for v in report.violations if not v.resolved)

        total_unrealized = sum(p.unrealized_pnl for p in report.position_summary)
        total_realized = sum(p.realized_pnl for p in report.position_summary)

        return {
            "total_trades": len(report.trading_activity),
            "total_volume_usd": round(total_volume, 2),
            "total_fees_usd": round(total_fees, 2),
            "unique_symbols_traded": len(unique_symbols),
            "unique_venues_used": len(unique_venues),
            "risk_events_total": len(report.risk_events),
            "risk_events_critical": critical_risk_events,
            "compliance_violations_total": len(report.violations),
            "compliance_violations_unresolved": unresolved_violations,
            "open_positions": len(report.position_summary),
            "total_unrealized_pnl": round(total_unrealized, 2),
            "total_realized_pnl": round(total_realized, 2),
        }

    def export_json(self, report: ComplianceReport) -> Dict[str, Any]:
        """Export report as JSON-serializable dict."""
        return {
            "metadata": asdict(report.metadata),
            "summary": report.summary,
            "trading_activity": [asdict(r) for r in report.trading_activity],
            "risk_events": [asdict(r) for r in report.risk_events],
            "violations": [asdict(r) for r in report.violations],
            "position_summary": [asdict(r) for r in report.position_summary],
        }

    def export_csv(
        self, report: ComplianceReport, section: str = "trading_activity"
    ) -> str:
        """Export a report section as CSV string."""
        output = io.StringIO()

        section_map = {
            "trading_activity": report.trading_activity,
            "risk_events": report.risk_events,
            "violations": report.violations,
            "position_summary": report.position_summary,
        }

        records = section_map.get(section, [])
        if not records:
            return ""

        writer = csv.DictWriter(output, fieldnames=asdict(records[0]).keys())
        writer.writeheader()
        for record in records:
            writer.writerow(asdict(record))

        return output.getvalue()
