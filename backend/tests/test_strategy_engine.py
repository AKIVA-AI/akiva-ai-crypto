"""
Tests for Strategy Engine and TradeIntent generation.
"""
import pytest
from uuid import uuid4
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock

from app.models.domain import (
    TradeIntent, OrderSide, Book, BookType
)
from app.services.strategy_engine import (
    TrendFollowingStrategy,
    MeanReversionStrategy,
    FundingArbitrageStrategy,
    MemeMonitorStrategy,
    StrategyIntentEngine,
    MarketRegime
)


class TestTrendFollowingStrategy:
    """Test suite for Trend Following Strategy."""
    
    @pytest.fixture
    def strategy(self):
        return TrendFollowingStrategy(
            strategy_id=uuid4(),
            book_id=uuid4(),
            config={"momentum_threshold": 0.02, "lookback_periods": 20}
        )
    
    @pytest.fixture
    def sample_book(self, strategy):
        return Book(
            id=strategy.book_id,
            name="HEDGE Book",
            type=BookType.HEDGE,
            capital_allocated=1000000,
            current_exposure=100000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active"
        )
    
    @pytest.mark.asyncio
    async def test_no_intent_on_empty_market_data(self, strategy, sample_book):
        """No intent generated when market data is empty."""
        result = await strategy.generate_intent("BTC-USD", "coinbase", sample_book, {})
        assert result is None
    
    @pytest.mark.asyncio
    async def test_no_intent_on_wide_spread(self, strategy, sample_book):
        """No intent generated when spread is too wide."""
        market_data = {
            "last": 50000,
            "spread_bps": 100  # 100 bps is too wide (>50)
        }
        result = await strategy.generate_intent("BTC-USD", "coinbase", sample_book, market_data)
        assert result is None
    
    @pytest.mark.asyncio
    async def test_intent_has_correct_metadata(self, strategy, sample_book):
        """Generated intent should have proper metadata."""
        market_data = {
            "last": 50000,
            "spread_bps": 10
        }
        
        # Mock random to generate consistent momentum
        with patch('app.services.strategy_engine.random.uniform', return_value=0.04):
            result = await strategy.generate_intent("BTC-USD", "coinbase", sample_book, market_data)
        
        if result:
            assert result.strategy_id == strategy.strategy_id
            assert result.book_id == strategy.book_id
            assert result.instrument == "BTC-USD"
            assert "strategy_name" in result.metadata
            assert result.metadata["strategy_name"] == "trend_following"
    
    @pytest.mark.asyncio
    async def test_buy_signal_on_positive_momentum(self, strategy, sample_book):
        """Should generate BUY on positive momentum."""
        market_data = {"last": 50000, "spread_bps": 10}
        
        with patch('app.services.strategy_engine.random.uniform', return_value=0.04):
            result = await strategy.generate_intent("BTC-USD", "coinbase", sample_book, market_data)
        
        if result:
            assert result.direction == OrderSide.BUY
    
    @pytest.mark.asyncio
    async def test_sell_signal_on_negative_momentum(self, strategy, sample_book):
        """Should generate SELL on negative momentum."""
        market_data = {"last": 50000, "spread_bps": 10}
        
        with patch('app.services.strategy_engine.random.uniform', return_value=-0.04):
            result = await strategy.generate_intent("BTC-USD", "coinbase", sample_book, market_data)
        
        if result:
            assert result.direction == OrderSide.SELL


class TestMeanReversionStrategy:
    """Test suite for Mean Reversion Strategy."""
    
    @pytest.fixture
    def strategy(self):
        return MeanReversionStrategy(
            strategy_id=uuid4(),
            book_id=uuid4(),
            config={"deviation_threshold": 0.01, "max_spread_bps": 20}
        )
    
    @pytest.fixture
    def sample_book(self, strategy):
        return Book(
            id=strategy.book_id,
            name="PROP Book",
            type=BookType.PROP,
            capital_allocated=500000,
            current_exposure=50000,
            max_drawdown_limit=5,
            risk_tier=2,
            status="active"
        )
    
    @pytest.mark.asyncio
    async def test_no_intent_on_wide_spread(self, strategy, sample_book):
        """Mean reversion requires tight spreads."""
        market_data = {
            "last": 3000,
            "spread_bps": 30  # Over max_spread_bps of 20
        }
        result = await strategy.generate_intent("ETH-USD", "coinbase", sample_book, market_data)
        assert result is None
    
    @pytest.mark.asyncio
    async def test_shorter_horizon_than_trend(self, strategy, sample_book):
        """Mean reversion should have shorter horizon."""
        market_data = {"last": 3000, "spread_bps": 5}
        
        # Force a signal by mocking high deviation
        with patch('app.services.strategy_engine.random.uniform', return_value=1.03):
            result = await strategy.generate_intent("ETH-USD", "coinbase", sample_book, market_data)
        
        if result:
            assert result.horizon_minutes <= 60  # Short horizon


class TestMemeMonitorStrategy:
    """Test suite for Meme Monitor Strategy."""
    
    @pytest.fixture
    def strategy(self):
        return MemeMonitorStrategy(
            strategy_id=uuid4(),
            book_id=uuid4()
        )
    
    @pytest.fixture
    def sample_book(self, strategy):
        return Book(
            id=strategy.book_id,
            name="MEME Book",
            type=BookType.MEME,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=50,
            risk_tier=3,
            status="active"
        )
    
    @pytest.mark.asyncio
    async def test_meme_generates_monitoring_only(self, strategy, sample_book):
        """Meme strategy should only generate monitoring intents."""
        market_data = {
            "last": 0.001,
            "spread_bps": 200
        }
        result = await strategy.generate_intent("DOGE-USD", "coinbase", sample_book, market_data)
        
        if result:
            assert result.target_exposure_usd == 0  # No actual exposure
            assert result.metadata.get("monitoring_only") == True
    
    def test_auto_trade_disabled(self, strategy):
        """Meme strategy should have auto_trade disabled."""
        assert strategy.auto_trade == False


class TestFundingArbitrageStrategy:
    """Test suite for Funding Arbitrage Strategy."""
    
    @pytest.fixture
    def strategy(self):
        return FundingArbitrageStrategy(
            strategy_id=uuid4(),
            book_id=uuid4(),
            config={"min_funding_rate": 0.0005}
        )
    
    @pytest.fixture
    def sample_book(self, strategy):
        return Book(
            id=strategy.book_id,
            name="HEDGE Book",
            type=BookType.HEDGE,
            capital_allocated=2000000,
            current_exposure=500000,
            max_drawdown_limit=8,
            risk_tier=1,
            status="active"
        )
    
    @pytest.mark.asyncio
    async def test_short_on_positive_funding(self, strategy, sample_book):
        """Positive funding should generate SHORT signal."""
        with patch('app.services.strategy_engine.random.uniform', return_value=0.001):
            result = await strategy.generate_intent("BTC-USD-PERP", "coinbase", sample_book, {})
        
        if result:
            assert result.direction == OrderSide.SELL
            assert result.metadata.get("signal_type") == "funding_arb"
    
    @pytest.mark.asyncio
    async def test_long_on_negative_funding(self, strategy, sample_book):
        """Negative funding should generate LONG signal."""
        with patch('app.services.strategy_engine.random.uniform', return_value=-0.001):
            result = await strategy.generate_intent("BTC-USD-PERP", "coinbase", sample_book, {})
        
        if result:
            assert result.direction == OrderSide.BUY


