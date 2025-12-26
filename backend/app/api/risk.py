"""
API routes for risk management.
"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.database import get_supabase, audit_log, create_alert
from app.services.risk_engine import risk_engine

router = APIRouter(prefix="/api/risk", tags=["risk"])


class KillSwitchRequest(BaseModel):
    book_id: Optional[str] = None
    activate: bool = True
    reason: str = "Manual activation"


class CircuitBreakerRequest(BaseModel):
    breaker_type: str
    activate: bool
    reason: Optional[str] = None


@router.get("/limits")
async def get_risk_limits(book_id: Optional[str] = None):
    """Get risk limits, optionally for a specific book."""
    supabase = get_supabase()
    query = supabase.table("risk_limits").select("*, books(name)")
    
    if book_id:
        query = query.eq("book_id", book_id)
    
    result = query.execute()
    return result.data


@router.get("/breaches")
async def get_risk_breaches(
    book_id: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    limit: int = 100
):
    """Get risk breaches with optional filters."""
    supabase = get_supabase()
    query = supabase.table("risk_breaches").select("*, books(name)")
    
    if book_id:
        query = query.eq("book_id", book_id)
    if is_resolved is not None:
        query = query.eq("is_resolved", is_resolved)
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/circuit-breakers")
async def get_circuit_breakers():
    """Get all circuit breaker events."""
    supabase = get_supabase()
    result = supabase.table("circuit_breaker_events").select(
        "*, books(name)"
    ).order("created_at", desc=True).limit(100).execute()
    return result.data


@router.get("/circuit-breakers/status")
async def get_circuit_breaker_status():
    """Get current circuit breaker status."""
    return {
        "breakers": risk_engine._circuit_breakers,
        "timestamp": "now"
    }


@router.post("/kill-switch")
async def activate_kill_switch(
    req: KillSwitchRequest,
    x_user_id: str = Header(None)
):
    """Activate kill switch (global or per-book)."""
    book_id = UUID(req.book_id) if req.book_id else None
    
    await risk_engine.activate_kill_switch(
        book_id=book_id,
        user_id=x_user_id,
        reason=req.reason
    )
    
    return {"success": True, "book_id": req.book_id, "global": req.book_id is None}


@router.post("/circuit-breaker")
async def manage_circuit_breaker(
    req: CircuitBreakerRequest,
    x_user_id: str = Header(None)
):
    """Activate or deactivate a circuit breaker."""
    if req.activate:
        await risk_engine.activate_circuit_breaker(
            breaker_type=req.breaker_type,
            reason=req.reason or "Manual activation"
        )
    else:
        await risk_engine.deactivate_circuit_breaker(req.breaker_type)
    
    return {"success": True, "breaker_type": req.breaker_type, "active": req.activate}


@router.get("/global-settings")
async def get_global_settings():
    """Get global risk settings."""
    supabase = get_supabase()
    result = supabase.table("global_settings").select("*").limit(1).execute()
    return result.data[0] if result.data else {}
