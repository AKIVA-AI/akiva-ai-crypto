"""
Strategy Intent Engine - Strategy templates that produce TradeIntents.

Strategies propose intents; they never execute orders directly.
"""
import structlog
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from uuid import UUID, uuid4
from enum import Enum
import random

from app.models.domain import TradeIntent, OrderSide, Book
from app.services.market_data import market_data_service
from app.database import get_supabase

logger = structlog.get_logger()


class MarketRegime(str, Enum):
    """Simple market regime classification."""
    TRENDING_UP = "trending_up"
    TRENDING_DOWN = "trending_down"
    RANGING = "ranging"
    HIGH_VOLATILITY = "high_volatility"
    LOW_VOLATILITY = "low_volatility"


class BaseStrategy:
    """Base class for all strategy implementations."""
    
    def __init__(self, strategy_id: UUID, book_id: UUID, config: Dict = None):
        self.strategy_id = strategy_id
        self.book_id = book_id
        self.config = config or {}
        self.name = "base_strategy"
        self.asset_class = "crypto"
        self.risk_model_version = "1.0.0"
    
    async def generate_intent(
        self,
        instrument: str,
        venue: str,
        book: Book,
        market_data: Dict
    ) -> Optional[TradeIntent]:
        """Generate a trade intent based on market conditions."""
        raise NotImplementedError()
    
    def _create_intent(
        self,
        instrument: str,
        direction: OrderSide,
        target_exposure: float,
        max_loss: float,
        confidence: float,
        invalidation_price: Optional[float] = None,
        horizon_minutes: int = 60,
        metadata: Dict = None
    ) -> TradeIntent:
        """Helper to create a properly formatted TradeIntent."""
        return TradeIntent(
            id=uuid4(),
            book_id=self.book_id,
            strategy_id=self.strategy_id,
            instrument=instrument,
            direction=direction,
            target_exposure_usd=target_exposure,
            max_loss_usd=max_loss,
            invalidation_price=invalidation_price,
            horizon_minutes=horizon_minutes,
            confidence=confidence,
            liquidity_requirement="normal",
            metadata={
                "strategy_name": self.name,
                "risk_model_version": self.risk_model_version,
                **(metadata or {})
            },
            created_at=datetime.utcnow()
        )


class TrendFollowingStrategy(BaseStrategy):
    """
    Trend-following strategy for HEDGE book.
    Uses higher timeframe momentum signals.
    """
    
    def __init__(self, strategy_id: UUID, book_id: UUID, config: Dict = None):
        super().__init__(strategy_id, book_id, config)
        self.name = "trend_following"
        self.lookback_periods = self.config.get("lookback_periods", 20)
        self.momentum_threshold = self.config.get("momentum_threshold", 0.02)
    
    async def generate_intent(
        self,
        instrument: str,
        venue: str,
        book: Book,
        market_data: Dict
    ) -> Optional[TradeIntent]:
        """Generate trend-following signal."""
        if not market_data:
            return None
        
        # Simple momentum calculation (placeholder - would use real price history)
        last_price = market_data.get("last", 0)
        spread_bps = market_data.get("spread_bps", 0)
        
        # Skip if spread too wide
        if spread_bps > 50:  # 50 bps max spread
            logger.debug("trend_signal_skipped", reason="spread_too_wide", spread_bps=spread_bps)
            return None
        
        # Simulate momentum signal (in production, use actual price history)
        momentum = random.uniform(-0.05, 0.05)  # Placeholder
        
        if abs(momentum) < self.momentum_threshold:
            return None
        
        direction = OrderSide.BUY if momentum > 0 else OrderSide.SELL
        
        # Size based on book capital and confidence
        confidence = min(abs(momentum) / 0.05, 1.0)
        target_exposure = book.capital_allocated * 0.05 * confidence  # Max 5% per position
        max_loss = target_exposure * 0.02  # 2% max loss per trade
        
        # Invalidation level
        invalidation = last_price * (0.98 if direction == OrderSide.BUY else 1.02)
        
        intent = self._create_intent(
            instrument=instrument,
            direction=direction,
            target_exposure=target_exposure,
            max_loss=max_loss,
            confidence=confidence,
            invalidation_price=invalidation,
            horizon_minutes=240,  # 4 hour horizon
            metadata={
                "momentum": momentum,
                "signal_type": "momentum_breakout"
            }
        )
        
        logger.info(
            "trend_intent_generated",
            instrument=instrument,
            direction=direction.value,
            confidence=confidence
        )
        
        return intent


