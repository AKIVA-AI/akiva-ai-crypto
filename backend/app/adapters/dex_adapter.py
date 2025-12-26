"""
DEX Aggregator Adapter - For 0x/1inch style execution
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


class DEXAdapter(VenueAdapter):
    """Adapter for DEX aggregator (0x/1inch style)."""
    
    def __init__(self):
        super().__init__(paper_mode=settings.is_paper_mode)
        self.name = "dex"
        self._connected = False
    
    async def connect(self) -> bool:
        if self.paper_mode:
            self._connected = True
            return True
        self._connected = bool(settings.dex.api_key and settings.dex_rpc_url)
        return self._connected
    
    async def place_order(self, order: Order) -> Order:
        if self.paper_mode:
            # DEX has higher slippage
            slippage = random.uniform(0.002, 0.01)
            base_price = order.price or 3000  # ETH default
            fill_price = base_price * (1 + slippage if order.side.value == "buy" else 1 - slippage)
            
            order.status = OrderStatus.FILLED
            order.filled_size = order.size
            order.filled_price = fill_price
            order.slippage = slippage * 100
            order.venue_order_id = f"dex-{uuid4().hex[:8]}"
            order.latency_ms = random.randint(2000, 15000)  # Block confirmation
            return order
        raise NotImplementedError()
    
    async def cancel_order(self, venue_order_id: str) -> bool:
        return False  # DEX orders typically can't be cancelled
    
    async def get_balance(self) -> Dict[str, float]:
        return {"ETH": 5.0, "USDC": 10000} if self.paper_mode else {}
    
    async def get_positions(self) -> List[Dict]:
        return []
    
    async def health_check(self) -> VenueHealth:
        return VenueHealth(
            venue_id=uuid4(), name=self.name,
            status=VenueStatus.HEALTHY if self._connected else VenueStatus.DOWN,
            latency_ms=random.randint(1000, 5000), error_rate=0.0,
            last_heartbeat=datetime.utcnow(), is_enabled=True
        )
