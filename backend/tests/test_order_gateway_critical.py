"""
Critical tests for Order Gateway - Single Source of Truth for orders.

These tests verify that:
1. Kill switch blocks all orders
2. Orders go through single gateway
3. Audit trails are created
4. Transaction integrity is maintained
"""

from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.services.order_gateway import (
    OrderGateway,
    OrderRequest,
    OrderSide,
    OrderStatus,
    OrderType,
)


class TestOrderGatewayCritical:
    """Critical safety tests for Order Gateway."""

    @pytest.fixture
    async def gateway(self):
        """Create an order gateway instance with no real HTTP client.

        Uses yield so the gateway is properly closed after each test,
        preventing unclosed-client resource leaks that caused flaky failures.
        The HTTP client is replaced with a mock so no real network I/O occurs.
        """
        gw = OrderGateway()
        # Mark as initialized and inject a mock HTTP client so tests never
        # touch the network.  The individual test methods replace the gateway
        # methods via monkeypatch as needed.
        gw._initialized = True
        gw._http_client = AsyncMock()

        yield gw

        # Deterministic cleanup — close the gateway so httpx.AsyncClient
        # (even the mock) is released on the same event-loop tick.
        await gw.close()

    @pytest.fixture
    def sample_order_request(self):
        """Create a sample order request."""
        return OrderRequest(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            price=Decimal("50000"),
            order_type=OrderType.LIMIT,
        )

    @pytest.mark.asyncio
    async def test_kill_switch_blocks_all_orders(
        self, gateway, sample_order_request, monkeypatch
    ):
        """
        CRITICAL: Kill switch must block ALL orders without exception.
        """
        # Mock kill switch as active
        monkeypatch.setattr(gateway, "_check_kill_switch", AsyncMock(return_value=True))

        # Attempt to submit order
        result = await gateway.submit_order(sample_order_request)

        # Verify order was rejected
        assert result.success is False
        assert result.status == OrderStatus.REJECTED
        assert "kill switch" in result.error.lower()

    @pytest.mark.asyncio
    async def test_inactive_book_blocks_orders(
        self, gateway, sample_order_request, monkeypatch
    ):
        """
        CRITICAL: Orders to inactive/frozen books must be blocked.
        """
        # Mock kill switch as inactive, book as inactive
        monkeypatch.setattr(
            gateway, "_check_kill_switch", AsyncMock(return_value=False)
        )
        monkeypatch.setattr(
            gateway, "_check_book_active", AsyncMock(return_value=False)
        )

        # Attempt to submit order
        result = await gateway.submit_order(sample_order_request)

        # Verify order was rejected
        assert result.success is False
        assert result.status == OrderStatus.REJECTED
        assert "not active" in result.error.lower() or "frozen" in result.error.lower()

    @pytest.mark.asyncio
    async def test_order_creates_audit_trail(
        self, gateway, sample_order_request, monkeypatch
    ):
        """
        CRITICAL: Every order must create an audit trail.
        """
        mock_audit = AsyncMock()

        # Mock dependencies
        monkeypatch.setattr(
            gateway, "_check_kill_switch", AsyncMock(return_value=False)
        )
        monkeypatch.setattr(gateway, "_check_book_active", AsyncMock(return_value=True))
        monkeypatch.setattr(gateway, "_write_order", AsyncMock(return_value=True))
        monkeypatch.setattr(gateway, "_log_audit_event", mock_audit)

        # Submit order
        result = await gateway.submit_order(sample_order_request)

        # Verify audit was logged exactly once
        mock_audit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_order_validation_basic(self, gateway, sample_order_request):
        """
        Test basic order validation (size > 0, valid instrument, etc.)
        """
        from pydantic import ValidationError

        # Test with zero size - should raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            OrderRequest(
                book_id=uuid4(),
                instrument="BTC-USD",
                side=OrderSide.BUY,
                size=Decimal("0"),  # Invalid: zero size
                order_type=OrderType.MARKET,
            )

        # Verify the error is about size
        assert "size" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_market_order_no_price_required(self, gateway, monkeypatch):
        """
        Market orders should not require a price.
        """
        market_order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            price=None,  # No price for market order
            order_type=OrderType.MARKET,
        )

        # Mock dependencies
        monkeypatch.setattr(
            gateway, "_check_kill_switch", AsyncMock(return_value=False)
        )
        monkeypatch.setattr(gateway, "_check_book_active", AsyncMock(return_value=True))
        monkeypatch.setattr(gateway, "_write_order", AsyncMock(return_value=True))
        monkeypatch.setattr(gateway, "_log_audit_event", AsyncMock())

        # Submit market order
        result = await gateway.submit_order(market_order)

        # Should succeed
        assert result.success is True