class MeanReversionStrategy(BaseStrategy):
    """
    Mean reversion / VWAP deviation strategy for PROP book.
    Trades deviations from VWAP with tight stops.
    """
    
    def __init__(self, strategy_id: UUID, book_id: UUID, config: Dict = None):
        super().__init__(strategy_id, book_id, config)
        self.name = "mean_reversion"
        self.deviation_threshold = self.config.get("deviation_threshold", 0.01)
        self.max_spread_bps = self.config.get("max_spread_bps", 20)
    
    async def generate_intent(
        self,
        instrument: str,
        venue: str,
        book: Book,
        market_data: Dict
    ) -> Optional[TradeIntent]:
        """Generate mean reversion signal."""
        if not market_data:
            return None
        
        last_price = market_data.get("last", 0)
        spread_bps = market_data.get("spread_bps", 0)
        
        # Strict spread requirement for mean reversion
        if spread_bps > self.max_spread_bps:
            return None
        
        # Simulate VWAP deviation (placeholder)
        vwap = last_price * random.uniform(0.98, 1.02)
        deviation = (last_price - vwap) / vwap
        
        if abs(deviation) < self.deviation_threshold:
            return None
        
        # Trade against deviation (mean reversion)
        direction = OrderSide.SELL if deviation > 0 else OrderSide.BUY
        
        confidence = min(abs(deviation) / 0.02, 1.0)
        target_exposure = book.capital_allocated * 0.02 * confidence  # Smaller positions
        max_loss = target_exposure * 0.01  # Tight 1% stop
        
        intent = self._create_intent(
            instrument=instrument,
            direction=direction,
            target_exposure=target_exposure,
            max_loss=max_loss,
            confidence=confidence,
            horizon_minutes=30,  # Short horizon
            metadata={
                "vwap": vwap,
                "deviation": deviation,
                "signal_type": "vwap_reversion"
            }
        )
        
        return intent


class FundingArbitrageStrategy(BaseStrategy):
    """
    Funding rate / basis arbitrage for HEDGE book.
    Captures funding spreads between perps and spot.
    """
    
    def __init__(self, strategy_id: UUID, book_id: UUID, config: Dict = None):
        super().__init__(strategy_id, book_id, config)
        self.name = "funding_arbitrage"
        self.min_funding_rate = self.config.get("min_funding_rate", 0.0005)  # 0.05%
    
    async def generate_intent(
        self,
        instrument: str,
        venue: str,
        book: Book,
        market_data: Dict
    ) -> Optional[TradeIntent]:
        """Generate funding arb signal (placeholder - needs funding data)."""
        # This would require funding rate data from the venue
        # For now, stub implementation
        
        # Simulate funding rate (placeholder)
        funding_rate = random.uniform(-0.001, 0.001)
        
        if abs(funding_rate) < self.min_funding_rate:
            return None
        
        # If funding is positive, short perp / long spot
        # If funding is negative, long perp / short spot
        direction = OrderSide.SELL if funding_rate > 0 else OrderSide.BUY
        
        confidence = min(abs(funding_rate) / 0.002, 1.0)
        target_exposure = book.capital_allocated * 0.10 * confidence  # Larger for arb
        max_loss = target_exposure * 0.005  # Very tight stop for arb
        
        return self._create_intent(
            instrument=instrument,
            direction=direction,
            target_exposure=target_exposure,
            max_loss=max_loss,
            confidence=confidence,
            horizon_minutes=480,  # 8 hour horizon (funding period)
            metadata={
                "funding_rate": funding_rate,
                "signal_type": "funding_arb"
            }
        )


class MemeMonitorStrategy(BaseStrategy):
    """
    Meme coin monitoring strategy.
    Does NOT auto-trade; only generates monitoring intents.
    """
    
    def __init__(self, strategy_id: UUID, book_id: UUID, config: Dict = None):
        super().__init__(strategy_id, book_id, config)
        self.name = "meme_monitor"
        self.auto_trade = False  # Never auto-trade memes
    
    async def generate_intent(
        self,
        instrument: str,
        venue: str,
        book: Book,
        market_data: Dict
    ) -> Optional[TradeIntent]:
        """Meme strategy generates monitoring intents only."""
        # Meme book should not auto-trade
        # This generates monitoring intents that are logged but not executed
        
        if not market_data:
            return None
        
        # Create a monitoring-only intent
        intent = self._create_intent(
            instrument=instrument,
            direction=OrderSide.BUY,  # Direction is informational
            target_exposure=0,  # Zero exposure = monitoring only
            max_loss=0,
            confidence=0,
            metadata={
                "monitoring_only": True,
                "signal_type": "meme_alert",
                "price_snapshot": market_data.get("last", 0),
                "spread_bps": market_data.get("spread_bps", 0)
            }
        )
        
        return intent


