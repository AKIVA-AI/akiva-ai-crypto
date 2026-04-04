"""
Tests for automated compliance report generation — services layer (D19).

Tests _compute_summary, export_json, export_csv, and generate_report
using manually constructed records (no Supabase required).
"""

import csv
import io
import json
from datetime import UTC, datetime

import pytest
from app.services.compliance_reports import (
    ComplianceReport,
    ComplianceReportGenerator,
    ComplianceViolationRecord,
    ExportFormat,
    PositionSummaryRecord,
    ReportMetadata,
    ReportType,
    RiskEventRecord,
    TradingActivityRecord,
)

# ---------------------------------------------------------------------------
# Helpers to build test data
# ---------------------------------------------------------------------------


def _make_metadata(**overrides) -> ReportMetadata:
    defaults = dict(
        report_id="rpt-001",
        report_type=ReportType.FULL_REGULATORY,
        generated_at="2026-03-17T00:00:00+00:00",
        period_start="2026-03-01T00:00:00+00:00",
        period_end="2026-03-17T00:00:00+00:00",
        generated_by="test",
        record_count=0,
    )
    defaults.update(overrides)
    return ReportMetadata(**defaults)


def _make_trade(**overrides) -> TradingActivityRecord:
    defaults = dict(
        timestamp="2026-03-10T12:00:00Z",
        order_id="ord-1",
        symbol="BTC",
        side="buy",
        quantity=1.0,
        price=50_000.0,
        notional_value=50_000.0,
        venue="binance",
        book_id="book-1",
        user_id="user-1",
        status="filled",
        fees=25.0,
    )
    defaults.update(overrides)
    return TradingActivityRecord(**defaults)


def _make_risk_event(**overrides) -> RiskEventRecord:
    defaults = dict(
        timestamp="2026-03-10T13:00:00Z",
        event_type="circuit_breaker",
        severity="critical",
        description="Daily loss limit hit",
        trigger_value="52000",
        threshold="50000",
        action_taken="halt_trading",
        agent_id="risk-agent",
        book_id="book-1",
    )
    defaults.update(overrides)
    return RiskEventRecord(**defaults)


def _make_violation(**overrides) -> ComplianceViolationRecord:
    defaults = dict(
        timestamp="2026-03-10T14:00:00Z",
        rule_id="rule-1",
        rule_name="Position Limit",
        violation_type="position_limit",
        severity="warning",
        details="Exceeded 25% concentration",
        user_id="user-1",
        action_taken="alert",
        resolved=False,
    )
    defaults.update(overrides)
    return ComplianceViolationRecord(**defaults)


def _make_position(**overrides) -> PositionSummaryRecord:
    defaults = dict(
        symbol="BTC",
        quantity=2.0,
        avg_entry_price=48_000.0,
        current_price=50_000.0,
        unrealized_pnl=4_000.0,
        realized_pnl=1_000.0,
        book_id="book-1",
        concentration_pct=35.0,
    )
    defaults.update(overrides)
    return PositionSummaryRecord(**defaults)


def _build_report(
    trades=None, risk_events=None, violations=None, positions=None
) -> ComplianceReport:
    """Build a ComplianceReport with supplied records and compute summary."""
    report = ComplianceReport(
        metadata=_make_metadata(),
        trading_activity=trades or [],
        risk_events=risk_events or [],
        violations=violations or [],
        position_summary=positions or [],
    )
    gen = ComplianceReportGenerator()
    report.summary = gen._compute_summary(report)
    total = (
        len(report.trading_activity)
        + len(report.risk_events)
        + len(report.violations)
        + len(report.position_summary)
    )
    report.metadata.record_count = total
    return report


# ---------------------------------------------------------------------------
# Tests for _compute_summary
# ---------------------------------------------------------------------------


