"""
Base Venue Adapter - Interface for all venue implementations.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from app.models.domain import Order, VenueHealth, Position


class VenueAdapter(ABC):
    """Abstract base class for venue adapters."""
    
    def __init__(self, paper_mode: bool = True):
        self.paper_mode = paper_mode
        self.name: str = "base"
    
    @abstractmethod
    async def connect(self) -> bool:
        """Establish connection to venue."""
        pass
    
    @abstractmethod
    async def place_order(self, order: Order) -> Order:
        """Submit order to venue."""
        pass
    
    @abstractmethod
    async def cancel_order(self, venue_order_id: str) -> bool:
        """Cancel an order."""
        pass
    
    @abstractmethod
    async def get_balance(self) -> Dict[str, float]:
        """Get account balances."""
        pass
    
    @abstractmethod
    async def get_positions(self) -> List[Dict]:
        """Get open positions."""
        pass
    
    @abstractmethod
    async def health_check(self) -> VenueHealth:
        """Check venue connectivity."""
        pass
