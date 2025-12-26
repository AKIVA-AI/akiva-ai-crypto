"""
Core domain models for the trading engine.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


class BookType(str, Enum):
    HEDGE = "hedge"
    PROP = "prop"
    MEME = "meme"


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderStatus(str, Enum):
    OPEN = "open"
    FILLED = "filled"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class StrategyStatus(str, Enum):
    OFF = "off"
    PAPER = "paper"
    LIVE = "live"


class RiskDecision(str, Enum):
    APPROVE = "approve"
    MODIFY = "modify"
    REJECT = "reject"


class VenueStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"


# === Instrument ===

class Instrument(BaseModel):
    """Unified instrument representation across venues."""
    symbol: str  # e.g., "BTC-USD"
    base_asset: str  # e.g., "BTC"
    quote_asset: str  # e.g., "USD"
    asset_class: str = "crypto"
    venue: str
    tick_size: float = 0.01
    lot_size: float = 0.0001
    min_notional: float = 10.0
    maker_fee: float = 0.001
    taker_fee: float = 0.002
    margin_enabled: bool = False
    max_leverage: float = 1.0


# === Trade Intent ===

class TradeIntent(BaseModel):
    """
    A proposal from a strategy for a trade.
    Agents/strategies produce these; only the OMS can execute actual orders.
    """
    id: Optional[UUID] = None
    book_id: UUID
    strategy_id: UUID
    instrument: str
    direction: OrderSide
    target_exposure_usd: float
    max_loss_usd: float
    invalidation_price: Optional[float] = None
    horizon_minutes: int = 60
    confidence: float = Field(ge=0.0, le=1.0)
    liquidity_requirement: str = "normal"  # normal, high, low
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# === Risk Check Result ===

class RiskCheckResult(BaseModel):
    """Result of risk engine evaluation."""
    decision: RiskDecision
    intent_id: Optional[UUID] = None
    original_intent: Optional[TradeIntent] = None
    modified_intent: Optional[TradeIntent] = None
    reasons: List[str] = Field(default_factory=list)
    checks_passed: List[str] = Field(default_factory=list)
    checks_failed: List[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# === Order ===

class Order(BaseModel):
    """An order to be executed on a venue."""
    id: Optional[UUID] = None
    book_id: UUID
    strategy_id: Optional[UUID] = None
    venue_id: Optional[UUID] = None
    instrument: str
    side: OrderSide
    size: float
    price: Optional[float] = None  # None = market order
    order_type: str = "market"  # market, limit
    status: OrderStatus = OrderStatus.OPEN
    filled_size: float = 0.0
    filled_price: Optional[float] = None
    slippage: Optional[float] = None
    latency_ms: Optional[int] = None
    venue_order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# === Position ===

class Position(BaseModel):
    """A trading position."""
    id: Optional[UUID] = None
    book_id: UUID
    strategy_id: Optional[UUID] = None
    venue_id: Optional[UUID] = None
    instrument: str
    side: OrderSide
    size: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    leverage: float = 1.0
    liquidation_price: Optional[float] = None
    is_open: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# === Venue Health ===

class VenueHealth(BaseModel):
    """Health status of a trading venue."""
    venue_id: UUID
    name: str
    status: VenueStatus
    latency_ms: int
    error_rate: float
    last_heartbeat: datetime
    is_enabled: bool = True
    supported_instruments: List[str] = Field(default_factory=list)


# === Book ===

class Book(BaseModel):
    """A trading book with capital allocation."""
    id: UUID
    name: str
    type: BookType
    capital_allocated: float
    current_exposure: float
    max_drawdown_limit: float
    risk_tier: int = 1
    status: str = "active"


# === Meme Project ===

class MemeProjectStage(str, Enum):
    OPPORTUNITY = "opportunity"
    DUE_DILIGENCE = "due_diligence"
    APPROVED = "approved"
    LIVE = "live"
    EXITING = "exiting"
    CLOSED = "closed"


class MemeProject(BaseModel):
    """A meme coin venture project."""
    id: Optional[UUID] = None
    name: str
    ticker: str
    stage: MemeProjectStage = MemeProjectStage.OPPORTUNITY
    viral_score: float = 0.0
    social_velocity: float = 0.0
    holder_concentration: float = 0.0
    liquidity_signal: Optional[str] = None
    narrative_tags: List[str] = Field(default_factory=list)
    go_no_go_approved: bool = False
    approved_by: Optional[UUID] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
