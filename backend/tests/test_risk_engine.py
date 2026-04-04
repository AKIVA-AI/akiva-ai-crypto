"""
Tests for Risk Engine rules and intent validation.
"""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from app.agents.risk_agent import RiskAgent
from app.config import settings
from app.models.domain import (
    Book,
    BookType,
    OrderSide,
    Position,
    RiskDecision,
    TradeIntent,
    VenueHealth,
    VenueStatus,
)
from app.services.risk_engine import RiskEngine


class TestRiskEngine:
    """Test suite for Risk Engine pre-trade checks."""

    @pytest.fixture
    def risk_engine(self):
        engine = RiskEngine()
        return engine

    @pytest.fixture
    def mock_kill_switch_off(self):
        """Mock kill switch to return False (off)."""
        with patch.object(
            RiskEngine, "_check_global_kill_switch", new_callable=AsyncMock
        ) as mock:
            mock.return_value = False
            yield mock

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
            status="active",
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
            liquidity_requirement="normal",
        )

    @pytest.fixture
    def healthy_venue(self):
        return VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.HEALTHY,
            latency_ms=50,
            error_rate=0.1,
            last_heartbeat=datetime.now(UTC),
            is_enabled=True,
        )

    # === Position Size Limit Tests ===

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_position_size_within_limit(
        self, mock_ks, risk_engine, sample_intent, sample_book, healthy_venue
    ):
        """Position size under limit should pass."""
        sample_intent.target_exposure_usd = 50000  # Under 100k limit

        # Mock the async method
        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )

        assert "position_size" in result.checks_passed

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_position_size_exceeds_limit(
        self, mock_ks, risk_engine, sample_intent, sample_book, healthy_venue
    ):
        """Position size over limit should fail."""
        sample_intent.target_exposure_usd = 150000  # Over 100k limit

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )

        assert result.decision == RiskDecision.REJECT
        assert "position_size" in result.checks_failed

    # === Book Utilization Tests ===

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_book_utilization_high_rejects(
        self, mock_ks, risk_engine, sample_intent, sample_book, healthy_venue
    ):
        """High book utilization (>90%) should reject."""
        sample_book.current_exposure = 850000  # 85% utilized
        sample_intent.target_exposure_usd = 100000  # Would push to 95%

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )

        assert "book_utilization" in result.checks_failed

    # === Max Trade Loss Tests ===

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_max_trade_loss_within_limit(
        self, mock_ks, risk_engine, sample_intent, sample_book, healthy_venue
    ):
        """Max loss under 2% of book should pass."""
        sample_intent.max_loss_usd = 15000  # 1.5% of 1M book

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )

        assert "max_trade_loss" in result.checks_passed

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_max_trade_loss_exceeds_limit(
        self, mock_ks, risk_engine, sample_intent, sample_book, healthy_venue
    ):
        """Max loss over 2% of book should fail."""
        sample_intent.max_loss_usd = 30000  # 3% of 1M book

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
        )

        assert "max_trade_loss" in result.checks_failed

    # === Venue Health Tests ===

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_venue_down_rejects(self, mock_ks, risk_engine, sample_intent, sample_book):
        """Venue DOWN status should reject."""
        down_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DOWN,
            latency_ms=0,
            error_rate=100,
            last_heartbeat=datetime.now(UTC),
            is_enabled=False,
        )

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, down_venue, [])
        )

        assert "venue_health" in result.checks_failed

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_venue_degraded_high_liquidity_rejects(
        self, mock_ks, risk_engine, sample_intent, sample_book
    ):
        """Degraded venue with high liquidity requirement should reject."""
        degraded_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DEGRADED,
            latency_ms=500,
            error_rate=5,
            last_heartbeat=datetime.now(UTC),
            is_enabled=True,
        )
        sample_intent.liquidity_requirement = "high"

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(sample_intent, sample_book, degraded_venue, [])
        )

        assert "venue_health" in result.checks_failed

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_venue_degraded_normal_liquidity_passes(
        self, mock_ks, risk_engine, sample_intent, sample_book
    ):
        """Degraded venue with normal liquidity should pass."""
        degraded_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.DEGRADED,
            latency_ms=300,
            error_rate=3,
            last_heartbeat=datetime.now(UTC),
            is_enabled=True,
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
            confidence=0.75,
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
                confidence=1.5,  # Invalid
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
            confidence=0.5,
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
            status="active",
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
                is_open=True,
            )
        ]

        return book, positions

    @patch.object(
        RiskEngine,
        "_check_global_kill_switch",
        new_callable=AsyncMock,
        return_value=False,
    )
    def test_concentration_limit_exceeded(
        self, mock_ks, risk_engine, book_with_positions
    ):
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
            confidence=0.7,
        )

        healthy_venue = VenueHealth(
            venue_id=uuid4(),
            name="coinbase",
            status=VenueStatus.HEALTHY,
            latency_ms=50,
            error_rate=0.1,
            last_heartbeat=datetime.now(UTC),
            is_enabled=True,
        )

        import asyncio

        result = asyncio.get_event_loop().run_until_complete(
            risk_engine.check_intent(intent, book, healthy_venue, positions)
        )

        assert "concentration" in result.checks_failed


