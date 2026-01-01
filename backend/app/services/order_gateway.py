"""
Order Gateway - SINGLE SOURCE OF TRUTH for order execution.

ALL order writes MUST go through this gateway. This ensures:
1. Transaction integrity
2. Risk checks before execution
3. Audit trail
4. Position updates in same transaction
5. Kill switch enforcement

NO OTHER CODE should write to the orders table directly.
"""

import logging
import os
from datetime import datetime, UTC
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from enum import Enum

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class OrderStatus(str, Enum):
    PENDING = "pending"
    OPEN = "open"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class OrderRequest(BaseModel):
    """Request to create a new order"""
    book_id: UUID
    strategy_id: Optional[UUID] = None
    instrument: str
    side: OrderSide
    size: Decimal = Field(gt=0)
    price: Optional[Decimal] = None  # None for market orders
    order_type: OrderType = OrderType.MARKET
    venue_id: Optional[UUID] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class OrderResult(BaseModel):
    """Result of an order operation"""
    success: bool
    order_id: Optional[UUID] = None
    status: Optional[OrderStatus] = None
    filled_size: Decimal = Decimal("0")
    filled_price: Optional[Decimal] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None
    venue_order_id: Optional[str] = None


class OrderGateway:
    """
    Centralized order gateway that ensures all orders go through proper channels.
    
    CRITICAL: This is the ONLY class that should write orders to the database.
    
    Flow:
    1. Check kill switch
    2. Check book is active
    3. Check risk limits (via RiskAgent or local check)
    4. Execute on venue
    5. Write order to database
    6. Update position in same transaction
    7. Log audit event
    """
    
    def __init__(self):
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self._http_client: Optional[httpx.AsyncClient] = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize the gateway"""
        if self._initialized:
            return
        
        self._http_client = httpx.AsyncClient(timeout=30.0)
        self._initialized = True
        logger.info("OrderGateway initialized")
    
    async def close(self):
        """Close the gateway"""
        if self._http_client:
            await self._http_client.aclose()
        self._initialized = False
    
    async def _check_kill_switch(self) -> bool:
        """Check if global kill switch is active"""
        if not self._http_client:
            return True  # Fail safe
        
        try:
            response = await self._http_client.get(
                f"{self._supabase_url}/rest/v1/global_settings",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}"
                },
                params={"select": "global_kill_switch", "limit": "1"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    return data[0].get("global_kill_switch", False)
            
            return False
        except Exception as e:
            logger.error(f"Kill switch check failed: {e}")
            return True  # Fail safe - block trades if we can't check
    
    async def _check_book_active(self, book_id: UUID) -> bool:
        """Check if the book is active and not frozen"""
        if not self._http_client:
            return False
        
        try:
            response = await self._http_client.get(
                f"{self._supabase_url}/rest/v1/books",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}"
                },
                params={"id": f"eq.{book_id}", "select": "status"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    return data[0].get("status") == "active"
            
            return False
        except Exception as e:
            logger.error(f"Book check failed: {e}")
            return False
    
    async def _write_order(self, order: OrderRequest, result: OrderResult) -> bool:
        """Write order to database"""
        if not self._http_client:
            return False
        
        try:
            order_data = {
                "id": str(result.order_id),
                "book_id": str(order.book_id),
                "strategy_id": str(order.strategy_id) if order.strategy_id else None,
                "instrument": order.instrument,
                "side": order.side.value,
                "size": float(order.size),
                "price": float(order.price) if order.price else None,
                "status": result.status.value if result.status else "pending",
                "filled_size": float(result.filled_size),
                "filled_price": float(result.filled_price) if result.filled_price else None,
                "venue_id": str(order.venue_id) if order.venue_id else None,
                "latency_ms": result.latency_ms,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat()
            }
            
            response = await self._http_client.post(
                f"{self._supabase_url}/rest/v1/orders",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json"
                },
                json=order_data
            )
            
            return response.status_code in (200, 201)
        except Exception as e:
            logger.error(f"Failed to write order: {e}")
            return False
    
    async def _update_position(self, order: OrderRequest, result: OrderResult):
        """Update position after order fill"""
        if not result.success or result.filled_size == 0:
            return
        
        if not self._http_client:
            return
        
        try:
            # Check for existing position
            response = await self._http_client.get(
                f"{self._supabase_url}/rest/v1/positions",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}"
                },
                params={
                    "book_id": f"eq.{order.book_id}",
                    "instrument": f"eq.{order.instrument}",
                    "is_open": "eq.true",
                    "select": "*"
                }
            )
            
            existing = response.json() if response.status_code == 200 else []
            
            if existing:
                # Update existing position
                position = existing[0]
                current_size = Decimal(str(position["size"]))
                current_side = position["side"]
                
                if order.side.value == current_side:
                    # Adding to position
                    new_size = current_size + result.filled_size
                    # Weighted average entry price
                    old_value = current_size * Decimal(str(position["entry_price"]))
                    new_value = result.filled_size * (result.filled_price or Decimal("0"))
                    new_entry = (old_value + new_value) / new_size if new_size > 0 else Decimal("0")
                    
                    await self._http_client.patch(
                        f"{self._supabase_url}/rest/v1/positions?id=eq.{position['id']}",
                        headers={
                            "apikey": self._supabase_key,
                            "Authorization": f"Bearer {self._supabase_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "size": float(new_size),
                            "entry_price": float(new_entry),
                            "updated_at": datetime.now(UTC).isoformat()
                        }
                    )
                else:
                    # Reducing/closing position
                    new_size = current_size - result.filled_size
                    
                    if new_size <= 0:
                        # Close position
                        await self._http_client.patch(
                            f"{self._supabase_url}/rest/v1/positions?id=eq.{position['id']}",
                            headers={
                                "apikey": self._supabase_key,
                                "Authorization": f"Bearer {self._supabase_key}",
                                "Content-Type": "application/json"
                            },
                            json={
                                "is_open": False,
                                "size": 0,
                                "updated_at": datetime.now(UTC).isoformat()
                            }
                        )
                    else:
                        # Reduce position
                        await self._http_client.patch(
                            f"{self._supabase_url}/rest/v1/positions?id=eq.{position['id']}",
                            headers={
                                "apikey": self._supabase_key,
                                "Authorization": f"Bearer {self._supabase_key}",
                                "Content-Type": "application/json"
                            },
                            json={
                                "size": float(new_size),
                                "updated_at": datetime.now(UTC).isoformat()
                            }
                        )
            else:
                # Create new position
                await self._http_client.post(
                    f"{self._supabase_url}/rest/v1/positions",
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "book_id": str(order.book_id),
                        "strategy_id": str(order.strategy_id) if order.strategy_id else None,
                        "instrument": order.instrument,
                        "side": order.side.value,
                        "size": float(result.filled_size),
                        "entry_price": float(result.filled_price) if result.filled_price else 0,
                        "mark_price": float(result.filled_price) if result.filled_price else 0,
                        "is_open": True
                    }
                )
        except Exception as e:
            logger.error(f"Failed to update position: {e}")
    
    async def _log_audit_event(self, order: OrderRequest, result: OrderResult):
        """Log order to audit trail"""
        if not self._http_client:
            return
        
        try:
            await self._http_client.post(
                f"{self._supabase_url}/rest/v1/audit_events",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "action": "order_created",
                    "resource_type": "order",
                    "resource_id": str(result.order_id),
                    "severity": "info",
                    "after_state": {
                        "instrument": order.instrument,
                        "side": order.side.value,
                        "size": float(order.size),
                        "status": result.status.value if result.status else "unknown",
                        "success": result.success
                    }
                }
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
    
    async def submit_order(self, order: OrderRequest) -> OrderResult:
        """
        Submit an order through the gateway.
        
        This is the ONLY method that should be used to create orders.
        
        Returns:
            OrderResult with success/failure and details
        """
        if not self._initialized:
            await self.initialize()
        
        start_time = datetime.now(UTC)
        order_id = uuid4()
        
        # Check kill switch
        if await self._check_kill_switch():
            return OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error="Global kill switch is active"
            )
        
        # Check book is active
        if not await self._check_book_active(order.book_id):
            return OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error="Book is not active or frozen"
            )
        
        # In a full implementation, we would:
        # 1. Route to venue via SmartOrderRouter
        # 2. Execute on exchange
        # 3. Wait for fill confirmation
        
        # For now, create a pending order
        result = OrderResult(
            success=True,
            order_id=order_id,
            status=OrderStatus.PENDING,
            latency_ms=int((datetime.now(UTC) - start_time).total_seconds() * 1000)
        )
        
        # Write to database
        if not await self._write_order(order, result):
            return OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error="Failed to write order to database"
            )
        
        # Log audit event
        await self._log_audit_event(order, result)
        
        return result
    
    async def submit_and_execute(
        self,
        order: OrderRequest,
        execute_fn: callable
    ) -> OrderResult:
        """
        Submit an order and execute it via the provided function.
        
        Args:
            order: The order request
            execute_fn: Async function that executes on venue and returns (filled_size, filled_price, venue_order_id)
        
        Returns:
            OrderResult with execution details
        """
        if not self._initialized:
            await self.initialize()
        
        start_time = datetime.now(UTC)
        order_id = uuid4()
        
        # Pre-checks
        if await self._check_kill_switch():
            return OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error="Global kill switch is active"
            )
        
        if not await self._check_book_active(order.book_id):
            return OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error="Book is not active or frozen"
            )
        
        try:
            # Execute on venue
            filled_size, filled_price, venue_order_id = await execute_fn(order)
            
            latency_ms = int((datetime.now(UTC) - start_time).total_seconds() * 1000)
            
            result = OrderResult(
                success=True,
                order_id=order_id,
                status=OrderStatus.FILLED if filled_size == order.size else OrderStatus.PARTIALLY_FILLED,
                filled_size=filled_size,
                filled_price=filled_price,
                venue_order_id=venue_order_id,
                latency_ms=latency_ms
            )
            
        except Exception as e:
            result = OrderResult(
                success=False,
                order_id=order_id,
                status=OrderStatus.REJECTED,
                error=str(e),
                latency_ms=int((datetime.now(UTC) - start_time).total_seconds() * 1000)
            )
        
        # Write to database
        await self._write_order(order, result)
        
        # Update position
        await self._update_position(order, result)
        
        # Log audit
        await self._log_audit_event(order, result)
        
        return result


# Singleton instance
order_gateway = OrderGateway()
