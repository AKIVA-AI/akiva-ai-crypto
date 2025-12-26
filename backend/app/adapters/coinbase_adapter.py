"""
Coinbase Advanced Trade Adapter
"""
import structlog
from typing import Dict, List
from datetime import datetime
from uuid import uuid4
import random

from app.adapters.base import VenueAdapter
from app.models.domain import Order, OrderStatus, VenueHealth, VenueStatus
from app.config import settings

logger = structlog.get_logger()


class CoinbaseAdapter(VenueAdapter):
    """Adapter for Coinbase Advanced Trade API."""
    
    def __init__(self):
        super().__init__(paper_mode=settings.is_paper_mode)
        self.name = "coinbase"
        self._connected = False
    
    async def connect(self) -> bool:
        if self.paper_mode:
            self._connected = True
            logger.info("coinbase_connected", mode="paper")
            return True
        
        # Real connection would use ccxt or direct API
        # For now, stub implementation
        self._connected = bool(settings.coinbase.api_key)
        return self._connected
    
    async def place_order(self, order: Order) -> Order:
        if self.paper_mode:
            return await self._simulate_fill(order)
        
        # Real implementation would use ccxt
        raise NotImplementedError("Live trading not implemented")
    
    async def _simulate_fill(self, order: Order) -> Order:
        """Simulate order fill in paper mode."""
        # Simulate slippage (0.05% to 0.2%)
        slippage_pct = random.uniform(0.0005, 0.002)
        base_price = order.price or 50000  # Default BTC price
        
        if order.side.value == "buy":
            fill_price = base_price * (1 + slippage_pct)
        else:
            fill_price = base_price * (1 - slippage_pct)
        
        order.status = OrderStatus.FILLED
        order.filled_size = order.size
        order.filled_price = fill_price
        order.slippage = slippage_pct * 100
        order.venue_order_id = f"paper-{uuid4().hex[:8]}"
        
        logger.info("paper_order_filled", order_id=str(order.id), price=fill_price)
        return order
    
    async def cancel_order(self, venue_order_id: str) -> bool:
        if self.paper_mode:
            return True
        raise NotImplementedError()
    
    async def get_balance(self) -> Dict[str, float]:
        if self.paper_mode:
            return {"USD": 100000, "BTC": 1.5, "ETH": 10.0}
        raise NotImplementedError()
    
    async def get_positions(self) -> List[Dict]:
        if self.paper_mode:
            return []
        raise NotImplementedError()
    
    async def health_check(self) -> VenueHealth:
        return VenueHealth(
            venue_id=uuid4(),
            name=self.name,
            status=VenueStatus.HEALTHY if self._connected else VenueStatus.DOWN,
            latency_ms=random.randint(20, 100) if self.paper_mode else 0,
            error_rate=0.0,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True
        )
