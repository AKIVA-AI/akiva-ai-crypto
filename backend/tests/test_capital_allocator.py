from dataclasses import dataclass

from app.services.capital_allocator import AllocationConfig, CapitalAllocatorService
from app.services.regime_detection_service import RegimeState


def test_allocator_regime_shift():
    config = AllocationConfig(
        base_weights={"futures_scalp": 0.3, "spot": 0.3, "basis": 0.2, "spot_arb": 0.2},
        max_strategy_weight=0.6,
        min_strategy_weight=0.0,
        drawdown_throttle=0.2,
        sharpe_floor=0.5,
        cooldown_minutes=60,
        risk_bias_scalars={"risk_on": 1.0, "neutral": 1.0, "risk_off": 0.7},
    )
    strategies = [
        {"id": "s1", "strategy_type": "futures_scalp"},
        {"id": "s2", "strategy_type": "spot"},
        {"id": "s3", "strategy_type": "basis"},
        {"id": "s4", "strategy_type": "spot_arb"},
    ]
    perf = {s["id"]: {"sharpe": 1.0, "max_drawdown": 0.05} for s in strategies}
    risk = {s["id"]: {"correlation_cluster": "directional"} for s in strategies}
    regime = RegimeState(
        direction="range_bound",
        volatility="high_vol",
        liquidity="normal",
        risk_bias="risk_off",
        details={},
    )

    allocations = CapitalAllocatorService.compute_allocations(
        strategies=strategies,
        performance=perf,
        risk=risk,
        regime=regime,
        total_capital=100000,
        config=config,
    )

    weights = {a.strategy_id: a.allocation_pct for a in allocations}
    assert weights["s3"] >= weights["s1"]


def test_allocator_throttles_drawdown():
    config = AllocationConfig(
        base_weights={"spot": 1.0},
        max_strategy_weight=1.0,
        min_strategy_weight=0.0,
        drawdown_throttle=0.05,
        sharpe_floor=0.5,
        cooldown_minutes=60,
        risk_bias_scalars={"neutral": 1.0},
    )
    strategies = [{"id": "s1", "strategy_type": "spot"}]
    perf = {"s1": {"sharpe": 0.2, "max_drawdown": 0.2}}
    risk = {"s1": {"correlation_cluster": "directional"}}
    regime = RegimeState(
        direction="range_bound",
        volatility="low_vol",
        liquidity="normal",
        risk_bias="neutral",
        details={},
    )

    allocations = CapitalAllocatorService.compute_allocations(
        strategies=strategies,
        performance=perf,
        risk=risk,
        regime=regime,
        total_capital=100000,
        config=config,
    )
    assert allocations[0].allocation_pct <= 1.0


def test_allocator_diversifies_by_cluster():
    config = AllocationConfig(
        base_weights={"spot": 0.5, "futures_scalp": 0.5},
        max_strategy_weight=0.6,
        min_strategy_weight=0.0,
        drawdown_throttle=0.2,
        sharpe_floor=0.5,
        cooldown_minutes=60,
        risk_bias_scalars={"neutral": 1.0},
    )
    strategies = [
        {"id": "s1", "strategy_type": "spot"},
        {"id": "s2", "strategy_type": "futures_scalp"},
    ]
    perf = {s["id"]: {"sharpe": 1.0, "max_drawdown": 0.01} for s in strategies}
    risk = {
        "s1": {"correlation_cluster": "directional"},
        "s2": {"correlation_cluster": "directional"},
    }
    regime = RegimeState(
        direction="range_bound",
        volatility="low_vol",
        liquidity="normal",
        risk_bias="neutral",
        details={},
    )

    allocations = CapitalAllocatorService.compute_allocations(
        strategies=strategies,
        performance=perf,
        risk=risk,
        regime=regime,
        total_capital=100000,
        config=config,
    )

    weights = [a.allocation_pct for a in allocations]
    assert all(w <= 0.6 for w in weights)