class TestComputeSummary:
    def test_empty_report(self):
        report = _build_report()
        s = report.summary
        assert s["total_trades"] == 0
        assert s["total_volume_usd"] == 0.0
        assert s["total_fees_usd"] == 0.0
        assert s["unique_symbols_traded"] == 0
        assert s["risk_events_total"] == 0
        assert s["compliance_violations_total"] == 0
        assert s["open_positions"] == 0
        assert s["total_unrealized_pnl"] == 0.0
        assert s["total_realized_pnl"] == 0.0

    def test_with_trading_data(self):
        trades = [
            _make_trade(symbol="BTC", notional_value=50_000, fees=25, venue="binance"),
            _make_trade(symbol="ETH", notional_value=10_000, fees=10, venue="coinbase"),
            _make_trade(symbol="BTC", notional_value=30_000, fees=15, venue="binance"),
        ]
        report = _build_report(trades=trades)
        s = report.summary
        assert s["total_trades"] == 3
        assert s["total_volume_usd"] == 90_000.0
        assert s["total_fees_usd"] == 50.0
        assert s["unique_symbols_traded"] == 2
        assert s["unique_venues_used"] == 2

    def test_risk_events_critical_count(self):
        events = [
            _make_risk_event(severity="critical"),
            _make_risk_event(severity="error"),
            _make_risk_event(severity="warning"),
            _make_risk_event(severity="info"),
        ]
        report = _build_report(risk_events=events)
        s = report.summary
        assert s["risk_events_total"] == 4
        assert s["risk_events_critical"] == 2  # critical + error

    def test_violations_unresolved_count(self):
        violations = [
            _make_violation(resolved=False),
            _make_violation(resolved=True),
            _make_violation(resolved=False),
        ]
        report = _build_report(violations=violations)
        s = report.summary
        assert s["compliance_violations_total"] == 3
        assert s["compliance_violations_unresolved"] == 2

    def test_position_pnl_summary(self):
        positions = [
            _make_position(unrealized_pnl=4_000, realized_pnl=1_000),
            _make_position(unrealized_pnl=-2_000, realized_pnl=500),
        ]
        report = _build_report(positions=positions)
        s = report.summary
        assert s["open_positions"] == 2
        assert s["total_unrealized_pnl"] == 2_000.0
        assert s["total_realized_pnl"] == 1_500.0

    def test_combined_summary(self):
        report = _build_report(
            trades=[_make_trade()],
            risk_events=[_make_risk_event()],
            violations=[_make_violation()],
            positions=[_make_position()],
        )
        assert report.metadata.record_count == 4
        s = report.summary
        assert s["total_trades"] == 1
        assert s["risk_events_total"] == 1
        assert s["compliance_violations_total"] == 1
        assert s["open_positions"] == 1


# ---------------------------------------------------------------------------
# Tests for export_json
# ---------------------------------------------------------------------------


class TestExportJson:
    def test_produces_correct_structure(self):
        report = _build_report(
            trades=[_make_trade()],
            risk_events=[_make_risk_event()],
            violations=[_make_violation()],
            positions=[_make_position()],
        )
        gen = ComplianceReportGenerator()
        result = gen.export_json(report)

        assert "metadata" in result
        assert "summary" in result
        assert "trading_activity" in result
        assert "risk_events" in result
        assert "violations" in result
        assert "position_summary" in result

        # metadata is a dict with expected keys
        assert result["metadata"]["report_id"] == "rpt-001"
        assert result["metadata"]["report_type"] == ReportType.FULL_REGULATORY

        # Records are dicts
        assert len(result["trading_activity"]) == 1
        assert result["trading_activity"][0]["symbol"] == "BTC"

    def test_json_serializable(self):
        report = _build_report(trades=[_make_trade()])
        gen = ComplianceReportGenerator()
        result = gen.export_json(report)
        # Should not raise
        serialized = json.dumps(result)
        parsed = json.loads(serialized)
        assert parsed["metadata"]["report_id"] == "rpt-001"

    def test_empty_report_json(self):
        report = _build_report()
        gen = ComplianceReportGenerator()
        result = gen.export_json(report)
        assert result["trading_activity"] == []
        assert result["risk_events"] == []
        assert result["violations"] == []
        assert result["position_summary"] == []