class TestKillSwitch:
    """Tests for the kill switch mechanism."""

    def test_kill_switch_blocks_all_trades(self):
        """Once kill switch is triggered, all trades should be rejected."""
        agent = RiskAgent()
        agent._risk_metrics["kill_switch_triggered"] = True

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 90.0,
            "target_exposure_usd": 1000,
        }

        result = asyncio.get_event_loop().run_until_complete(
            agent._evaluate_risk(signal)
        )
        assert not result["approved"]
        assert "Kill switch is active" in result["rejection_reasons"]

    def test_kill_switch_triggers_on_severe_loss(self):
        """Kill switch should trigger when daily loss exceeds 1.5x limit."""
        agent = RiskAgent()
        # Set daily P&L to exceed 1.5x the daily loss limit ($10k * 1.5 = $15k)
        agent._daily_pnl = -16000

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 80.0,
            "target_exposure_usd": 1000,
        }

        with patch.object(agent, "publish", new_callable=AsyncMock):
            with patch.object(agent, "send_alert", new_callable=AsyncMock):
                result = asyncio.get_event_loop().run_until_complete(
                    agent._evaluate_risk(signal)
                )

        assert agent._risk_metrics["kill_switch_triggered"]

    def test_kill_switch_reset(self):
        """Admin should be able to reset kill switch."""
        agent = RiskAgent()
        agent._risk_metrics["kill_switch_triggered"] = True
        agent.reset_kill_switch()
        assert not agent._risk_metrics["kill_switch_triggered"]


class TestDailyLossLimit:
    """Tests for daily loss limit enforcement."""

    def test_daily_loss_within_limit_allows_trade(self):
        """Trades should be allowed when daily loss is within limit."""
        agent = RiskAgent()
        agent._daily_pnl = -5000  # Under $10k limit

        signal = {
            "instrument": "ETH-USD",
            "direction": "buy",
            "confidence": 70.0,
            "target_exposure_usd": 5000,
        }

        with patch.object(agent, "_trigger_kill_switch", new_callable=AsyncMock):
            result = asyncio.get_event_loop().run_until_complete(
                agent._evaluate_risk(signal)
            )
        assert result["approved"]

    def test_daily_loss_breached_rejects_trade(self):
        """Trades should be rejected when daily loss limit is breached."""
        agent = RiskAgent()
        agent._daily_pnl = -11000  # Over $10k limit

        signal = {
            "instrument": "ETH-USD",
            "direction": "buy",
            "confidence": 70.0,
            "target_exposure_usd": 5000,
        }

        with patch.object(agent, "_trigger_kill_switch", new_callable=AsyncMock):
            result = asyncio.get_event_loop().run_until_complete(
                agent._evaluate_risk(signal)
            )
        assert not result["approved"]
        assert any("Daily loss limit" in r for r in result["rejection_reasons"])


