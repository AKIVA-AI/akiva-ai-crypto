"""
Security middleware for the trading platform.

Provides:
- Rate limiting (slowapi)
- Security headers
- Request validation
- Input sanitization
"""
import re
import time
from typing import Callable, Optional
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import structlog

logger = structlog.get_logger()

# Rate limiter instance
_limiter: Optional[Limiter] = None

# Rate limit configurations by endpoint type
RATE_LIMITS = {
    "trading": "30/minute",      # Trading operations - strict
    "read": "100/minute",        # Read operations - generous
    "write": "60/minute",        # General writes
    "auth": "10/minute",         # Authentication - very strict
    "websocket": "5/minute",     # WebSocket connections
}


def get_rate_limiter() -> Limiter:
    """Get the rate limiter instance."""
    global _limiter
    if _limiter is None:
        _limiter = Limiter(
            key_func=get_remote_address,
            default_limits=["200/minute", "1000/hour"],
            storage_uri="memory://",  # Use Redis in production: "redis://localhost:6379"
        )
    return _limiter


def setup_rate_limiting(app: FastAPI) -> None:
    """Configure rate limiting for the application."""
    limiter = get_rate_limiter()
    app.state.limiter = limiter
    
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        logger.warning(
            "rate_limit_exceeded",
            client_ip=get_remote_address(request),
            path=request.url.path,
            limit=str(exc.detail),
        )
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limit_exceeded",
                "detail": f"Rate limit exceeded: {exc.detail}",
                "retry_after": getattr(exc, "retry_after", 60),
            },
        )
    
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Core security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        # Content Security Policy (API - restrict to self)
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        
        # HSTS for production (HTTPS enforcement)
        from app.config import settings as _settings
        if _settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validate and sanitize incoming requests."""
    
    # Maximum request body size (10MB)
    MAX_BODY_SIZE = 10 * 1024 * 1024
    
    # Patterns that might indicate injection attempts
    SUSPICIOUS_PATTERNS = [
        r"<script[^>]*>",  # XSS
        r"javascript:",     # XSS
        r"on\w+\s*=",      # Event handlers
        r"(?:--|;|'|\"|\/\*|\*\/)",  # SQL injection basics
    ]
    
    def __init__(self, app, enable_injection_detection: bool = True):
        super().__init__(app)
        self.enable_injection_detection = enable_injection_detection
        self.compiled_patterns = [
            re.compile(p, re.IGNORECASE) for p in self.SUSPICIOUS_PATTERNS
        ]
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Check content length
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.MAX_BODY_SIZE:
                    logger.warning("request_too_large", size=content_length, path=request.url.path)
                    return JSONResponse(
                        status_code=413,
                        content={"error": "request_too_large", "detail": "Request body too large"},
                    )
            except ValueError:
                pass
        
        # Check for suspicious patterns in query params (lightweight check)
        if self.enable_injection_detection:
            query_string = str(request.query_params)
            for pattern in self.compiled_patterns:
                if pattern.search(query_string):
                    logger.warning(
                        "suspicious_request",
                        path=request.url.path,
                        query=query_string[:100],
                        client_ip=get_remote_address(request),
                    )
                    return JSONResponse(
                        status_code=400,
                        content={"error": "invalid_request", "detail": "Invalid characters in request"},
                    )
        
        # Add request timing
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(round(process_time * 1000, 2))
        
        return response