# ---------------------------------------------------------------------------
# Tests for export_csv
# ---------------------------------------------------------------------------


class TestExportCsv:
    def test_trading_activity_csv(self):
        report = _build_report(trades=[_make_trade(), _make_trade(symbol="ETH")])
        gen = ComplianceReportGenerator()
        csv_str = gen.export_csv(report, section="trading_activity")

        assert csv_str  # non-empty
        reader = csv.DictReader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == 2
        assert rows[0]["symbol"] == "BTC"
        assert rows[1]["symbol"] == "ETH"
        # Verify all expected columns
        assert "order_id" in reader.fieldnames
        assert "notional_value" in reader.fieldnames
        assert "fees" in reader.fieldnames

    def test_risk_events_csv(self):
        report = _build_report(risk_events=[_make_risk_event()])
        gen = ComplianceReportGenerator()
        csv_str = gen.export_csv(report, section="risk_events")

        reader = csv.DictReader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["event_type"] == "circuit_breaker"
        assert rows[0]["severity"] == "critical"

    def test_violations_csv(self):
        report = _build_report(violations=[_make_violation()])
        gen = ComplianceReportGenerator()
        csv_str = gen.export_csv(report, section="violations")

        reader = csv.DictReader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["rule_id"] == "rule-1"
        assert rows[0]["resolved"] == "False"

    def test_position_summary_csv(self):
        report = _build_report(positions=[_make_position()])
        gen = ComplianceReportGenerator()
        csv_str = gen.export_csv(report, section="position_summary")

        reader = csv.DictReader(io.StringIO(csv_str))
        rows = list(reader)
        assert len(rows) == 1
        assert rows[0]["symbol"] == "BTC"
        assert float(rows[0]["concentration_pct"]) == 35.0

    def test_empty_section_returns_empty_string(self):
        report = _build_report()
        gen = ComplianceReportGenerator()
        assert gen.export_csv(report, section="trading_activity") == ""

    def test_unknown_section_returns_empty_string(self):
        report = _build_report(trades=[_make_trade()])
        gen = ComplianceReportGenerator()
        assert gen.export_csv(report, section="nonexistent") == ""


# ---------------------------------------------------------------------------
# Tests for generate_report (async, mocked fetch methods)
# ---------------------------------------------------------------------------


class TestGenerateReport:
    @pytest.mark.asyncio
    async def test_creates_proper_metadata(self):
        gen = ComplianceReportGenerator()
        start = datetime(2026, 3, 1, tzinfo=UTC)
        end = datetime(2026, 3, 17, tzinfo=UTC)

        report = await gen.generate_report(
            report_type=ReportType.TRADING_ACTIVITY,
            period_start=start,
            period_end=end,
            generated_by="test-user",
        )
        assert report.metadata.report_type == ReportType.TRADING_ACTIVITY
        assert report.metadata.generated_by == "test-user"
        assert report.metadata.period_start == start.isoformat()
        assert report.metadata.period_end == end.isoformat()
        assert report.metadata.report_id  # non-empty UUID
        assert report.metadata.generated_at  # non-empty timestamp
        assert report.metadata.version == "1.0"

    @pytest.mark.asyncio
    async def test_report_has_summary(self):
        gen = ComplianceReportGenerator()
        start = datetime(2026, 3, 1, tzinfo=UTC)
        end = datetime(2026, 3, 17, tzinfo=UTC)

        report = await gen.generate_report(
            report_type=ReportType.FULL_REGULATORY,
            period_start=start,
            period_end=end,
        )
        # Without Supabase, all fetch methods return empty lists
        assert report.summary["total_trades"] == 0
        assert report.summary["risk_events_total"] == 0
        assert report.summary["compliance_violations_total"] == 0
        assert report.summary["open_positions"] == 0
        assert report.metadata.record_count == 0
