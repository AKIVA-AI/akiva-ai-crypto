"""
Crypto Ops Trading Engine - FastAPI Application

Production-grade trading backend for the Crypto Ops Control Center.
Connects to Supabase for state persistence and real-time updates.
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel
from datetime import datetime

from app.config import settings
from app.database import get_supabase, audit_log, create_alert
from app.services.risk_engine import risk_engine
from app.services.portfolio_engine import portfolio_engine
from app.services.oms_execution import oms_service
from app.services.reconciliation import recon_service
from app.services.engine_runner import engine_runner
from app.services.strategy_engine import strategy_engine
from app.services.market_data import market_data_service
from app.adapters.coinbase_adapter import CoinbaseAdapter
from app.adapters.mexc_adapter import MEXCAdapter
from app.adapters.dex_adapter import DEXAdapter
from app.api import trading, risk, venues, meme

structlog.configure(processors=[structlog.processors.JSONRenderer()])
logger = structlog.get_logger()


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("trading_engine_starting", paper_mode=settings.is_paper_mode)
    
    # Initialize adapters
    coinbase = CoinbaseAdapter()
    mexc = MEXCAdapter()
    dex = DEXAdapter()
    
    await coinbase.connect()
    await mexc.connect()
    await dex.connect()
    
    oms_service.register_adapter("coinbase", coinbase)
    oms_service.register_adapter("mexc", mexc)
    oms_service.register_adapter("dex", dex)
    
    recon_service.register_adapter("coinbase", coinbase)
    recon_service.register_adapter("mexc", mexc)
    
    # Initialize market data
    await market_data_service.initialize()
    
    # Load strategies
    await strategy_engine.load_strategies()
    
    logger.info("trading_engine_started", 
                paper_mode=settings.is_paper_mode,
                adapters=["coinbase", "mexc", "dex"])
    
    yield
    
    # Shutdown
    logger.info("trading_engine_stopping")
    await engine_runner.stop()


app = FastAPI(
    title="Crypto Ops Trading Engine",
    version="1.0.0",
    description="Production trading backend for Crypto Ops Control Center",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(trading.router, prefix="/api/trading", tags=["trading"])
app.include_router(risk.router, prefix="/api/risk", tags=["risk"])
app.include_router(venues.router, prefix="/api/venues", tags=["venues"])
app.include_router(meme.router, prefix="/api/meme", tags=["meme"])


# === Core Endpoints ===

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "paper_mode": settings.is_paper_mode,
        "env": settings.env
    }


@app.get("/version")
async def version():
    """Version endpoint."""
    return {
        "version": "1.0.0",
        "api_version": "v1",
        "paper_mode": settings.is_paper_mode
    }


@app.get("/status")
async def status():
    """Engine status endpoint."""
    return engine_runner.get_status()


# === Engine Control ===

@app.post("/engine/run_once")
async def run_once(background_tasks: BackgroundTasks, x_user_id: str = Header(None)):
    """
    Run a single engine cycle.
    Useful for cron-based operation or manual triggering.
    """
    result = await engine_runner.run_cycle()
    
    await audit_log(
        action="engine_cycle_triggered",
        resource_type="engine",
        resource_id="manual",
        user_id=x_user_id,
        after_state=result
    )
    
    return result


@app.post("/engine/start")
async def start_engine(background_tasks: BackgroundTasks, x_user_id: str = Header(None)):
    """Start the continuous engine loop."""
    background_tasks.add_task(engine_runner.start)
    
    await audit_log(
        action="engine_started",
        resource_type="engine",
        resource_id="continuous",
        user_id=x_user_id
    )
    
    return {"status": "starting", "paper_mode": settings.is_paper_mode}


@app.post("/engine/stop")
async def stop_engine(x_user_id: str = Header(None)):
    """Stop the engine loop."""
    await engine_runner.stop()
    
    await audit_log(
        action="engine_stopped",
        resource_type="engine",
        resource_id="continuous",
        user_id=x_user_id
    )
    
    return {"status": "stopped"}


class PauseBookRequest(BaseModel):
    book_id: str
    reason: str = "Manual pause"


@app.post("/engine/pause_book")
async def pause_book(req: PauseBookRequest, x_user_id: str = Header(None)):
    """Pause trading for a specific book."""
    await engine_runner.pause_book(UUID(req.book_id), req.reason, x_user_id)
    return {"status": "paused", "book_id": req.book_id}


@app.post("/engine/resume_book")
async def resume_book(req: PauseBookRequest, x_user_id: str = Header(None)):
    """Resume trading for a specific book."""
    await engine_runner.resume_book(UUID(req.book_id), x_user_id)
    return {"status": "resumed", "book_id": req.book_id}


# === Overview & Dashboard ===

@app.get("/api/overview")
async def get_overview():
    """Get trading overview for dashboard."""
    supabase = get_supabase()
    
    # Get positions
    positions = supabase.table("positions").select(
        "unrealized_pnl, realized_pnl"
    ).eq("is_open", True).execute()
    
    # Get books
    books = supabase.table("books").select(
        "capital_allocated, current_exposure, status"
    ).execute()
    
    # Get today's orders
    today = datetime.utcnow().date().isoformat()
    orders = supabase.table("orders").select(
        "status, filled_size, filled_price"
    ).gte("created_at", today).execute()
    
    total_unrealized = sum(p.get("unrealized_pnl", 0) for p in positions.data)
    total_realized = sum(p.get("realized_pnl", 0) for p in positions.data)
    total_aum = sum(b.get("capital_allocated", 0) for b in books.data)
    total_exposure = sum(b.get("current_exposure", 0) for b in books.data)
    active_books = sum(1 for b in books.data if b.get("status") == "active")
    
    return {
        "total_pnl": total_unrealized + total_realized,
        "unrealized_pnl": total_unrealized,
        "realized_pnl": total_realized,
        "total_aum": total_aum,
        "total_exposure": total_exposure,
        "exposure_pct": (total_exposure / total_aum * 100) if total_aum > 0 else 0,
        "active_books": active_books,
        "total_books": len(books.data),
        "orders_today": len(orders.data),
        "paper_mode": settings.is_paper_mode,
        "timestamp": datetime.utcnow().isoformat()
    }


# === Books ===

@app.get("/api/books")
async def get_books():
    """Get all trading books."""
    books = await portfolio_engine.get_books()
    return [b.dict() for b in books]


@app.get("/api/books/{book_id}")
async def get_book(book_id: str):
    """Get a specific book."""
    supabase = get_supabase()
    result = supabase.table("books").select("*").eq("id", book_id).single().execute()
    return result.data


class ReallocateRequest(BaseModel):
    book_id: str
    new_capital: float


@app.post("/api/books/reallocate")
async def reallocate_capital(req: ReallocateRequest, x_user_id: str = Header(None)):
    """Reallocate capital to a book (privileged action)."""
    book = await portfolio_engine.reallocate_capital(
        UUID(req.book_id), 
        req.new_capital, 
        x_user_id or "system"
    )
    return book.dict()


# === Strategies ===

@app.get("/api/strategies")
async def get_strategies():
    """Get all strategies."""
    supabase = get_supabase()
    return supabase.table("strategies").select("*").execute().data


@app.post("/api/strategies/{strategy_id}/toggle")
async def toggle_strategy(strategy_id: str, x_user_id: str = Header(None)):
    """Toggle strategy status."""
    supabase = get_supabase()
    current = supabase.table("strategies").select("status").eq("id", strategy_id).single().execute()
    
    status_cycle = {"off": "paper", "paper": "live", "live": "off"}
    new_status = status_cycle.get(current.data["status"], "off")
    
    supabase.table("strategies").update({"status": new_status}).eq("id", strategy_id).execute()
    
    await audit_log(
        action="strategy_toggled",
        resource_type="strategy",
        resource_id=strategy_id,
        user_id=x_user_id,
        before_state={"status": current.data["status"]},
        after_state={"status": new_status}
    )
    
    return {"status": new_status}


# === Positions & Orders ===

@app.get("/api/positions")
async def get_positions(book_id: Optional[str] = None, is_open: bool = True):
    """Get positions."""
    supabase = get_supabase()
    query = supabase.table("positions").select("*")
    
    if book_id:
        query = query.eq("book_id", book_id)
    if is_open:
        query = query.eq("is_open", True)
    
    return query.execute().data


@app.get("/api/orders")
async def get_orders(book_id: Optional[str] = None, limit: int = 100):
    """Get recent orders."""
    supabase = get_supabase()
    query = supabase.table("orders").select("*").order("created_at", desc=True).limit(limit)
    
    if book_id:
        query = query.eq("book_id", book_id)
    
    return query.execute().data


# === Risk ===

class KillSwitchRequest(BaseModel):
    book_id: Optional[str] = None
    activate: bool = True
    reason: str = "Manual activation"


@app.post("/api/risk/kill-switch")
async def kill_switch(req: KillSwitchRequest, x_user_id: str = Header(None)):
    """Activate/deactivate kill switch."""
    if req.activate:
        await risk_engine.activate_kill_switch(
            UUID(req.book_id) if req.book_id else None,
            x_user_id,
            req.reason
        )
    else:
        # Deactivate
        supabase = get_supabase()
        if req.book_id:
            supabase.table("books").update({"status": "active"}).eq("id", req.book_id).execute()
        else:
            supabase.table("global_settings").update({"global_kill_switch": False}).execute()
        
        await audit_log(
            action="kill_switch_deactivated",
            resource_type="kill_switch",
            resource_id=req.book_id or "global",
            user_id=x_user_id,
            after_state={"active": False}
        )
    
    return {"activated": req.activate, "scope": req.book_id or "global"}


@app.get("/api/risk/breaches")
async def get_risk_breaches(is_resolved: Optional[bool] = None, limit: int = 50):
    """Get risk breaches."""
    supabase = get_supabase()
    query = supabase.table("risk_breaches").select("*").order("created_at", desc=True).limit(limit)
    
    if is_resolved is not None:
        query = query.eq("is_resolved", is_resolved)
    
    return query.execute().data


# === Venues ===

@app.get("/api/venues")
async def get_venues():
    """Get all venues with health status."""
    supabase = get_supabase()
    return supabase.table("venues").select("*").execute().data


@app.get("/api/venues/health")
async def venues_health():
    """Get venue health status."""
    supabase = get_supabase()
    return supabase.table("venue_health").select("*, venues(name)").execute().data


# === Audit ===

@app.get("/api/audit")
async def get_audit(limit: int = 100, action: Optional[str] = None):
    """Get audit events."""
    supabase = get_supabase()
    query = supabase.table("audit_events").select("*").order("created_at", desc=True).limit(limit)
    
    if action:
        query = query.eq("action", action)
    
    return query.execute().data


@app.get("/api/alerts")
async def get_alerts(limit: int = 50, severity: Optional[str] = None, is_resolved: Optional[bool] = None):
    """Get alerts."""
    supabase = get_supabase()
    query = supabase.table("alerts").select("*").order("created_at", desc=True).limit(limit)
    
    if severity:
        query = query.eq("severity", severity)
    if is_resolved is not None:
        query = query.eq("is_resolved", is_resolved)
    
    return query.execute().data


# === Debug (Admin Only) ===

@app.get("/debug/state")
async def debug_state():
    """Get engine internal state (admin only)."""
    if settings.is_production:
        raise HTTPException(status_code=403, detail="Not available in production")
    
    return {
        "engine": engine_runner.get_status(),
        "adapters": {
            name: {
                "connected": adapter._connected,
                "paper_mode": adapter.paper_mode
            }
            for name, adapter in oms_service._adapters.items()
        },
        "market_data": {
            venue: market_data_service.check_data_quality(venue)
            for venue in ["coinbase", "mexc", "dex"]
        },
        "risk": {
            "circuit_breakers": risk_engine._circuit_breakers
        }
    }