class StrategyIntentEngine:
    """
    Orchestrates strategy execution and intent generation.
    """
    
    def __init__(self):
        self._strategies: Dict[UUID, BaseStrategy] = {}
        self._enabled_strategies: List[UUID] = []
    
    async def load_strategies(self):
        """Load active strategies from database."""
        try:
            supabase = get_supabase()
            result = supabase.table("strategies").select(
                "id, name, book_id, status, config_metadata, risk_tier"
            ).neq("status", "off").execute()
            
            for s in result.data:
                strategy_id = UUID(s["id"])
                book_id = UUID(s["book_id"])
                config = s.get("config_metadata", {})
                
                # Instantiate appropriate strategy class
                strategy = self._create_strategy(
                    s["name"],
                    strategy_id,
                    book_id,
                    config
                )
                
                if strategy:
                    self._strategies[strategy_id] = strategy
                    if s["status"] in ["paper", "live"]:
                        self._enabled_strategies.append(strategy_id)
            
            logger.info("strategies_loaded", count=len(self._strategies))
            
        except Exception as e:
            logger.error("strategy_load_failed", error=str(e))
    
    def _create_strategy(
        self,
        name: str,
        strategy_id: UUID,
        book_id: UUID,
        config: Dict
    ) -> Optional[BaseStrategy]:
        """Factory method to create strategy instances."""
        
        strategy_classes = {
            "trend_following": TrendFollowingStrategy,
            "mean_reversion": MeanReversionStrategy,
            "funding_arbitrage": FundingArbitrageStrategy,
            "meme_monitor": MemeMonitorStrategy,
        }
        
        # Try exact match first
        if name.lower().replace(" ", "_") in strategy_classes:
            return strategy_classes[name.lower().replace(" ", "_")](
                strategy_id, book_id, config
            )
        
        # Default to trend following for unknown
        return TrendFollowingStrategy(strategy_id, book_id, config)
    
    async def run_cycle(self, books: List[Book]) -> List[TradeIntent]:
        """Run one strategy cycle, generating intents for all enabled strategies."""
        intents = []
        
        for strategy_id in self._enabled_strategies:
            strategy = self._strategies.get(strategy_id)
            if not strategy:
                continue
            
            # Find the book for this strategy
            book = next((b for b in books if b.id == strategy.book_id), None)
            if not book:
                continue
            
            # Get market data for relevant instruments
            # For now, use BTC-USD as the primary instrument
            instruments = ["BTC-USD", "ETH-USD"]
            
            for instrument in instruments:
                market_data = await market_data_service.get_price("coinbase", instrument)
                
                # Generate simulated market data if none available
                if not market_data:
                    market_data = self._generate_mock_market_data(instrument)
                
                try:
                    intent = await strategy.generate_intent(
                        instrument=instrument,
                        venue="coinbase",
                        book=book,
                        market_data=market_data
                    )
                    
                    if intent:
                        intents.append(intent)
                        await self._store_signal(intent, strategy)
                        
                except Exception as e:
                    logger.error(
                        "strategy_cycle_error",
                        strategy_id=str(strategy_id),
                        error=str(e)
                    )
        
        return intents
    
    def _generate_mock_market_data(self, instrument: str) -> Dict:
        """Generate mock market data for paper trading."""
        base_prices = {
            "BTC-USD": 50000,
            "ETH-USD": 3000,
            "SOL-USD": 100,
        }
        base = base_prices.get(instrument, 100)
        # Add some randomness
        price = base * random.uniform(0.98, 1.02)
        spread = price * random.uniform(0.0001, 0.001)
        
        return {
            "venue": "coinbase",
            "instrument": instrument,
            "bid": price - spread / 2,
            "ask": price + spread / 2,
            "last": price,
            "mid": price,
            "spread": spread,
            "spread_bps": (spread / price) * 10000,
            "volume_24h": random.uniform(1000000, 10000000),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _store_signal(self, intent: TradeIntent, strategy: BaseStrategy):
        """Store strategy signal in database."""
        try:
            supabase = get_supabase()
            supabase.table("strategy_signals").insert({
                "strategy_id": str(intent.strategy_id),
                "instrument": intent.instrument,
                "direction": intent.direction.value,
                "signal_type": intent.metadata.get("signal_type", "unknown"),
                "strength": intent.confidence,
                "metadata": {
                    "target_exposure": intent.target_exposure_usd,
                    "max_loss": intent.max_loss_usd,
                    "invalidation": intent.invalidation_price,
                    **intent.metadata
                }
            }).execute()
            
        except Exception as e:
            logger.error("signal_store_failed", error=str(e))


# Singleton instance
strategy_engine = StrategyIntentEngine()
