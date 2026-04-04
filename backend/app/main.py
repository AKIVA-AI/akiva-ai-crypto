"""
Hedge Fund Trading Platform - FastAPI Backend

Production-grade institutional trading system with:
- Advanced risk management
- Quantitative strategies
- Smart order routing
- Real-time market data
- Enterprise security
"""

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPBearer

from app.api.health import increment_request_count
from app.api.health import router as health_router
from app.api.routes import api_router

# Arbitrage Engine
from app.arbitrage import get_arbitrage_engine
from app.core.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.observability import init_sentry, init_tracing
from app.core.security import get_current_user
from app.database import close_db, init_db
from app.logging_config import configure_logging
from app.middleware.security import (
    RequestValidationMiddleware,
    SecurityHeadersMiddleware,
    setup_rate_limiting,
)
from app.services.advanced_risk_engine import advanced_risk_engine

# FreqTrade Integration
from app.services.freqtrade_integration import (
    get_freqtrade_status,
    initialize_freqtrade_integration,
    shutdown_freqtrade_integration,
)
from app.services.market_data_service import market_data_service
from app.services.smart_order_router import smart_order_router

# Setup structured logging
logger = configure_logging()

# Initialize Sentry error tracking (before app creation so it captures startup errors)
init_sentry()


# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Hedge Fund Trading Platform with FreqTrade Integration")

    try:
        # Initialize database
        await init_db()
        logger.info("Database initialized")

        # Start market data service
        await market_data_service.start()
        logger.info("Market data service started")

        # Initialize FreqTrade integration (highest priority)
        logger.info("Initializing FreqTrade integration...")
        await initialize_freqtrade_integration()
        logger.info("FreqTrade integration initialized")

        # Initialize trading engines
        await smart_order_router.initialize()
        await advanced_risk_engine.initialize()
        logger.info("Trading engines initialized")

        # Initialize arbitrage engine
        try:
            arbitrage_engine = get_arbitrage_engine()
            await arbitrage_engine.start()
            logger.info("Arbitrage engine started")
        except Exception as e:
            logger.warning(f"Arbitrage engine startup warning: {e}")

        logger.info("🎉 All systems operational - FreqTrade enhanced platform ready")

        yield

    except Exception as e:
        logger.error("Startup error", error=str(e))
        raise

    finally:
        logger.info("Shutting down Hedge Fund Trading Platform")

        # Stop arbitrage engine
        try:
            arbitrage_engine = get_arbitrage_engine()
            await arbitrage_engine.stop()
            logger.info("Arbitrage engine stopped")
        except Exception as e:
            logger.warning(f"Arbitrage engine shutdown warning: {e}")

        # Stop FreqTrade integration first
        await shutdown_freqtrade_integration()
        logger.info("FreqTrade integration stopped")

        # Stop other services
        await market_data_service.stop()
        await close_db()
        logger.info("Services stopped")


# Create FastAPI application
app = FastAPI(
    title="Hedge Fund Trading Platform",
    description="Institutional-grade crypto trading system",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Security
security = HTTPBearer()

# Setup rate limiting
setup_rate_limiting(app)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Request validation middleware
app.add_middleware(RequestValidationMiddleware, enable_injection_detection=True)

# CORS middleware - hardened configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
    max_age=86400,  # 24 hours cache for preflight
)

# Trusted host middleware (production only)
if not settings.DEBUG:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)


# Register standardized error handlers (HTTPException, ValidationError, generic)
register_error_handlers(app)


# Request ID + metrics middleware
@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id
    structlog.contextvars.bind_contextvars(request_id=request_id)

    increment_request_count()
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    structlog.contextvars.clear_contextvars()
    return response


# FreqTrade health check endpoint
@app.get("/health/freqtrade")
async def freqtrade_health_check():
    """FreqTrade-specific health check endpoint."""
    return get_freqtrade_status()


# FreqTrade components health check
@app.get("/health/freqtrade/components")
async def freqtrade_components_health():
    """Detailed FreqTrade component health status."""
    status = get_freqtrade_status()
    return status.get("component_health", {})


# Authentication middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Authentication middleware for protected routes."""
    # Skip auth for health checks, readiness probes, and docs
    if request.url.path in [
        "/health",
        "/ready",
        "/metrics",
        "/metrics/prometheus",
        "/docs",
        "/redoc",
        "/openapi.json",
    ] or request.url.path.startswith("/health/"):
        return await call_next(request)

    # Skip auth for OPTIONS requests
    if request.method == "OPTIONS":
        return await call_next(request)

    try:
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid token")

        token = auth_header.split(" ")[1]
        user = await get_current_user(token)

        # Add user to request state
        request.state.user = user
        request.state.user_id = user["id"]
        request.state.user_role = user.get("role", "trader")

        # Log authenticated request
        logger.info(
            "Authenticated request",
            user_id=user["id"],
            role=user.get("role"),
            path=request.url.path,
            method=request.method,
        )

    except Exception as e:
        logger.warning("Authentication failed", error=str(e), path=request.url.path)
        raise HTTPException(status_code=401, detail="Authentication failed")

    response = await call_next(request)
    return response


# API routes
app.include_router(
    api_router, prefix="/api/v1", dependencies=[Depends(get_current_user)]
)
app.include_router(health_router)

# Initialize OpenTelemetry distributed tracing (after app + routes are registered)
init_tracing(app)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Hedge Fund Trading Platform API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "status": "operational",
    }


# System info endpoint (admin only)
@app.get("/system/info")
async def system_info(request: Request):
    """System information endpoint (admin only)."""
    if request.state.user_role not in ["admin", "cio"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    freqtrade_status = get_freqtrade_status()

    return {
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "database_connected": True,
        "services_status": {
            "market_data": "active",
            "risk_engine": "ready",
            "strategy_engine": "freqtrade",  # Now using FreqTrade
            "order_router": "ready",
            "freqtrade_integration": freqtrade_status.get(
                "freqtrade_integration", {}
            ).get("status", "unknown"),
        },
        "freqtrade_enhanced": True,
        "freqtrade_components": list(
            freqtrade_status.get("component_health", {}).keys()
        ),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    # Development server
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",  # nosec B104
        port=8000,
        reload=settings.DEBUG,
        log_level="info",
    )
