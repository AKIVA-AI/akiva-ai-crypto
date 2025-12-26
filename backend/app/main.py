"""
Crypto Ops Trading Engine - FastAPI Application
"""
import structlog
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.config import settings
from app.database import get_supabase, audit_log
from app.services.risk_engine import risk_engine
from app.services.portfolio_engine import portfolio_engine
from app.services.oms_execution import oms_service
from app.services.reconciliation import recon_service
from app.services.meme_venture import meme_service
from app.adapters.coinbase_adapter import CoinbaseAdapter
from app.adapters.mexc_adapter import MEXCAdapter
from app.adapters.dex_adapter import DEXAdapter

structlog.configure(processors=[structlog.processors.JSONRenderer()])
logger = structlog.get_logger()

app = FastAPI(title="Crypto Ops Trading Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register adapters on startup
@app.on_event("startup")
async def startup():
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
    
    logger.info("trading_engine_started", paper_mode=settings.is_paper_mode)

# Health check
@app.get("/health")
async def health():
    return {"status": "healthy", "paper_mode": settings.is_paper_mode}

# === API Endpoints ===

@app.get("/api/overview")
async def get_overview():
    supabase = get_supabase()
    positions = supabase.table("positions").select("unrealized_pnl").eq("is_open", True).execute()
    books = supabase.table("books").select("capital_allocated, current_exposure").execute()
    
    total_pnl = sum(p.get("unrealized_pnl", 0) for p in positions.data)
    total_aum = sum(b.get("capital_allocated", 0) for b in books.data)
    
    return {"total_pnl": total_pnl, "total_aum": total_aum, "paper_mode": settings.is_paper_mode}

@app.get("/api/books")
async def get_books():
    books = await portfolio_engine.get_books()
    return [b.dict() for b in books]

class ReallocateRequest(BaseModel):
    book_id: str
    new_capital: float

@app.post("/api/books/reallocate")
async def reallocate_capital(req: ReallocateRequest, x_user_id: str = Header(None)):
    book = await portfolio_engine.reallocate_capital(UUID(req.book_id), req.new_capital, x_user_id or "system")
    return book.dict()

@app.get("/api/strategies")
async def get_strategies():
    supabase = get_supabase()
    return supabase.table("strategies").select("*").execute().data

@app.post("/api/strategies/{strategy_id}/toggle")
async def toggle_strategy(strategy_id: str, x_user_id: str = Header(None)):
    supabase = get_supabase()
    current = supabase.table("strategies").select("status").eq("id", strategy_id).single().execute()
    new_status = "off" if current.data["status"] == "live" else "live"
    supabase.table("strategies").update({"status": new_status}).eq("id", strategy_id).execute()
    await audit_log("strategy_toggled", "strategy", strategy_id, x_user_id, after_state={"status": new_status})
    return {"status": new_status}

@app.get("/api/trading/positions")
async def get_positions():
    supabase = get_supabase()
    return supabase.table("positions").select("*").eq("is_open", True).execute().data

@app.get("/api/trading/orders")
async def get_orders():
    supabase = get_supabase()
    return supabase.table("orders").select("*").order("created_at", desc=True).limit(100).execute().data

class KillSwitchRequest(BaseModel):
    book_id: Optional[str] = None
    reason: str = "Manual activation"

@app.post("/api/risk/kill-switch")
async def kill_switch(req: KillSwitchRequest, x_user_id: str = Header(None)):
    await risk_engine.activate_kill_switch(UUID(req.book_id) if req.book_id else None, x_user_id, req.reason)
    return {"activated": True}

@app.get("/api/venues/health")
async def venues_health():
    supabase = get_supabase()
    return supabase.table("venues").select("*").execute().data

@app.get("/api/meme/projects")
async def get_meme_projects():
    return await meme_service.get_projects()

class CreateMemeProject(BaseModel):
    name: str
    ticker: str
    narrative_tags: List[str] = []

@app.post("/api/meme/projects")
async def create_meme_project(req: CreateMemeProject, x_user_id: str = Header(None)):
    return await meme_service.create_project(req.name, req.ticker, req.narrative_tags, x_user_id)

@app.get("/api/audit")
async def get_audit(limit: int = 100):
    supabase = get_supabase()
    return supabase.table("audit_events").select("*").order("created_at", desc=True).limit(limit).execute().data
