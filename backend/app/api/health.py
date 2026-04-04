"""
Health check and metrics endpoints for the trading platform.

Provides:
- /health - Liveness probe with dependency status
- /ready - Readiness probe (checks dependencies)
- /metrics - Basic application metrics (JSON)
- /metrics/prometheus - Prometheus-format metrics export
"""

import time
from datetime import datetime, timezone
from typing import Any, Dict

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse

from app.config import settings
from app.database import get_supabase

logger = structlog.get_logger()

router = APIRouter(tags=["health"])

# Metrics storage
_start_time = time.time()
_request_count = 0

# Trade execution metrics
_trade_latencies: list[float] = []
_trade_count = 0
_trade_errors = 0
_order_count_by_side: Dict[str, int] = {"buy": 0, "sell": 0}
_pnl_total = 0.0

# Agent heartbeat tracking
_agent_heartbeats: Dict[str, float] = {}
HEARTBEAT_STALE_SECONDS = 90


def increment_request_count():
    """Increment the global request counter."""
    global _request_count
    _request_count += 1


def record_trade_latency(latency_ms: float):
    """Record a trade execution latency measurement."""
    global _trade_count
    _trade_latencies.append(latency_ms)
    _trade_count += 1
    # Keep only last 1000 measurements
    if len(_trade_latencies) > 1000:
        _trade_latencies.pop(0)


def record_trade_error():
    """Record a trade execution error."""
    global _trade_errors
    _trade_errors += 1


def record_order(side: str):
    """Record an order by side (buy/sell)."""
    if side in _order_count_by_side:
        _order_count_by_side[side] += 1


def record_pnl(amount: float):
    """Record realized PnL."""
    global _pnl_total
    _pnl_total += amount


def update_agent_heartbeat(agent_id: str):
    """Update the last heartbeat time for an agent."""
    _agent_heartbeats[agent_id] = time.time()


def get_stale_agents() -> list[str]:
    """Return list of agents with stale heartbeats (no heartbeat in HEARTBEAT_STALE_SECONDS)."""
    now = time.time()
    return [
        agent_id
        for agent_id, last_hb in _agent_heartbeats.items()
        if (now - last_hb) > HEARTBEAT_STALE_SECONDS
    ]


def get_uptime_seconds() -> float:
    """Get application uptime in seconds."""
    return time.time() - _start_time


def _percentile(data: list[float], pct: float) -> float:
    """Calculate percentile from sorted data."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * pct / 100.0)
    idx = min(idx, len(sorted_data) - 1)
    return sorted_data[idx]


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Liveness probe - basic health check with dependency status.

    Returns 200 if the application is running.
    Used by load balancers and container orchestrators.
    """
    # Check for stale agents
    stale_agents = get_stale_agents()

    result: Dict[str, Any] = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": round(get_uptime_seconds(), 2),
    }

    # Database check
    try:
        supabase = get_supabase()
        supabase.table("venues").select("id").limit(1).execute()
        result["database"] = "connected"
    except Exception:
        result["database"] = "disconnected"

    # Redis check
    try:
        import redis as redis_lib

        r = redis_lib.from_url(settings.redis_url, socket_timeout=2)
        r.ping()
        result["redis"] = "connected"
    except Exception:
        result["redis"] = "disconnected"

    # Agent staleness
    if stale_agents:
        result["stale_agents"] = stale_agents
        logger.warning("agent_heartbeat_stale", stale_agents=stale_agents)

    return result


@router.get("/ready")
async def readiness_check() -> JSONResponse:
    """
    Readiness probe - checks if the service is ready to accept traffic.

    Verifies database connectivity and critical services.
    Returns 200 if ready, 503 if not ready.
    """
    checks: Dict[str, str] = {}
    all_ready = True

    # Check database connectivity
    try:
        supabase = get_supabase()
        supabase.table("venues").select("id").limit(1).execute()
        checks["database"] = "connected"
    except Exception as e:
        logger.warning("readiness_check_db_failed", error=str(e))
        checks["database"] = f"error: {str(e)[:50]}"
        all_ready = False

    # Check Redis connectivity
    try:
        import redis as redis_lib

        r = redis_lib.from_url(settings.redis_url, socket_timeout=2)
        r.ping()
        checks["redis"] = "connected"
    except Exception as e:
        logger.warning("readiness_check_redis_failed", error=str(e))
        checks["redis"] = f"error: {str(e)[:50]}"
        # Redis degradation is not fatal for readiness
        checks["redis_note"] = "degraded but non-blocking"

    status_code = 200 if all_ready else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_ready else "not_ready",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        },
    )


