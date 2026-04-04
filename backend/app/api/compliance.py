"""
Compliance API endpoints.

D19 Enterprise Security: Automated compliance report generation and export.
Restricted to admin, cio, and auditor roles.
"""

import os
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.services.compliance_reports import (
    ComplianceReportGenerator,
    ReportType,
)

router = APIRouter(prefix="/compliance", tags=["compliance"])

ALLOWED_ROLES = {"admin", "cio", "auditor"}


def _check_role(request: Request):
    user = getattr(request.state, "user", None)
    if not user or user.get("role") not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Compliance reports require admin, cio, or auditor role",
        )


def _get_generator() -> ComplianceReportGenerator:
    return ComplianceReportGenerator(
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
    )


@router.get("/reports")
async def generate_compliance_report(
    request: Request,
    report_type: ReportType = Query(default=ReportType.FULL_REGULATORY),
    days: int = Query(default=30, ge=1, le=365),
    book_id: str = Query(default=None),
):
    """Generate a compliance report for the specified period."""
    _check_role(request)

    period_end = datetime.now(UTC)
    period_start = period_end - timedelta(days=days)
    user = getattr(request.state, "user", {})

    generator = _get_generator()
    report = await generator.generate_report(
        report_type=report_type,
        period_start=period_start,
        period_end=period_end,
        generated_by=user.get("id", "system"),
        book_id=book_id,
    )

    return generator.export_json(report)


@router.get("/reports/csv")
async def export_compliance_csv(
    request: Request,
    section: str = Query(default="trading_activity"),
    days: int = Query(default=30, ge=1, le=365),
    book_id: str = Query(default=None),
):
    """Export a compliance report section as CSV."""
    _check_role(request)

    period_end = datetime.now(UTC)
    period_start = period_end - timedelta(days=days)
    user = getattr(request.state, "user", {})

    generator = _get_generator()
    report = await generator.generate_report(
        report_type=ReportType.FULL_REGULATORY,
        period_start=period_start,
        period_end=period_end,
        generated_by=user.get("id", "system"),
        book_id=book_id,
    )

    csv_data = generator.export_csv(report, section=section)
    if not csv_data:
        raise HTTPException(status_code=404, detail=f"No data for section: {section}")

    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="compliance_{section}_{days}d.csv"'
        },
    )
