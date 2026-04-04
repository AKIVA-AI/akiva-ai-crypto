"""
Standardized error handling for the Enterprise Crypto API.

Provides consistent error response format across all endpoints:
    {
        "error": "Human-readable error message",
        "code": "MACHINE_READABLE_CODE",
        "details": { ... } | null
    }

All exception handlers use this format so clients can rely on a single
error schema regardless of which endpoint returned the error.
"""

from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = structlog.get_logger(__name__)


class ErrorResponse(BaseModel):
    """Standard error response model used across all API endpoints."""

    error: str
    code: str
    details: dict[str, Any] | None = None


def _build_error(
    status_code: int,
    error: str,
    code: str,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    """Build a consistent JSONResponse for error cases."""
    body = ErrorResponse(error=error, code=code, details=details)
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(),
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI HTTPException with standard error format."""
    logger.warning(
        "HTTP exception",
        status_code=exc.status_code,
        detail=exc.detail,
        path=request.url.path,
        method=request.method,
    )
    return _build_error(
        status_code=exc.status_code,
        error=str(exc.detail) if exc.detail else "Request failed",
        code=f"HTTP_{exc.status_code}",
        details={"path": request.url.path},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic / FastAPI validation errors with standard error format."""
    errors = exc.errors()
    logger.warning(
        "Validation error",
        error_count=len(errors),
        path=request.url.path,
        method=request.method,
    )
    return _build_error(
        status_code=422,
        error="Request validation failed",
        code="VALIDATION_ERROR",
        details={
            "validation_errors": [
                {
                    "field": " -> ".join(str(loc) for loc in e.get("loc", [])),
                    "message": e.get("msg", ""),
                    "type": e.get("type", ""),
                }
                for e in errors
            ]
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle uncaught exceptions with standard error format.

    In debug mode the original error message is included; in production
    only a generic message is returned to avoid leaking internals.
    """
    from app.config import settings

    logger.error(
        "Unhandled exception",
        exc_info=exc,
        path=request.url.path,
        method=request.method,
        client_ip=(
            getattr(request.client, "host", "unknown") if request.client else "unknown"
        ),
    )
    return _build_error(
        status_code=500,
        error=(str(exc) if settings.DEBUG else "An unexpected internal error occurred"),
        code="INTERNAL_ERROR",
        details={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "path": request.url.path,
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all standardized exception handlers on the FastAPI app."""
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