@router.get("/metrics")
async def metrics() -> Dict[str, Any]:
    """
    Application metrics in JSON format.

    Returns request count, uptime, memory, trade metrics, and agent status.
    """
    import os

    import psutil

    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()

    return {
        "request_count": _request_count,
        "uptime_seconds": round(get_uptime_seconds(), 2),
        "memory_mb": round(memory_info.rss / 1024 / 1024, 2),
        "cpu_percent": process.cpu_percent(),
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trades": {
            "total": _trade_count,
            "errors": _trade_errors,
            "orders_buy": _order_count_by_side.get("buy", 0),
            "orders_sell": _order_count_by_side.get("sell", 0),
            "pnl_total": round(_pnl_total, 2),
        },
        "latency": {
            "p50_ms": round(_percentile(_trade_latencies, 50), 2),
            "p95_ms": round(_percentile(_trade_latencies, 95), 2),
            "p99_ms": round(_percentile(_trade_latencies, 99), 2),
        },
        "agents": {
            "tracked": len(_agent_heartbeats),
            "stale": get_stale_agents(),
        },
    }


@router.get("/metrics/prometheus")
async def prometheus_metrics() -> PlainTextResponse:
    """
    Prometheus-format metrics export.

    Exposes key trading platform metrics for Prometheus scraping.
    """
    import os

    import psutil

    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    uptime = get_uptime_seconds()

    lines = [
        "# HELP ec_uptime_seconds Application uptime in seconds",
        "# TYPE ec_uptime_seconds gauge",
        f"ec_uptime_seconds {uptime:.2f}",
        "",
        "# HELP ec_requests_total Total HTTP requests processed",
        "# TYPE ec_requests_total counter",
        f"ec_requests_total {_request_count}",
        "",
        "# HELP ec_memory_bytes Process resident memory in bytes",
        "# TYPE ec_memory_bytes gauge",
        f"ec_memory_bytes {memory_info.rss}",
        "",
        "# HELP ec_cpu_percent Process CPU utilization percentage",
        "# TYPE ec_cpu_percent gauge",
        f"ec_cpu_percent {process.cpu_percent():.2f}",
        "",
        "# HELP ec_trades_total Total trades executed",
        "# TYPE ec_trades_total counter",
        f"ec_trades_total {_trade_count}",
        "",
        "# HELP ec_trade_errors_total Total trade execution errors",
        "# TYPE ec_trade_errors_total counter",
        f"ec_trade_errors_total {_trade_errors}",
        "",
        "# HELP ec_orders_total Total orders by side",
        "# TYPE ec_orders_total counter",
        f'ec_orders_total{{side="buy"}} {_order_count_by_side.get("buy", 0)}',
        f'ec_orders_total{{side="sell"}} {_order_count_by_side.get("sell", 0)}',
        "",
        "# HELP ec_pnl_total Cumulative realized PnL in USD",
        "# TYPE ec_pnl_total gauge",
        f"ec_pnl_total {_pnl_total:.2f}",
        "",
        "# HELP ec_trade_latency_p50_ms Trade execution latency p50 in milliseconds",
        "# TYPE ec_trade_latency_p50_ms gauge",
        f"ec_trade_latency_p50_ms {_percentile(_trade_latencies, 50):.2f}",
        "",
        "# HELP ec_trade_latency_p95_ms Trade execution latency p95 in milliseconds",
        "# TYPE ec_trade_latency_p95_ms gauge",
        f"ec_trade_latency_p95_ms {_percentile(_trade_latencies, 95):.2f}",
        "",
        "# HELP ec_trade_latency_p99_ms Trade execution latency p99 in milliseconds",
        "# TYPE ec_trade_latency_p99_ms gauge",
        f"ec_trade_latency_p99_ms {_percentile(_trade_latencies, 99):.2f}",
        "",
        "# HELP ec_agents_tracked Number of agents being tracked",
        "# TYPE ec_agents_tracked gauge",
        f"ec_agents_tracked {len(_agent_heartbeats)}",
        "",
        "# HELP ec_agents_stale Number of agents with stale heartbeats",
        "# TYPE ec_agents_stale gauge",
        f"ec_agents_stale {len(get_stale_agents())}",
        "",
    ]

    return PlainTextResponse(
        content="\n".join(lines) + "\n",
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )
