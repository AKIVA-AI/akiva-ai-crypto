"""Tests for capital_allocation_agent.py."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from app.agents.base_agent import AgentChannel, AgentMessage
from app.agents.capital_allocation_agent import (
    CapitalAllocationAgent,
    PortfolioAllocation,
    StrategyAllocation,
)


def _make(**kw):
    defaults = {"total_capital": 100000.0}
    defaults.update(kw)
    a = CapitalAllocationAgent(**defaults)
    a._redis = AsyncMock()
    a._http_client = AsyncMock()
    a._supabase_url = ""
    a._supabase_key = ""
    return a


class TestStrategyAlloc:
    def test_fields(self):
        sa = StrategyAllocation("s1", 0.5, 1000, 5000, False, None, 0.8, 0.1)
        assert sa.strategy_id == "s1"


class TestPortfolioAlloc:
    def test_to_dict(self):
        alloc = PortfolioAllocation(
            allocations={
                "s1": StrategyAllocation("s1", 0.3, 600, 3000, False, None, 0.5, 0.0)
            },
            total_capital=100000,
            deployed_capital=30000,
            cash_reserve_pct=0.7,
            regime_multiplier=1.0,
            decided_at="now",
        )
        assert "s1" in alloc.to_dict()["allocations"]


class TestInit:
    def test_defaults(self):
        assert CapitalAllocationAgent()._total_capital == 100000.0

    def test_custom(self):
        assert CapitalAllocationAgent(total_capital=500000)._total_capital == 500000

    def test_initial_alloc(self):
        assert (
            "trend_following"
            in CapitalAllocationAgent()._current_allocation.allocations
        )

    def test_initial_weights_halved(self):
        tf = CapitalAllocationAgent()._current_allocation.allocations["trend_following"]
        assert tf.weight == pytest.approx(0.30 * 0.5)

    def test_base_sum_one(self):
        assert sum(CapitalAllocationAgent()._base_weights.values()) == pytest.approx(
            1.0
        )


class TestPerfScore:
    def test_no_metrics(self):
        assert _make()._calculate_performance_score({}) == 0.5

    def test_insufficient(self):
        assert (
            _make()._calculate_performance_score(
                {"trade_count": 3, "win_count": 2, "total_pnl": 100}
            )
            == 0.5
        )

    def test_good(self):
        assert (
            _make()._calculate_performance_score(
                {"trade_count": 20, "win_count": 14, "total_pnl": 200}
            )
            > 0.5
        )

    def test_bad(self):
        assert (
            _make()._calculate_performance_score(
                {"trade_count": 20, "win_count": 5, "total_pnl": -500}
            )
            < 1.0
        )


class TestCorrPenalty:
    def test_uncorrelated(self):
        assert _make()._calculate_correlation_penalty("mean_reversion") == 0.0

    def test_correlated(self):
        assert 0.0 <= _make()._calculate_correlation_penalty("trend_following") <= 0.5


class TestReallocate:
    async def test_updates(self):
        a = _make()
        a._current_allocation.decided_at = "2020-01-01T00:00:00"
        await a._reallocate()
        assert a._current_allocation.decided_at != "2020-01-01T00:00:00"

    async def test_quarantined(self):
        a = _make()
        a._quarantined["trend_following"] = "bad"
        await a._reallocate()
        assert a._current_allocation.allocations["trend_following"].weight == 0.0

    async def test_regime(self):
        a = _make()
        a._regime_multiplier = 0.5
        await a._reallocate()

    async def test_drawdown(self):
        a = _make()
        a._strategy_metrics["trend_following"] = {
            "trade_count": 20,
            "win_count": 10,
            "total_pnl": 50,
            "max_drawdown": 0.12,
            "peak_pnl": 200,
            "total_slippage": 0.01,
            "loss_streak": 0,
            "daily_pnl": 0,
            "last_trade_date": None,
        }
        await a._reallocate()
        assert a._current_allocation.allocations["trend_following"].weight < 0.30


class TestQuarantine:
    async def test_quarantine(self):
        a = _make()
        await a._quarantine_strategy("trend_following", "loss")
        assert a._current_allocation.allocations["trend_following"].weight == 0.0

    async def test_already(self):
        a = _make()
        a._quarantined["trend_following"] = "old"
        await a._quarantine_strategy("trend_following", "new")
        assert a._quarantined["trend_following"] == "old"

    async def test_unquarantine(self):
        a = _make()
        a._quarantined["trend_following"] = "t"
        a._current_allocation.allocations["trend_following"].is_quarantined = True
        await a.unquarantine_strategy("trend_following")
        assert a._current_allocation.allocations[
            "trend_following"
        ].weight == pytest.approx(0.30 * 0.25)

    async def test_unquarantine_not(self):
        await _make().unquarantine_strategy("trend_following")

    async def test_check_drawdown(self):
        a = _make()
        await a._check_quarantine_conditions(
            "s1",
            {
                "max_drawdown": 0.20,
                "loss_streak": 0,
                "trade_count": 5,
                "win_count": 3,
                "total_pnl": 100,
                "total_slippage": 0.001,
            },
        )
        assert "s1" in a._quarantined

    async def test_check_loss_streak(self):
        a = _make()
        await a._check_quarantine_conditions(
            "s1",
            {
                "max_drawdown": 0.01,
                "loss_streak": 5,
                "trade_count": 5,
                "win_count": 0,
                "total_pnl": -50,
                "total_slippage": 0.001,
            },
        )
        assert "s1" in a._quarantined

    async def test_check_neg_exp(self):
        a = _make()
        await a._check_quarantine_conditions(
            "s1",
            {
                "max_drawdown": 0.01,
                "loss_streak": 0,
                "trade_count": 15,
                "win_count": 3,
                "total_pnl": -100,
                "total_slippage": 0.001,
            },
        )
        assert "s1" in a._quarantined

    async def test_check_no_trigger(self):
        a = _make()
        await a._check_quarantine_conditions(
            "s1",
            {
                "max_drawdown": 0.01,
                "loss_streak": 0,
                "trade_count": 5,
                "win_count": 4,
                "total_pnl": 100,
                "total_slippage": 0.001,
            },
        )
        assert "s1" not in a._quarantined


class TestProcessFill:
    async def test_basic(self):
        a = _make()
        await a._process_fill({"strategy": "s1", "pnl": 50, "slippage": 0.001})
        assert a._strategy_metrics["s1"]["trade_count"] == 1

    async def test_loss(self):
        a = _make()
        await a._process_fill({"strategy": "s1", "pnl": -30, "slippage": 0.001})
        assert a._strategy_metrics["s1"]["loss_streak"] == 1

    async def test_no_strategy(self):
        a = _make()
        await a._process_fill({"pnl": 50})
        assert len(a._strategy_metrics) == 0


class TestProcessControl:
    async def test_meta(self):
        a = _make()
        await a._process_control(
            {"command": "meta_decision", "decision": {"regime": "crisis"}}
        )
        assert a._regime_multiplier == 0.0

    async def test_unknown(self):
        a = _make()
        old = a._current_regime
        await a._process_control({"command": "other"})
        assert a._current_regime == old


class TestGetters:
    def test_alloc(self):
        assert _make().get_allocation("trend_following") is not None

    def test_alloc_miss(self):
        assert _make().get_allocation("x") is None

    def test_risk(self):
        assert _make().get_risk_budget("trend_following") > 0

    def test_risk_miss(self):
        assert _make().get_risk_budget("x") == 0.0

    def test_exp(self):
        assert _make().get_exposure_cap("trend_following") > 0

    def test_exp_miss(self):
        assert _make().get_exposure_cap("x") == 0.0


class TestHandleMsg:
    async def test_fill(self):
        a = _make()
        msg = AgentMessage.create(
            source="e",
            channel=AgentChannel.FILLS,
            payload={"strategy": "s1", "pnl": 10, "slippage": 0},
        )
        await a.handle_message(msg)
        assert "s1" in a._strategy_metrics

    async def test_control(self):
        a = _make()
        msg = AgentMessage.create(
            source="m",
            channel=AgentChannel.CONTROL,
            payload={"command": "meta_decision", "decision": {"regime": "volatile"}},
        )
        await a.handle_message(msg)
        assert a._regime_multiplier == 0.3


class TestCycle:
    async def test_skip(self):
        a = _make()
        a._last_reallocation = datetime.utcnow()
        old = a._current_allocation.decided_at
        await a.cycle()
        assert a._current_allocation.decided_at == old

    async def test_reallocates(self):
        a = _make()
        a._last_reallocation = datetime.utcnow() - timedelta(seconds=120)
        # Set decided_at to a clearly old value so the comparison is unambiguous
        a._current_allocation.decided_at = "2020-01-01T00:00:00"
        await a.cycle()
        assert a._current_allocation.decided_at != "2020-01-01T00:00:00"


class TestHooks:
    async def test_on_start(self):
        await _make().on_start()

    async def test_on_pause(self):
        a = _make()
        await a.on_pause()
        for al in a._current_allocation.allocations.values():
            assert al.weight == 0.0

    async def test_on_resume(self):
        a = _make()
        await a.on_pause()
        await a.on_resume()
        assert any(al.weight > 0 for al in a._current_allocation.allocations.values())


class TestEdgeCases:
    def test_zero_cap(self):
        for al in _make(total_capital=0.0)._current_allocation.allocations.values():
            assert al.risk_budget_usd == 0.0

    async def test_all_quarantined(self):
        a = _make()
        for s in a._base_weights:
            a._quarantined[s] = "t"
        await a._reallocate()
        assert (
            sum(al.weight for al in a._current_allocation.allocations.values()) == 0.0
        )
