"""
Engine Runner - Orchestrates the trading engine cycle.

This service coordinates:
1. Market data collection
2. Strategy intent generation
3. Risk checks
4. Order execution (paper or live)
5. Position/order snapshot writes
6. Venue health monitoring
"""
import structlog
import asyncio
from typing import Optional, List, Dict
from datetime import datetime
from uuid import UUID

from app.config import settings
from app.database import get_supabase, create_alert, audit_log
from app.models.domain import Book, TradeIntent, RiskDecision, Position, Order, OrderSide
from app.services.strategy_engine import strategy_engine
from app.services.risk_engine import risk_engine
from app.services.oms_execution import oms_service
from app.services.reconciliation import recon_service
from app.services.market_data import market_data_service

logger = structlog.get_logger()


class EngineRunner:
    """
    Main trading engine orchestrator.
    
    Runs continuous cycles of:
    data -> signals -> risk -> execution -> reconciliation
    """
    
    def __init__(self):
        self._running = False
        self._paused_books: set = set()
        self._cycle_count = 0
        self._last_cycle_time: Optional[datetime] = None
        self._cycle_interval_seconds = 60  # 1 minute cycles
    
    async def start(self):
        """Start the engine loop."""
        self._running = True
        logger.info("engine_starting", paper_mode=settings.is_paper_mode)
        
        # Initialize services
        await market_data_service.initialize()
        await strategy_engine.load_strategies()
        
        # Start the main loop
        while self._running:
            try:
                await self.run_cycle()
                await asyncio.sleep(self._cycle_interval_seconds)
            except Exception as e:
                logger.error("engine_cycle_error", error=str(e))
                await asyncio.sleep(5)  # Short pause on error
    
    async def stop(self):
        """Stop the engine loop gracefully."""
        self._running = False
        logger.info("engine_stopping")
    
    async def run_cycle(self) -> Dict:
        """Execute one complete trading cycle."""
        cycle_start = datetime.utcnow()
        self._cycle_count += 1
        
        stats = {
            "cycle": self._cycle_count,
            "intents_generated": 0,
            "intents_approved": 0,
            "intents_rejected": 0,
            "orders_placed": 0,
            "errors": []
        }
        
        try:
            # 1. Update venue health
            await self._update_venue_health()
            
            # 2. Load books
            books = await self._load_books()
            
            # 3. Generate strategy intents
            intents = await strategy_engine.run_cycle(books)
            stats["intents_generated"] = len(intents)
            
            # 4. Risk check each intent
            for intent in intents:
                # Skip paused books
                if intent.book_id in self._paused_books:
                    continue
                
                book = next((b for b in books if b.id == intent.book_id), None)
                if not book:
                    continue
                
                # Skip meme monitoring intents (they're just for logging)
                if intent.metadata.get("monitoring_only"):
                    continue
                
                # Run risk check
                result = await risk_engine.check_intent(intent, book)
                
                if result.decision == RiskDecision.APPROVE:
                    stats["intents_approved"] += 1
                    
                    # Execute the intent
                    order = await self._execute_intent(intent, book)
                    if order:
                        stats["orders_placed"] += 1
                        
                elif result.decision == RiskDecision.REJECT:
                    stats["intents_rejected"] += 1
                    logger.info(
                        "intent_rejected",
                        intent_id=str(intent.id),
                        reasons=result.reasons
                    )
            
            # 5. Reconciliation
            await recon_service.run_reconciliation()
            
            # 6. Write position snapshots
            await self._write_position_snapshots()
            
        except Exception as e:
            stats["errors"].append(str(e))
            logger.error("cycle_error", error=str(e))
        
        # Record cycle stats
        self._last_cycle_time = datetime.utcnow()
        cycle_duration = (self._last_cycle_time - cycle_start).total_seconds()
        
        logger.info(
            "cycle_complete",
            cycle=self._cycle_count,
            duration_sec=cycle_duration,
            stats=stats
        )
        
        return stats
    
    async def _load_books(self) -> List[Book]:
        """Load active books from database."""
        try:
            supabase = get_supabase()
            result = supabase.table("books").select("*").eq("status", "active").execute()
            
            return [
                Book(
                    id=UUID(b["id"]),
                    name=b["name"],
                    type=b["type"],
                    capital_allocated=b["capital_allocated"],
                    current_exposure=b["current_exposure"],
                    max_drawdown_limit=b["max_drawdown_limit"],
                    risk_tier=b["risk_tier"],
                    status=b["status"]
                )
                for b in result.data
            ]
        except Exception as e:
            logger.error("books_load_failed", error=str(e))
            return []
    
    async def _update_venue_health(self):
        """Update venue health status in database."""
        try:
            for venue_name, adapter in oms_service._adapters.items():
                health = await adapter.health_check()
                
                supabase = get_supabase()
                
                # Find venue ID
                venue_result = supabase.table("venues").select("id").ilike(
                    "name", f"%{venue_name}%"
                ).limit(1).execute()
                
                if venue_result.data:
                    venue_id = venue_result.data[0]["id"]
                    
                    # Upsert venue health
                    supabase.table("venue_health").upsert({
                        "venue_id": venue_id,
                        "status": health.status.value,
                        "latency_ms": health.latency_ms,
                        "error_rate": health.error_rate,
                        "last_heartbeat": datetime.utcnow().isoformat(),
                        "order_success_rate": 100.0 - health.error_rate,
                        "metadata": {"paper_mode": settings.is_paper_mode}
                    }, on_conflict="venue_id").execute()
                    
                    # Also update venues table status
                    supabase.table("venues").update({
                        "status": health.status.value,
                        "latency_ms": health.latency_ms,
                        "error_rate": health.error_rate,
                        "last_heartbeat": datetime.utcnow().isoformat()
                    }).eq("id", venue_id).execute()
                    
        except Exception as e:
            logger.error("venue_health_update_failed", error=str(e))
    
    async def _execute_intent(self, intent: TradeIntent, book: Book) -> Optional[Order]:
        """Execute a trade intent via OMS."""
        try:
            order = await oms_service.execute_intent(intent)
            
            if order:
                # Update book exposure
                await self._update_book_exposure(book, order)
                
                # Write order to database
                await self._write_order(order)
                
            return order
            
        except Exception as e:
            logger.error("intent_execution_failed", error=str(e))
            return None
    
    async def _update_book_exposure(self, book: Book, order: Order):
        """Update book exposure after order fill."""
        try:
            supabase = get_supabase()
            
            # Calculate new exposure
            fill_value = order.filled_size * (order.filled_price or 0)
            
            if order.side == OrderSide.BUY:
                new_exposure = book.current_exposure + fill_value
            else:
                new_exposure = book.current_exposure - fill_value
            
            supabase.table("books").update({
                "current_exposure": max(0, new_exposure),
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", str(book.id)).execute()
            
        except Exception as e:
            logger.error("book_exposure_update_failed", error=str(e))
    
    async def _write_order(self, order: Order):
        """Write order to database."""
        try:
            supabase = get_supabase()
            supabase.table("orders").insert({
                "id": str(order.id) if order.id else None,
                "book_id": str(order.book_id),
                "strategy_id": str(order.strategy_id) if order.strategy_id else None,
                "venue_id": str(order.venue_id) if order.venue_id else None,
                "instrument": order.instrument,
                "side": order.side.value,
                "size": order.size,
                "price": order.price,
                "status": order.status.value,
                "filled_size": order.filled_size,
                "filled_price": order.filled_price,
                "slippage": order.slippage,
                "latency_ms": order.latency_ms,
            }).execute()
            
        except Exception as e:
            logger.error("order_write_failed", error=str(e))
    
    async def _write_position_snapshots(self):
        """Write current positions to database."""
        try:
            # Get positions from all adapters
            for venue_name, adapter in oms_service._adapters.items():
                positions = await adapter.get_positions()
                
                # In paper mode, we maintain positions in memory
                # For now, just log
                logger.debug(
                    "position_snapshot",
                    venue=venue_name,
                    count=len(positions)
                )
                
        except Exception as e:
            logger.error("position_snapshot_failed", error=str(e))
    
    async def pause_book(self, book_id: UUID, reason: str, user_id: Optional[str] = None):
        """Pause trading for a specific book."""
        self._paused_books.add(book_id)
        
        supabase = get_supabase()
        supabase.table("books").update({
            "status": "frozen"
        }).eq("id", str(book_id)).execute()
        
        await audit_log(
            action="book_paused",
            resource_type="book",
            resource_id=str(book_id),
            user_id=user_id,
            after_state={"status": "frozen", "reason": reason}
        )
        
        logger.info("book_paused", book_id=str(book_id), reason=reason)
    
    async def resume_book(self, book_id: UUID, user_id: Optional[str] = None):
        """Resume trading for a specific book."""
        self._paused_books.discard(book_id)
        
        supabase = get_supabase()
        supabase.table("books").update({
            "status": "active"
        }).eq("id", str(book_id)).execute()
        
        await audit_log(
            action="book_resumed",
            resource_type="book",
            resource_id=str(book_id),
            user_id=user_id,
            after_state={"status": "active"}
        )
        
        logger.info("book_resumed", book_id=str(book_id))
    
    def get_status(self) -> Dict:
        """Get engine status."""
        return {
            "running": self._running,
            "paper_mode": settings.is_paper_mode,
            "cycle_count": self._cycle_count,
            "last_cycle": self._last_cycle_time.isoformat() if self._last_cycle_time else None,
            "paused_books": [str(b) for b in self._paused_books],
            "adapters": list(oms_service._adapters.keys())
        }


# Singleton instance
engine_runner = EngineRunner()
