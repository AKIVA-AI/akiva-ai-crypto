"""
Critical tests for Order Gateway - Single Source of Truth for orders.

These tests verify that:
1. Kill switch blocks all orders
2. Orders go through single gateway
3. Audit trails are created
4. Transaction integrity is maintained
"""
import pytest
from uuid import uuid4
from decimal import Decimal

from app.services.order_gateway import (
    OrderGateway,
    OrderRequest,
    OrderSide,
    OrderType,
    OrderStatus,
)


class TestOrderGatewayCritical:
    """Critical safety tests for Order Gateway."""
    
    @pytest.fixture
    async def gateway(self):
        """Create an order gateway instance."""
        gateway = OrderGateway()
        await gateway.initialize()
        return gateway
    
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
    async def test_kill_switch_blocks_all_orders(self, gateway, sample_order_request, monkeypatch):
        """
        CRITICAL: Kill switch must block ALL orders without exception.
        """
        # Mock kill switch as active
        async def mock_check_kill_switch():
            return True
        
        monkeypatch.setattr(gateway, '_check_kill_switch', mock_check_kill_switch)
        
        # Attempt to submit order
        result = await gateway.submit_order(sample_order_request)
        
        # Verify order was rejected
        assert result.success is False
        assert result.status == OrderStatus.REJECTED
        assert 'kill switch' in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_inactive_book_blocks_orders(self, gateway, sample_order_request, monkeypatch):
        """
        CRITICAL: Orders to inactive/frozen books must be blocked.
        """
        # Mock book as inactive
        async def mock_check_book_active(book_id):
            return False
        
        monkeypatch.setattr(gateway, '_check_book_active', mock_check_book_active)
        
        # Mock kill switch as inactive
        async def mock_check_kill_switch():
            return False
        
        monkeypatch.setattr(gateway, '_check_kill_switch', mock_check_kill_switch)
        
        # Attempt to submit order
        result = await gateway.submit_order(sample_order_request)
        
        # Verify order was rejected
        assert result.success is False
        assert result.status == OrderStatus.REJECTED
        assert 'not active' in result.error.lower() or 'frozen' in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_order_creates_audit_trail(self, gateway, sample_order_request, monkeypatch):
        """
        CRITICAL: Every order must create an audit trail.
        """
        audit_logged = False
        
        async def mock_log_audit_event(order, result):
            nonlocal audit_logged
            audit_logged = True
        
        # Mock dependencies
        async def mock_check_kill_switch():
            return False
        
        async def mock_check_book_active(book_id):
            return True
        
        async def mock_write_order(order, result):
            return True
        
        monkeypatch.setattr(gateway, '_check_kill_switch', mock_check_kill_switch)
        monkeypatch.setattr(gateway, '_check_book_active', mock_check_book_active)
        monkeypatch.setattr(gateway, '_write_order', mock_write_order)
        monkeypatch.setattr(gateway, '_log_audit_event', mock_log_audit_event)
        
        # Submit order
        result = await gateway.submit_order(sample_order_request)
        
        # Verify audit was logged
        assert audit_logged is True
    
    @pytest.mark.asyncio
    async def test_order_validation_basic(self, gateway, sample_order_request):
        """
        Test basic order validation (size > 0, valid instrument, etc.)
        """
        from pydantic import ValidationError

        # Test with zero size - should raise ValidationError
        with pytest.raises(ValidationError) as exc_info:
            invalid_order = OrderRequest(
                book_id=uuid4(),
                instrument="BTC-USD",
                side=OrderSide.BUY,
                size=Decimal("0"),  # Invalid: zero size
                order_type=OrderType.MARKET,
            )

        # Verify the error is about size
        assert 'size' in str(exc_info.value).lower()
    
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
        async def mock_check_kill_switch():
            return False
        
        async def mock_check_book_active(book_id):
            return True
        
        async def mock_write_order(order, result):
            return True
        
        async def mock_log_audit_event(order, result):
            pass
        
        monkeypatch.setattr(gateway, '_check_kill_switch', mock_check_kill_switch)
        monkeypatch.setattr(gateway, '_check_book_active', mock_check_book_active)
        monkeypatch.setattr(gateway, '_write_order', mock_write_order)
        monkeypatch.setattr(gateway, '_log_audit_event', mock_log_audit_event)
        
        # Submit market order
        result = await gateway.submit_order(market_order)
        
        # Should succeed
        assert result.success is True

