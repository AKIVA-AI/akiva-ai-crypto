"""
API routes for venue management.
"""
from fastapi import APIRouter
from typing import Optional

from app.database import get_supabase

router = APIRouter(prefix="/api/venues", tags=["venues"])


@router.get("")
async def get_venues():
    """Get all venues."""
    supabase = get_supabase()
    result = supabase.table("venues").select("*").order("name").execute()
    return result.data


@router.get("/health")
async def get_venues_health():
    """Get venue health status."""
    supabase = get_supabase()
    
    # Get venues with their latest health snapshot
    venues = supabase.table("venues").select("*").execute()
    
    # Get latest health records
    health_records = supabase.table("venue_health").select(
        "*"
    ).order("recorded_at", desc=True).execute()
    
    # Build health map
    health_map = {}
    for h in health_records.data:
        if h["venue_id"] not in health_map:
            health_map[h["venue_id"]] = h
    
    # Combine
    result = []
    for venue in venues.data:
        health = health_map.get(venue["id"], {})
        result.append({
            **venue,
            "health_snapshot": health
        })
    
    return result


@router.get("/{venue_id}/health-history")
async def get_venue_health_history(venue_id: str, limit: int = 100):
    """Get health history for a specific venue."""
    supabase = get_supabase()
    result = supabase.table("venue_health").select("*").eq(
        "venue_id", venue_id
    ).order("recorded_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/{venue_id}/instruments")
async def get_venue_instruments(venue_id: str):
    """Get supported instruments for a venue."""
    supabase = get_supabase()
    result = supabase.table("venues").select("supported_instruments").eq(
        "id", venue_id
    ).single().execute()
    return result.data.get("supported_instruments", []) if result.data else []