class TestPositionSizing:
    """Tests for position sizing and adjustment."""

    def test_oversized_trade_gets_scaled_down(self):
        """Trade exceeding single trade limit should be scaled to max."""
        agent = RiskAgent()

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 80.0,
            "target_exposure_usd": 50000,  # Over $25k single trade limit
        }

        result = asyncio.get_event_loop().run_until_complete(
            agent._evaluate_risk(signal)
        )
        assert result["approved"]
        assert result["adjusted_size"] == 25000

    def test_position_at_capacity_rejects(self):
        """Trade should be rejected if position is already at max."""
        agent = RiskAgent()
        agent._positions["BTC-USD"] = {"size_usd": 50000, "side": "buy"}
        agent._total_exposure = 50000

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 80.0,
            "target_exposure_usd": 5000,
        }

        result = asyncio.get_event_loop().run_until_complete(
            agent._evaluate_risk(signal)
        )
        assert not result["approved"]
        assert any("Position limit" in r for r in result["rejection_reasons"])

    def test_remaining_capacity_used(self):
        """Trade should be sized to remaining position capacity."""
        agent = RiskAgent()
        agent._positions["BTC-USD"] = {"size_usd": 40000, "side": "buy"}
        agent._total_exposure = 40000

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 80.0,
            "target_exposure_usd": 20000,
        }

        result = asyncio.get_event_loop().run_until_complete(
            agent._evaluate_risk(signal)
        )
        assert result["approved"]
        assert result["adjusted_size"] == 10000  # Only 10k remaining capacity


class TestFillProcessing:
    """Tests for fill processing and portfolio state updates."""

    def test_buy_fill_creates_position(self):
        """Buy fill should create a new position."""
        agent = RiskAgent()

        fill = {"instrument": "BTC-USD", "side": "buy", "size_usd": 10000, "pnl": 0}

        asyncio.get_event_loop().run_until_complete(agent._process_fill(fill))

        assert "BTC-USD" in agent._positions
        assert agent._positions["BTC-USD"]["size_usd"] == 10000
        assert agent._total_exposure == 10000

    def test_sell_fill_reduces_position(self):
        """Sell fill should reduce existing position."""
        agent = RiskAgent()
        agent._positions["BTC-USD"] = {"size_usd": 10000, "side": "buy"}
        agent._total_exposure = 10000

        fill = {"instrument": "BTC-USD", "side": "sell", "size_usd": 10000, "pnl": 500}

        asyncio.get_event_loop().run_until_complete(agent._process_fill(fill))

        # Position should be closed (removed)
        assert "BTC-USD" not in agent._positions
        assert agent._total_exposure == 0
        assert agent._daily_pnl == 500

    def test_pnl_accumulates(self):
        """Daily P&L should accumulate across fills."""
        agent = RiskAgent()

        fills = [
            {"instrument": "BTC-USD", "side": "buy", "size_usd": 5000, "pnl": 200},
            {"instrument": "ETH-USD", "side": "buy", "size_usd": 3000, "pnl": -100},
            {"instrument": "SOL-USD", "side": "buy", "size_usd": 2000, "pnl": 50},
        ]

        for fill in fills:
            asyncio.get_event_loop().run_until_complete(agent._process_fill(fill))

        assert agent._daily_pnl == 150  # 200 - 100 + 50


class TestPausedState:
    """Tests for agent paused state behavior."""

    def test_paused_agent_rejects_all(self):
        """Paused risk agent should reject all trade intents."""
        agent = RiskAgent()
        agent._paused = True

        signal = {
            "instrument": "BTC-USD",
            "direction": "buy",
            "confidence": 95.0,
            "target_exposure_usd": 1000,
        }

        result = asyncio.get_event_loop().run_until_complete(
            agent._evaluate_risk(signal)
        )
        assert not result["approved"]
        assert "Risk agent is paused" in result["rejection_reasons"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
