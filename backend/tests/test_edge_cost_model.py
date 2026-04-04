from uuid import uuid4

import pytest
from app.models.domain import OrderSide, TradeIntent
from app.services.edge_cost_model import EdgeCostModel


def test_edge_cost_model_rejects_when_edge_below_costs():
    model = EdgeCostModel(min_edge_buffer_bps=10.0)
    intent = TradeIntent(
        id=uuid4(),
        book_id=uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-USD",
        direction=OrderSide.BUY,
        target_exposure_usd=10000,
        max_loss_usd=200,
        confidence=0.2,
        metadata={"expected_edge_bps": 5},
    )
    market_snapshot = {
        "spread_bps": 8,
        "volatility_bps": 20,
        "volume_24h": 1_000_000,
    }

    result = model.evaluate_intent(intent, market_snapshot)
    assert result.allowed is False
    assert result.expected_edge_bps == 5


def test_edge_cost_model_includes_funding_and_basis():
    model = EdgeCostModel(min_edge_buffer_bps=5.0)
    intent = TradeIntent(
        id=uuid4(),
        book_id=uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-PERP",
        direction=OrderSide.SELL,
        target_exposure_usd=50000,
        max_loss_usd=1000,
        confidence=0.9,
        metadata={
            "expected_edge_bps": 60,
            "funding_rate_bps": 4,
            "basis_risk_bps": 6,
        },
    )
    market_snapshot = {
        "spread_bps": 4,
        "volatility_bps": 10,
        "volume_24h": 2_000_000,
    }

    result = model.evaluate_intent(intent, market_snapshot)
    assert result.breakdown.funding_bps == 4
    assert result.breakdown.basis_bps == 6
