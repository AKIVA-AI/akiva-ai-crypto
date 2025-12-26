"""
Portfolio Engine - Capital allocation and position sizing.
"""
import structlog
from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime

from app.models.domain import Book, BookType, Position, TradeIntent
from app.config import settings
from app.database import get_supabase, audit_log

logger = structlog.get_logger()


class PortfolioEngine:
    """
    Manages capital allocation across books and risk tiers.
    
    Responsibilities:
    - Allocate capital by book (HEDGE, PROP, MEME with hard separation)
    - Risk tier allocation within books
    - Volatility targeting for hedge book
    - Position sizing rules
    """
    
    # Risk tier allocation weights
    TIER_WEIGHTS = {
        1: 0.60,  # Tier 1: 60% of book capital (safest strategies)
        2: 0.30,  # Tier 2: 30% (moderate risk)
        3: 0.10,  # Tier 3: 10% (high risk / experimental)
    }
    
    # Book type constraints
    BOOK_CONSTRAINTS = {
        BookType.HEDGE: {
            "max_leverage": 1.5,
            "target_vol": 0.10,  # 10% annualized volatility target
            "max_single_position": 0.15,  # 15% of book
        },
        BookType.PROP: {
            "max_leverage": 3.0,
            "target_vol": 0.25,  # 25% annualized
            "max_single_position": 0.20,
        },
        BookType.MEME: {
            "max_leverage": 1.0,  # No leverage on meme
            "target_vol": None,  # No vol target (high risk accepted)
            "max_single_position": 0.10,  # Smaller positions, higher diversification
        },
    }
    
    def __init__(self):
        self._books_cache: Dict[UUID, Book] = {}
        self._vol_estimates: Dict[str, float] = {}
    
    async def get_books(self) -> List[Book]:
        """Fetch all trading books."""
        supabase = get_supabase()
        result = supabase.table("books").select("*").execute()
        
        books = []
        for row in result.data:
            book = Book(
                id=row["id"],
                name=row["name"],
                type=BookType(row["type"]),
                capital_allocated=float(row["capital_allocated"]),
                current_exposure=float(row["current_exposure"]),
                max_drawdown_limit=float(row["max_drawdown_limit"]),
                risk_tier=row["risk_tier"],
                status=row["status"]
            )
            books.append(book)
            self._books_cache[book.id] = book
        
        return books
    
    async def get_book(self, book_id: UUID) -> Optional[Book]:
        """Get a specific book by ID."""
        if book_id in self._books_cache:
            return self._books_cache[book_id]
        
        supabase = get_supabase()
        result = supabase.table("books").select("*").eq("id", str(book_id)).single().execute()
        
        if result.data:
            book = Book(
                id=result.data["id"],
                name=result.data["name"],
                type=BookType(result.data["type"]),
                capital_allocated=float(result.data["capital_allocated"]),
                current_exposure=float(result.data["current_exposure"]),
                max_drawdown_limit=float(result.data["max_drawdown_limit"]),
                risk_tier=result.data["risk_tier"],
                status=result.data["status"]
            )
            self._books_cache[book.id] = book
            return book
        
        return None
    
    def calculate_position_size(
        self,
        intent: TradeIntent,
        book: Book,
        current_positions: List[Position],
        volatility: Optional[float] = None
    ) -> float:
        """
        Calculate appropriate position size based on:
        - Book type constraints
        - Risk tier allocation
        - Volatility targeting (for hedge book)
        - Current exposure
        """
        book_type = BookType(book.type) if isinstance(book.type, str) else book.type
        constraints = self.BOOK_CONSTRAINTS.get(book_type, self.BOOK_CONSTRAINTS[BookType.PROP])
        
        # Get tier allocation
        tier_weight = self.TIER_WEIGHTS.get(book.risk_tier, 0.1)
        tier_capital = book.capital_allocated * tier_weight
        
        # Calculate available capital in this tier
        tier_exposure = self._get_tier_exposure(current_positions, book.risk_tier)
        available_capital = tier_capital - tier_exposure
        
        # Apply max single position constraint
        max_position = book.capital_allocated * constraints["max_single_position"]
        
        # Start with requested exposure
        position_size = intent.target_exposure_usd
        
        # Apply volatility targeting for hedge book
        if constraints.get("target_vol") and volatility:
            vol_scalar = constraints["target_vol"] / volatility if volatility > 0 else 1.0
            position_size = position_size * min(vol_scalar, 1.5)  # Cap scaling at 1.5x
        
        # Apply constraints
        position_size = min(
            position_size,
            max_position,
            available_capital,
            settings.risk.max_position_size_usd
        )
        
        # Ensure non-negative
        position_size = max(0, position_size)
        
        logger.info(
            "position_size_calculated",
            requested=intent.target_exposure_usd,
            final=position_size,
            book_id=str(book.id),
            tier=book.risk_tier
        )
        
        return position_size
    
    def _get_tier_exposure(self, positions: List[Position], tier: int) -> float:
        """Calculate total exposure for a risk tier."""
        # In a full implementation, we'd track tier per position
        # For now, assume all positions in tier
        return sum(
            p.size * p.mark_price
            for p in positions
            if p.is_open
        )
    
    async def reallocate_capital(
        self,
        book_id: UUID,
        new_capital: float,
        user_id: str
    ) -> Book:
        """
        Reallocate capital to a book.
        Requires Admin/CIO role (checked at API layer).
        """
        supabase = get_supabase()
        
        # Get current state for audit
        current = await self.get_book(book_id)
        if not current:
            raise ValueError(f"Book {book_id} not found")
        
        # Update the book
        result = supabase.table("books").update({
            "capital_allocated": new_capital,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", str(book_id)).execute()
        
        # Audit the change
        await audit_log(
            action="capital_reallocated",
            resource_type="book",
            resource_id=str(book_id),
            user_id=user_id,
            before_state={"capital_allocated": current.capital_allocated},
            after_state={"capital_allocated": new_capital},
            book_id=str(book_id)
        )
        
        # Invalidate cache
        if book_id in self._books_cache:
            del self._books_cache[book_id]
        
        logger.info(
            "capital_reallocated",
            book_id=str(book_id),
            old_capital=current.capital_allocated,
            new_capital=new_capital,
            user_id=user_id
        )
        
        return await self.get_book(book_id)
    
    async def update_book_exposure(self, book_id: UUID, exposure_delta: float):
        """Update a book's current exposure after a trade."""
        supabase = get_supabase()
        
        book = await self.get_book(book_id)
        if not book:
            raise ValueError(f"Book {book_id} not found")
        
        new_exposure = book.current_exposure + exposure_delta
        
        supabase.table("books").update({
            "current_exposure": new_exposure,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", str(book_id)).execute()
        
        # Invalidate cache
        if book_id in self._books_cache:
            del self._books_cache[book_id]
        
        logger.debug(
            "book_exposure_updated",
            book_id=str(book_id),
            delta=exposure_delta,
            new_exposure=new_exposure
        )
    
    def validate_book_isolation(self, from_book: Book, to_book: Book) -> bool:
        """
        Ensure MEME book losses cannot impact other books.
        Returns False if cross-contamination is detected.
        """
        # MEME book is fully isolated
        if from_book.type == BookType.MEME or to_book.type == BookType.MEME:
            if from_book.id != to_book.id:
                logger.warning(
                    "book_isolation_violation_prevented",
                    from_book=str(from_book.id),
                    to_book=str(to_book.id)
                )
                return False
        return True


# Singleton instance
portfolio_engine = PortfolioEngine()
