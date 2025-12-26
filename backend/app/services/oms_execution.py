"""
OMS Execution Service - Order management and venue routing.
"""
import structlog
from typing import Dict, List, Optional
from uuid import UUID, uuid4
from datetime import datetime
import asyncio

from app.models.domain import (
    Order, OrderSide, OrderStatus, TradeIntent, 
    RiskCheckResult, RiskDecision, VenueHealth
)
from app.config import settings
from app.database import get_supabase, audit_log, create_alert
from app.services.risk_engine import risk_engine
from app.services.portfolio_engine import portfolio_engine

logger = structlog.get_logger()


class OMSExecutionService:
    """
    Order Management System and Execution Service.
    
    Responsibilities:
    - Convert approved intents to orders
    - Route orders to appropriate venues
    - Track order lifecycle
    - Handle fills and partial fills
    - Manage reduce-only and cancel operations
    """
    
    def __init__(self):
        self._adapters: Dict[str, 'VenueAdapter'] = {}
        self._pending_orders: Dict[UUID, Order] = {}
    
    def register_adapter(self, venue_name: str, adapter: 'VenueAdapter'):
        """Register a venue adapter."""
        self._adapters[venue_name.lower()] = adapter
        logger.info("venue_adapter_registered", venue=venue_name)
    
    async def execute_intent(
        self,
        intent: TradeIntent,
        venue_id: UUID,
        venue_name: str
    ) -> Optional[Order]:
        """
        Execute a trade intent through risk checks and venue execution.
        
        Flow:
        1. Get book and positions
        2. Run risk checks
        3. Size the position
        4. Create and submit order
        5. Track and return result
        """
        # Get book
        book = await portfolio_engine.get_book(intent.book_id)
        if not book:
            logger.error("book_not_found", book_id=str(intent.book_id))
            return None
        
        if book.status != "active":
            logger.warning("book_not_active", book_id=str(intent.book_id), status=book.status)
            return None
        
        # Get venue health
        venue_health = await self._get_venue_health(venue_id)
        
        # Get current positions for this book
        positions = await self._get_book_positions(intent.book_id)
        
        # Run risk checks
        risk_result = await risk_engine.check_intent(
            intent=intent,
            book=book,
            venue_health=venue_health,
            current_positions=positions
        )
        
        if risk_result.decision == RiskDecision.REJECT:
            logger.warning(
                "intent_rejected",
                intent_id=str(intent.id),
                reasons=risk_result.reasons
            )
            await self._log_rejected_intent(intent, risk_result)
            return None
        
        # Calculate position size
        position_size = portfolio_engine.calculate_position_size(
            intent=intent,
            book=book,
            current_positions=positions
        )
        
        if position_size <= 0:
            logger.warning("zero_position_size", intent_id=str(intent.id))
            return None
        
        # Create order
        order = Order(
            id=uuid4(),
            book_id=intent.book_id,
            strategy_id=intent.strategy_id,
            venue_id=venue_id,
            instrument=intent.instrument,
            side=intent.direction,
            size=position_size,
            order_type="market",
            status=OrderStatus.OPEN
        )
        
        # Execute via adapter
        adapter = self._adapters.get(venue_name.lower())
        if not adapter:
            logger.error("no_adapter_for_venue", venue=venue_name)
            return None
        
        try:
            # Submit order
            start_time = datetime.utcnow()
            executed_order = await adapter.place_order(order)
            latency = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            executed_order.latency_ms = int(latency)
            
            # Save to database
            await self._save_order(executed_order)
            
            # Update book exposure
            if executed_order.status in [OrderStatus.FILLED, OrderStatus.PARTIAL]:
                exposure_delta = executed_order.filled_size * (executed_order.filled_price or 0)
                if executed_order.side == OrderSide.SELL:
                    exposure_delta = -exposure_delta
                await portfolio_engine.update_book_exposure(book.id, exposure_delta)
            
            logger.info(
                "order_executed",
                order_id=str(executed_order.id),
                status=executed_order.status.value,
                latency_ms=latency
            )
            
            return executed_order
            
        except Exception as e:
            logger.error("order_execution_failed", error=str(e), intent_id=str(intent.id))
            order.status = OrderStatus.REJECTED
            await self._save_order(order)
            return order
    
    async def place_order(
        self,
        book_id: UUID,
        venue_name: str,
        instrument: str,
        side: OrderSide,
        size: float,
        price: Optional[float] = None,
        order_type: str = "market",
        strategy_id: Optional[UUID] = None
    ) -> Optional[Order]:
        """
        Direct order placement (for manual trades).
        Still goes through risk checks.
        """
        # Create a synthetic intent for risk checking
        intent = TradeIntent(
            id=uuid4(),
            book_id=book_id,
            strategy_id=strategy_id or uuid4(),
            instrument=instrument,
            direction=side,
            target_exposure_usd=size * (price or 1.0),
            max_loss_usd=size * (price or 1.0) * 0.05,  # Default 5% max loss
            confidence=1.0
        )
        
        # Get venue ID
        venue_id = await self._get_venue_id(venue_name)
        if not venue_id:
            logger.error("venue_not_found", venue=venue_name)
            return None
        
        return await self.execute_intent(intent, venue_id, venue_name)
    
    async def cancel_order(self, order_id: UUID, venue_name: str) -> bool:
        """Cancel an open order."""
        adapter = self._adapters.get(venue_name.lower())
        if not adapter:
            logger.error("no_adapter_for_venue", venue=venue_name)
            return False
        
        try:
            # Get order from DB
            supabase = get_supabase()
            result = supabase.table("orders").select("*").eq("id", str(order_id)).single().execute()
            
            if not result.data:
                logger.error("order_not_found", order_id=str(order_id))
                return False
            
            venue_order_id = result.data.get("venue_order_id")
            if not venue_order_id:
                # Order may not have been submitted yet
                supabase.table("orders").update({
                    "status": "cancelled"
                }).eq("id", str(order_id)).execute()
                return True
            
            # Cancel on venue
            success = await adapter.cancel_order(venue_order_id)
            
            if success:
                supabase.table("orders").update({
                    "status": "cancelled",
                    "updated_at": datetime.utcnow().isoformat()
                }).eq("id", str(order_id)).execute()
                
                logger.info("order_cancelled", order_id=str(order_id))
                
            return success
            
        except Exception as e:
            logger.error("order_cancel_failed", error=str(e), order_id=str(order_id))
            return False
    
    async def set_reduce_only(self, book_id: UUID, reason: str):
        """
        Set a book to reduce-only mode.
        All new orders will be rejected; only closing orders allowed.
        """
        supabase = get_supabase()
        
        supabase.table("books").update({
            "status": "reduce_only",
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", str(book_id)).execute()
        
        await create_alert(
            title="Book Set to Reduce-Only",
            message=f"Book {book_id} is now in reduce-only mode: {reason}",
            severity="warning",
            source="oms"
        )
        
        logger.warning("book_reduce_only", book_id=str(book_id), reason=reason)
    
    async def _get_venue_health(self, venue_id: UUID) -> Optional[VenueHealth]:
        """Get venue health status."""
        supabase = get_supabase()
        result = supabase.table("venues").select("*").eq("id", str(venue_id)).single().execute()
        
        if result.data:
            from app.models.domain import VenueStatus
            return VenueHealth(
                venue_id=result.data["id"],
                name=result.data["name"],
                status=VenueStatus(result.data["status"]),
                latency_ms=result.data["latency_ms"],
                error_rate=float(result.data["error_rate"]),
                last_heartbeat=result.data["last_heartbeat"],
                is_enabled=result.data["is_enabled"]
            )
        return None
    
    async def _get_venue_id(self, venue_name: str) -> Optional[UUID]:
        """Get venue ID by name."""
        supabase = get_supabase()
        result = supabase.table("venues").select("id").ilike("name", venue_name).single().execute()
        if result.data:
            return UUID(result.data["id"])
        return None
    
    async def _get_book_positions(self, book_id: UUID) -> List:
        """Get open positions for a book."""
        supabase = get_supabase()
        result = supabase.table("positions").select("*").eq("book_id", str(book_id)).eq("is_open", True).execute()
        
        from app.models.domain import Position
        positions = []
        for row in result.data:
            positions.append(Position(
                id=row["id"],
                book_id=row["book_id"],
                instrument=row["instrument"],
                side=OrderSide(row["side"]),
                size=float(row["size"]),
                entry_price=float(row["entry_price"]),
                mark_price=float(row["mark_price"]),
                unrealized_pnl=float(row["unrealized_pnl"]),
                is_open=row["is_open"]
            ))
        return positions
    
    async def _save_order(self, order: Order):
        """Save order to database."""
        supabase = get_supabase()
        supabase.table("orders").upsert({
            "id": str(order.id),
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
            "updated_at": datetime.utcnow().isoformat()
        }).execute()
    
    async def _log_rejected_intent(self, intent: TradeIntent, result: RiskCheckResult):
        """Log a rejected intent for analysis."""
        await audit_log(
            action="intent_rejected",
            resource_type="trade_intent",
            resource_id=str(intent.id),
            book_id=str(intent.book_id),
            after_state={
                "reasons": result.reasons,
                "checks_failed": result.checks_failed
            }
        )


# Singleton instance
oms_service = OMSExecutionService()


# Base adapter interface
class VenueAdapter:
    """Base class for venue adapters."""
    
    async def place_order(self, order: Order) -> Order:
        raise NotImplementedError
    
    async def cancel_order(self, venue_order_id: str) -> bool:
        raise NotImplementedError
    
    async def get_balance(self) -> Dict:
        raise NotImplementedError
    
    async def get_positions(self) -> List:
        raise NotImplementedError
    
    async def health_check(self) -> VenueHealth:
        raise NotImplementedError