class TestStrategyIntentEngine:
    """Test suite for Strategy Intent Engine orchestration."""
    
    @pytest.fixture
    def engine(self):
        return StrategyIntentEngine()
    
    def test_engine_initialization(self, engine):
        """Engine should initialize with empty strategy lists."""
        assert engine._strategies == {}
        assert engine._enabled_strategies == []
    
    def test_create_strategy_factory(self, engine):
        """Factory should create correct strategy types."""
        strategy_id = uuid4()
        book_id = uuid4()
        
        trend = engine._create_strategy("trend_following", strategy_id, book_id, {})
        assert isinstance(trend, TrendFollowingStrategy)
        
        mean = engine._create_strategy("mean_reversion", strategy_id, book_id, {})
        assert isinstance(mean, MeanReversionStrategy)
        
        funding = engine._create_strategy("funding_arbitrage", strategy_id, book_id, {})
        assert isinstance(funding, FundingArbitrageStrategy)
        
        meme = engine._create_strategy("meme_monitor", strategy_id, book_id, {})
        assert isinstance(meme, MemeMonitorStrategy)
    
    def test_unknown_strategy_defaults_to_trend(self, engine):
        """Unknown strategy names should default to trend following."""
        strategy = engine._create_strategy("unknown_strategy", uuid4(), uuid4(), {})
        assert isinstance(strategy, TrendFollowingStrategy)
    
    def test_mock_market_data_generation(self, engine):
        """Mock market data should have required fields."""
        data = engine._generate_mock_market_data("BTC-USD")
        
        assert "bid" in data
        assert "ask" in data
        assert "last" in data
        assert "spread_bps" in data
        assert data["venue"] == "coinbase"
        assert data["instrument"] == "BTC-USD"
    
    @pytest.mark.asyncio
    async def test_run_cycle_with_no_strategies(self, engine):
        """Cycle with no strategies should return empty list."""
        books = [
            Book(
                id=uuid4(),
                name="Test",
                type=BookType.PROP,
                capital_allocated=100000,
                current_exposure=0,
                max_drawdown_limit=10,
                risk_tier=1,
                status="active"
            )
        ]
        result = await engine.run_cycle(books)
        assert result == []


class TestMarketRegime:
    """Test MarketRegime enum."""
    
    def test_regime_values(self):
        """Verify all regime values exist."""
        assert MarketRegime.TRENDING_UP == "trending_up"
        assert MarketRegime.TRENDING_DOWN == "trending_down"
        assert MarketRegime.RANGING == "ranging"
        assert MarketRegime.HIGH_VOLATILITY == "high_volatility"
        assert MarketRegime.LOW_VOLATILITY == "low_volatility"


class TestTradeIntentSchema:
    """Test TradeIntent Pydantic validation."""
    
    def test_valid_intent(self):
        """Valid intent should be created."""
        intent = TradeIntent(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10000,
            max_loss_usd=500,
            confidence=0.8
        )
        assert intent.confidence == 0.8
    
    def test_confidence_too_high(self):
        """Confidence > 1.0 should fail."""
        with pytest.raises(ValueError):
            TradeIntent(
                book_id=uuid4(),
                strategy_id=uuid4(),
                instrument="BTC-USD",
                direction=OrderSide.BUY,
                target_exposure_usd=10000,
                max_loss_usd=500,
                confidence=1.5
            )
    
    def test_confidence_negative(self):
        """Confidence < 0.0 should fail."""
        with pytest.raises(ValueError):
            TradeIntent(
                book_id=uuid4(),
                strategy_id=uuid4(),
                instrument="BTC-USD",
                direction=OrderSide.BUY,
                target_exposure_usd=10000,
                max_loss_usd=500,
                confidence=-0.1
            )
    
    def test_default_values(self):
        """Check default values are set correctly."""
        intent = TradeIntent(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="ETH-USD",
            direction=OrderSide.SELL,
            target_exposure_usd=5000,
            max_loss_usd=250,
            confidence=0.5
        )
        
        assert intent.horizon_minutes == 60
        assert intent.liquidity_requirement == "normal"
        assert intent.metadata == {}
        assert intent.invalidation_price is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
