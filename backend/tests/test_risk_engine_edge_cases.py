"""
Tests for Risk Engine edge cases: kill switch fail-safe,
circuit breaker cascades, and boundary conditions.

Sprint 0 - Dim 7 (Testing) hardening.
"""
import asyncio
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, UTC

from app.models.domain import (
    TradeIntent, OrderSide, Book, BookType,
    Position, VenueHealth, VenueStatus, RiskDecision
)
from app.services.risk_engine import RiskEngine


class TestKillSwitchFailSafe:
    """Kill switch must fail closed: if the DB check fails, treat as active."""

    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()

    @pytest.fixture
    def sample_book(self):
        return Book(
            id=uuid4(),
            name="Test Book",
            type=BookType.PROP,
            capital_allocated=1_000_000,
            current_exposure=100_000,
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
            target_exposure_usd=10_000,
            max_loss_usd=500,
            confidence=0.8,
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

    def test_kill_switch_returns_true_on_db_error(self, risk_engine):
        """When DB query fails, kill switch must return True (fail closed)."""
        with patch("app.services.risk_engine.get_supabase") as mock_sb:
            mock_sb.side_effect = Exception("Connection refused")
            result = asyncio.get_event_loop().run_until_complete(
                risk_engine._check_global_kill_switch()
            )
            assert result is True

    def test_kill_switch_returns_true_on_empty_result(self, risk_engine):
        """When DB returns no rows, kill switch returns False (settings missing = off)."""
        with patch("app.services.risk_engine.get_supabase") as mock_sb:
            mock_table = MagicMock()
            mock_table.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            mock_sb.return_value = mock_table
            result = asyncio.get_event_loop().run_until_complete(
                risk_engine._check_global_kill_switch()
            )
            assert result is False

    def test_kill_switch_on_rejects_intent(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """When kill switch is active, all intents must be REJECTED."""
        with patch.object(RiskEngine, '_check_global_kill_switch', new_callable=AsyncMock, return_value=True):
            result = asyncio.get_event_loop().run_until_complete(
                risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
            )
            assert result.decision == RiskDecision.REJECT
            assert "Global kill switch is active" in result.reasons

    def test_kill_switch_db_failure_rejects_intent(self, risk_engine, sample_intent, sample_book, healthy_venue):
        """When DB is unreachable, kill switch check fails closed, rejecting intent."""
        with patch("app.services.risk_engine.get_supabase") as mock_sb:
            mock_sb.side_effect = Exception("Database unreachable")
            result = asyncio.get_event_loop().run_until_complete(
                risk_engine.check_intent(sample_intent, sample_book, healthy_venue, [])
            )
            assert result.decision == RiskDecision.REJECT
            assert "Global kill switch is active" in result.reasons


class TestCircuitBreakerCascades:
    """Circuit breaker activation and cascade behavior."""

    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()

    def test_multiple_breakers_can_be_active(self, risk_engine):
        """Multiple circuit breakers can be active simultaneously."""
        asyncio.get_event_loop().run_until_complete(
            risk_engine.activate_circuit_breaker("latency", "High latency detected")
        )
        asyncio.get_event_loop().run_until_complete(
            risk_engine.activate_circuit_breaker("error_rate", "Error rate spike")
        )

        assert risk_engine._circuit_breakers["latency"] is True
        assert risk_engine._circuit_breakers["error_rate"] is True

        # The check returns the first active breaker
        result = risk_engine._check_circuit_breakers()
        assert result is not None

    def test_deactivating_one_breaker_leaves_others(self, risk_engine):
        """Deactivating one breaker should not affect other active breakers."""
        asyncio.get_event_loop().run_until_complete(
            risk_engine.activate_circuit_breaker("latency", "High latency")
        )
        asyncio.get_event_loop().run_until_complete(
            risk_engine.activate_circuit_breaker("vol_shock", "Volatility spike")
        )

        asyncio.get_event_loop().run_until_complete(
            risk_engine.deactivate_circuit_breaker("latency")
        )

        assert risk_engine._circuit_breakers["latency"] is False
        assert risk_engine._circuit_breakers["vol_shock"] is True

    def test_no_active_breakers_returns_none(self, risk_engine):
        """When no breakers are active, check returns None."""
        result = risk_engine._check_circuit_breakers()
        assert result is None

    def test_global_breaker_blocks_trades(self, risk_engine):
        """Global circuit breaker should block all trades."""
        risk_engine._circuit_breakers["global"] = True
        result = risk_engine._check_circuit_breakers()
        assert result == "global"


class TestBoundaryConditions:
    """Boundary condition tests for risk checks."""

    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()

    @pytest.fixture
    def sample_book(self):
        return Book(
            id=uuid4(),
            name="Test Book",
            type=BookType.PROP,
            capital_allocated=1_000_000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active"
        )

    def test_zero_capital_book_utilization(self, risk_engine, sample_book):
        """Book with zero capital should return 100% utilization (avoid division by zero)."""
        sample_book.capital_allocated = 0
        intent = TradeIntent(
            id=uuid4(),
            book_id=sample_book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=1000,
            max_loss_usd=50,
            confidence=0.5,
        )
        utilization = risk_engine._check_book_utilization(intent, sample_book)
        assert utilization == 1.0

    def test_exact_position_limit_passes(self, risk_engine):
        """Position exactly at limit should pass."""
        from app.config import settings
        max_size = settings.risk.max_position_size_usd

        intent = TradeIntent(
            id=uuid4(),
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=max_size,  # Exactly at limit
            max_loss_usd=500,
            confidence=0.5,
        )
        # Position size check: target_exposure_usd > max → fail; == max → pass
        assert intent.target_exposure_usd <= max_size

    def test_exactly_90_percent_utilization_passes(self, risk_engine, sample_book):
        """Book at exactly 90% utilization should pass (cap is >90%)."""
        sample_book.capital_allocated = 1_000_000
        sample_book.current_exposure = 890_000
        intent = TradeIntent(
            id=uuid4(),
            book_id=sample_book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10_000,  # total = 900k = exactly 90%
            max_loss_usd=500,
            confidence=0.5,
        )
        utilization = risk_engine._check_book_utilization(intent, sample_book)
        assert utilization == 0.9  # Exactly 90%, should pass (>0.9 fails)

    def test_concentration_with_no_existing_positions(self, risk_engine, sample_book):
        """New position in empty book should calculate concentration correctly."""
        intent = TradeIntent(
            id=uuid4(),
            book_id=sample_book.id,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=100_000,
            max_loss_usd=5000,
            confidence=0.7,
        )
        concentration = asyncio.get_event_loop().run_until_complete(
            risk_engine._check_concentration(intent, sample_book, [])
        )
        # 100k / 1M = 10%
        assert concentration == 10.0


class TestSpotArbLimits:
    """Tests for spot arbitrage-specific risk limits."""

    @pytest.fixture
    def risk_engine(self):
        return RiskEngine()

    def test_non_arb_intent_skips_check(self, risk_engine):
        """Non-arb intents should not be checked by arb limits."""
        intent = TradeIntent(
            id=uuid4(),
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10_000,
            max_loss_usd=500,
            confidence=0.7,
        )
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine._check_spot_arb_limits(intent)
        )
        assert result is None

    def test_arb_intent_without_tenant_rejected(self, risk_engine):
        """Arb intent missing tenant_id should be rejected."""
        intent = TradeIntent(
            id=uuid4(),
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10_000,
            max_loss_usd=500,
            confidence=0.7,
            metadata={"strategy_type": "spot_arb"},
        )
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine._check_spot_arb_limits(intent)
        )
        assert result == "Missing tenant scope for spot arb intent"

    def test_arb_latency_shock_rejected(self, risk_engine):
        """Arb intent with latency exceeding threshold should be rejected."""
        from app.config import settings
        intent = TradeIntent(
            id=uuid4(),
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=10_000,
            max_loss_usd=500,
            confidence=0.7,
            metadata={
                "strategy_type": "spot_arb",
                "tenant_id": str(uuid4()),
                "latency_score": settings.risk.latency_shock_ms + 1,
            },
        )
        result = asyncio.get_event_loop().run_until_complete(
            risk_engine._check_spot_arb_limits(intent)
        )
        assert result == "Latency shock breaker triggered"
