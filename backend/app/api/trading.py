"""
API routes for trading operations.
"""

from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.database import get_supabase
from app.middleware.security import RATE_LIMITS, get_rate_limiter

router = APIRouter(prefix="/api/trading", tags=["trading"])
limiter = get_rate_limiter()


class PlaceOrderRequest(BaseModel):
    book_id: str
    venue_name: str
    instrument: str
    side: str  # "buy" or "sell"
    size: float
    price: Optional[float] = None


@router.get("/positions")
@limiter.limit(RATE_LIMITS["read"])
async def get_positions(request: Request, book_id: Optional[str] = None):
    """Get all open positions, optionally filtered by book."""
    supabase = get_supabase()
    query = (
        supabase.table("positions")
        .select("*, venues(name), books(name)")
        .eq("is_open", True)
    )

    if book_id:
        query = query.eq("book_id", book_id)

    result = query.order("created_at", desc=True).execute()
    return result.data


@router.get("/orders")
@limiter.limit(RATE_LIMITS["read"])
async def get_orders(
    request: Request,
    status: Optional[str] = None,
    book_id: Optional[str] = None,
    limit: int = 100,
):
    """Get orders with optional filters."""
    supabase = get_supabase()
    query = supabase.table("orders").select("*, venues(name), books(name)")

    if status:
        query = query.eq("status", status)
    if book_id:
        query = query.eq("book_id", book_id)

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/fills")
@limiter.limit(RATE_LIMITS["read"])
async def get_fills(request: Request, order_id: Optional[str] = None, limit: int = 100):
    """Get order fills."""
    supabase = get_supabase()
    query = supabase.table("fills").select("*, orders(instrument, side)")

    if order_id:
        query = query.eq("order_id", order_id)

    result = query.order("executed_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/intents")
@limiter.limit(RATE_LIMITS["read"])
async def get_trade_intents(
    request: Request,
    status: Optional[str] = None,
    strategy_id: Optional[str] = None,
    limit: int = 100,
):
    """Get trade intents with optional filters."""
    supabase = get_supabase()
    query = supabase.table("trade_intents").select("*, strategies(name), books(name)")

    if status:
        query = query.eq("status", status)
    if strategy_id:
        query = query.eq("strategy_id", strategy_id)

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data
