"""
Market Data Service - Unified market data from multiple venues.
"""
import structlog
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
import asyncio
import json

from app.config import settings
from app.database import get_supabase

logger = structlog.get_logger()


class MarketDataService:
    """
    Unified market data aggregation from multiple venues.
    
    Responsibilities:
    - Connect to venue websockets
    - Normalize data to unified schema
    - Data quality checks
    - Publish to Redis pubsub
    """
    
    def __init__(self):
        self._connections: Dict[str, Any] = {}
        self._subscribers: Dict[str, List[Callable]] = {}
        self._last_prices: Dict[str, Dict] = {}
        self._heartbeats: Dict[str, datetime] = {}
        self._redis_client = None
    
    async def initialize(self):
        """Initialize Redis connection for pubsub."""
        try:
            import redis.asyncio as redis
            self._redis_client = redis.from_url(settings.redis_url)
            logger.info("market_data_redis_connected")
        except Exception as e:
            logger.warning("redis_connection_failed", error=str(e))
    
    async def subscribe(
        self,
        venue: str,
        instruments: List[str],
        callback: Optional[Callable] = None
    ):
        """Subscribe to market data for instruments on a venue."""
        key = f"{venue}:{','.join(instruments)}"
        
        if callback:
            if key not in self._subscribers:
                self._subscribers[key] = []
            self._subscribers[key].append(callback)
        
        logger.info(
            "market_data_subscribed",
            venue=venue,
            instruments=instruments
        )
    
    async def get_price(self, venue: str, instrument: str) -> Optional[Dict]:
        """Get last known price for an instrument."""
        key = f"{venue}:{instrument}"
        return self._last_prices.get(key)
    
    async def get_all_prices(self, venue: str) -> Dict[str, Dict]:
        """Get all prices for a venue."""
        return {
            k.split(":")[1]: v 
            for k, v in self._last_prices.items() 
            if k.startswith(f"{venue}:")
        }
    
    def update_price(
        self,
        venue: str,
        instrument: str,
        bid: float,
        ask: float,
        last: float,
        volume_24h: Optional[float] = None
    ):
        """Update price (called by venue adapters)."""
        key = f"{venue}:{instrument}"
        
        price_data = {
            "venue": venue,
            "instrument": instrument,
            "bid": bid,
            "ask": ask,
            "last": last,
            "mid": (bid + ask) / 2,
            "spread": ask - bid,
            "spread_bps": ((ask - bid) / ((ask + bid) / 2)) * 10000 if (ask + bid) > 0 else 0,
            "volume_24h": volume_24h,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self._last_prices[key] = price_data
        self._heartbeats[venue] = datetime.utcnow()
        
        # Notify subscribers
        asyncio.create_task(self._notify_subscribers(key, price_data))
        
        # Publish to Redis
        if self._redis_client:
            asyncio.create_task(self._publish_redis(key, price_data))
    
    async def _notify_subscribers(self, key: str, data: Dict):
        """Notify all subscribers of a price update."""
        for sub_key, callbacks in self._subscribers.items():
            if key.startswith(sub_key.split(":")[0]):
                for callback in callbacks:
                    try:
                        await callback(data)
                    except Exception as e:
                        logger.error("subscriber_callback_failed", error=str(e))
    
    async def _publish_redis(self, key: str, data: Dict):
        """Publish price update to Redis."""
        try:
            await self._redis_client.publish(
                f"prices:{key}",
                json.dumps(data)
            )
        except Exception as e:
            logger.error("redis_publish_failed", error=str(e))
    
    def check_data_quality(self, venue: str) -> Dict:
        """Check data quality for a venue."""
        last_heartbeat = self._heartbeats.get(venue)
        
        if not last_heartbeat:
            return {
                "venue": venue,
                "status": "no_data",
                "stale": True,
                "stale_seconds": None
            }
        
        stale_seconds = (datetime.utcnow() - last_heartbeat).total_seconds()
        is_stale = stale_seconds > 30  # Consider stale if no update in 30s
        
        return {
            "venue": venue,
            "status": "stale" if is_stale else "ok",
            "stale": is_stale,
            "stale_seconds": stale_seconds,
            "last_update": last_heartbeat.isoformat()
        }
    
    async def get_venue_instruments(self, venue: str) -> List[str]:
        """Get available instruments for a venue."""
        supabase = get_supabase()
        result = supabase.table("venues").select("supported_instruments").ilike("name", venue).single().execute()
        
        if result.data:
            return result.data.get("supported_instruments", [])
        return []


# Singleton instance
market_data_service = MarketDataService()
