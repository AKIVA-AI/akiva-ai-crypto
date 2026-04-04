from uuid import uuid4

import pytest
from app.config import settings
from app.models.domain import OrderSide, TradeIntent
from app.services.capital_allocator import capital_allocator_service


def test_allocator_applies_limits(monkeypatch):
    intent = TradeIntent(
        id=uuid4(),
        book_id=uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-USD",
        direction=OrderSide.BUY,
        target_exposure_usd=10000,
        max_loss_usd=200,
        confidence=0.9,
        metadata={},
    )

    allocation_map = {
        str(intent.strategy_id): {
            "allocation_pct": 0.2,
            "allocated_capital": 1000,
            "risk_multiplier": 0.5,
            "enabled": True,
            "max_notional": 800,
            "min_notional": 0,
            "decision_id": "decision-1",
        }
    }

    settings.tenant_id = "tenant-1"
    monkeypatch.setattr(
        capital_allocator_service,
        "_load_allocation_map",
        lambda tenant_id: allocation_map,
    )

    adjusted = capital_allocator_service.apply_allocations([intent])
    assert adjusted
    assert adjusted[0].target_exposure_usd == 400
