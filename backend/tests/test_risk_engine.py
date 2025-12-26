"""
Tests for Risk Engine rules and intent validation.
"""
import pytest
from uuid import uuid4
from datetime import datetime

from app.models.domain import (
    TradeIntent, OrderSide, Book, BookType, 
    Position, VenueHealth, VenueStatus, RiskDecision
)
from app.services.risk_engine import RiskEngine
from app.config import settings


class TestRiskEngine:
    """Test suite for Risk Engine pre-trade checks."""
    
    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()
    
    @pytest.fixture
    def sample_book(self):
        return Book(
            id=uuid4(),
            name="Test PROP Book",
            type=BookType.PROP,
            capital_allocated=1000000,
            current_exposure=200000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active"
        )
    
    @pytest.fixture
    def sample_intent(self, sample_book):
        return TradeIntent(
            id=uuid4(),
            book_id=sample_book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=50000,
            max_loss_usd=2500,
            confidence=0.8,
            liquidity_requirement="normal"
        )
    
    @pytest.fixture
    def healthy_venue(self):
        return VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.HEALTHY,
            latency_ms=50,
            error_rate=0.1,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True
        )
    
    # === Position Size Limit Tests ===
    
    def test_position_size_within_limit(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """Position size under limit should pass."""
        sample_intent.target_exposure_usd = 50000  # Under 100k limit
        
        # Mock the async method
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )
        
        assert "position_size" in result.checks_passed
    
    def test_position_size_exceeds_limit(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """Position size over limit should fail."""
        sample_intent.target_exposure_usd = 150000  # Over 100k limit
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )
        
        assert result.decision == RiskDecision.REJECT
        assert "position_size" in result.checks_failed
    
    # === Book Utilization Tests ===
    
    def test_book_utilization_high_rejects(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """High book utilization (>90%) should reject."""
        sample_book.current_exposure = 850000  # 85% utilized
        sample_intent.target_exposure_usd = 100000  # Would push to 95%
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )
        
        assert "book_utilization" in result.checks_failed
    
    # === Max Trade Loss Tests ===
    
    def test_max_trade_loss_within_limit(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """Max loss under 2% of book should pass."""
        sample_intent.max_loss_usd = 15000  # 1.5% of 1M book
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )
        
        assert "max_trade_loss" in result.checks_passed
    
    def test_max_trade_loss_exceeds_limit(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """Max loss over 2% of book should fail."""
        sample_intent.max_loss_usd = 30000  # 3% of 1M book
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )
        
        assert "max_trade_loss" in result.checks_failed
    
    # === Venue Health Tests ===
    
    def test_venue_down_rejects(self, risk_engine, sample_intent, sample_book):
        """Venue DOWN status should reject."""
        down_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DOWN,
            latency_ms=0,
            error_rate=100,
            last_heartbeat=datetime.utcnow(),
            is_enabled=False
        )
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, down_venue, [])
        )
        
        assert "venue_health" in result.checks_failed
    
    def test_venue_degraded_high_liquidity_rejects(self, risk_engine, sample_intent, sample_book):
        """Degraded venue with high liquidity requirement should reject."""
        degraded_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DEGRADED,
            latency_ms=500,
            error_rate=5,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True
        )
        sample_intent.liquidity_requirement = "high"
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, degraded_venue, [])
        )
        
        assert "venue_health" in result.checks_failed
    
    def test_venue_degraded_normal_liquidity_passes(self, risk_engine, sample_intent, sample_book):
        """Degraded venue with normal liquidity should pass."""
        degraded_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DEGRADED,
            latency_ms=300,
            error_rate=3,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True
        )
        sample_intent.liquidity_requirement = "normal"
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, degraded_venue, [])
        )
        
        assert "venue_health" in result.checks_passed
    
    # === Circuit Breaker Tests ===
    
    def test_circuit_breaker_activation(self, risk_engine):
        """Circuit breaker should block new intents."""
        import asyncio
        
        asyncio.get_event_loop().run_until_complete(
            risk_engine.activate_circuit_breaker("test_breaker", "Test reason")
        )
        
        assert risk_engine._circuit_breakers["test_breaker"] == True
        
        # Clean up
        asyncio.get_event_loop().run_until_complete(
            risk_engine.deactivate_circuit_breaker("test_breaker")
        )
        
        assert risk_engine._circuit_breakers["test_breaker"] == False


class TestTradeIntentValidation:
    """Test suite for TradeIntent schema validation."""
    
    def test_valid_intent_creation(self):
        """Valid intent should be created without errors."""
        intent = TradeIntent(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="ETH-USD",
            direction=OrderSide.SELL,
            target_exposure_usd=25000,
            max_loss_usd=1250,
            confidence=0.75
        )
        
        assert intent.instrument == "ETH-USD"
        assert intent.direction == OrderSide.SELL
        assert intent.confidence == 0.75
    
    def test_confidence_bounds(self):
        """Confidence must be between 0 and 1."""
        with pytest.raises(ValueError):
            TradeIntent(
                book_id=uuid4(),
                strategy_id=uuid4(),
                instrument="BTC-USD",
                direction=OrderSide.BUY,
                target_exposure_usd=10000,
                max_loss_usd=500,
                confidence=1.5  # Invalid
            )
    
    def test_default_liquidity_requirement(self):
        """Default liquidity requirement should be 'normal'."""
        intent = TradeIntent(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10000,
            max_loss_usd=500,
            confidence=0.5
        )
        
        assert intent.liquidity_requirement == "normal"


class TestConcentrationLimits:
    """Test suite for asset concentration limits."""
    
    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()
    
    @pytest.fixture
    def book_with_positions(self):
        book = Book(
            id=uuid4(),
            name="Test Book",
            type=BookType.PROP,
            capital_allocated=1000000,
            current_exposure=300000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active"
        )
        
        # Existing BTC positions worth 200k
        positions = [
            Position(
                id=uuid4(),
                book_id=book.id,
                instrument="BTC-USD",
                side=OrderSide.BUY,
                size=4.0,
                entry_price=50000,
                mark_price=50000,
                is_open=True
            )
        ]
        
        return book, positions
    
    def test_concentration_limit_exceeded(self, risk_engine, book_with_positions):
        """Adding more BTC when already at 20% should fail at 25% limit."""
        book, positions = book_with_positions
        
        # Try to add another 100k BTC (would be 300k total = 30%)
        intent = TradeIntent(
            id=uuid4(),
            book_id=book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=100000,
            max_loss_usd=5000,
            confidence=0.7
        )
        
        healthy_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.HEALTHY,
            latency_ms=50,
            error_rate=0.1,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True
        )
        
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(intent, book, healthy_venue, positions)
        )
        
        assert "concentration" in result.checks_failed


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
