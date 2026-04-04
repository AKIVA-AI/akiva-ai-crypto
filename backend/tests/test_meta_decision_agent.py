"""Tests for meta_decision_agent.py."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from app.agents.base_agent import AgentChannel, AgentMessage
from app.agents.meta_decision_agent import (
    GlobalTradingState,
    MetaDecision,
    MetaDecisionAgent,
    RegimeType,
    StrategyState,
)


def _make():
    a = MetaDecisionAgent()
    a._redis = AsyncMock()
    a._http_client = AsyncMock()
    a._supabase_url = ""
    a._supabase_key = ""
    return a


class TestEnums:
    def test_global(self):
        assert (
            GlobalTradingState.HALTED == "halted"
            and GlobalTradingState.NORMAL == "normal"
        )

    def test_regime(self):
        assert RegimeType.CRISIS == "crisis" and RegimeType.TRENDING == "trending"


class TestMetaDecisionDC:
    def test_to_dict(self):
        d = MetaDecision(
            global_state=GlobalTradingState.NORMAL,
            strategy_states={"s1": StrategyState.ENABLE},
            size_multipliers={"s1": 1.0},
            regime=RegimeType.TRENDING,
            confidence=0.9,
            reason_codes=["ok"],
            decided_at="now",
            expires_at="later",
        )
        assert d.to_dict()["global_state"] == "normal"


class TestInit:
    def test_defaults(self):
        a = MetaDecisionAgent()
        assert a.agent_id == "meta-decision-agent-01"
        assert a._current_decision.global_state == GlobalTradingState.HALTED


class TestRegime:
    def test_crisis(self):
        assert _make()._classify_regime(0.06) == RegimeType.CRISIS

    def test_volatile(self):
        assert _make()._classify_regime(0.03) == RegimeType.VOLATILE

    def test_choppy(self):
        assert _make()._classify_regime(0.015) == RegimeType.CHOPPY

    def test_trending(self):
        assert _make()._classify_regime(0.005) == RegimeType.TRENDING


class TestMakeDecision:
    async def test_no_data(self):
        d = await _make()._make_decision()
        assert (
            d.global_state == GlobalTradingState.HALTED
            and "no_market_data" in d.reason_codes
        )

    async def test_missing_agents(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        assert (await a._make_decision()).global_state == GlobalTradingState.HALTED

    async def test_normal(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        assert (await a._make_decision()).global_state == GlobalTradingState.NORMAL

    async def test_crisis(self):
        a = _make()
        a._volatility_data = {"BTC": 0.06}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        assert (await a._make_decision()).global_state == GlobalTradingState.HALTED

    async def test_high_vol(self):
        a = _make()
        a._volatility_data = {"BTC": 0.03}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        assert (await a._make_decision()).global_state == GlobalTradingState.REDUCE_ONLY

    async def test_choppy_disables(self):
        a = _make()
        a._volatility_data = {"BTC": 0.015}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        d = await a._make_decision()
        assert d.strategy_states.get("trend_following") == StrategyState.DISABLE

    async def test_degraded_liq(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        a._liquidity_data = {"BTC": {"spread": 0.005}}
        assert any("spread_wide" in r for r in (await a._make_decision()).reason_codes)

    async def test_high_slippage(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        a._execution_quality = {"trend_following": {"avg_slippage": 0.005, "fills": 10}}
        assert (await a._make_decision()).strategy_states.get(
            "trend_following"
        ) == StrategyState.REDUCE_SIZE

    async def test_critical_alerts(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        a._system_stress = {"critical_alerts": 5}
        assert (await a._make_decision()).global_state == GlobalTradingState.REDUCE_ONLY

    async def test_high_corr(self):
        a = _make()
        a._volatility_data = {"BTC": 0.005}
        a._agent_health = {
            "risk-agent-01": {"status": "running"},
            "execution-agent-01": {"status": "running"},
        }
        a._correlation_matrix = {"a": 0.8, "b": 0.75, "c": 0.9}
        assert "high_correlation" in (await a._make_decision()).reason_codes


class TestMessageProc:
    async def test_market_data(self):
        a = _make()
        await a._process_market_data(
            {"instrument": "BTC", "price": 50000, "price_change_1m": 250}
        )
        assert "BTC" in a._volatility_data

    async def test_heartbeat(self):
        a = _make()
        await a._process_heartbeat({"agent_id": "r1", "status": "running"})
        assert "r1" in a._agent_health

    async def test_fill(self):
        a = _make()
        await a._process_fill({"strategy": "s1", "slippage": 0.001, "latency_ms": 50})
        assert a._execution_quality["s1"]["fills"] == 1

    async def test_alert_crit(self):
        a = _make()
        await a._process_alert({"severity": "critical"})
        assert a._system_stress.get("critical_alerts") == 1

    async def test_alert_warn(self):
        a = _make()
        await a._process_alert({"severity": "warning"})
        assert a._system_stress.get("warning_alerts") == 1


class TestHandleMsg:
    async def test_market(self):
        a = _make()
        msg = AgentMessage.create(
            source="x",
            channel=AgentChannel.MARKET_DATA,
            payload={"instrument": "ETH", "price": 3000, "price_change_1m": 30},
        )
        await a.handle_message(msg)
        assert "ETH" in a._volatility_data

    async def test_error_fail_safe(self):
        a = _make()

        async def bad(*args):
            raise ValueError("boom")

        a._process_market_data = bad
        msg = AgentMessage.create(
            source="x", channel=AgentChannel.MARKET_DATA, payload={}
        )
        await a.handle_message(msg)
        assert a._current_decision.global_state == GlobalTradingState.HALTED


class TestVeto:
    def test_halted_blocks(self):
        assert MetaDecisionAgent().can_strategy_trade("trend_following") is False

    def test_normal_enabled(self):
        a = MetaDecisionAgent()
        a._current_decision = MetaDecision(
            global_state=GlobalTradingState.NORMAL,
            strategy_states={"s1": StrategyState.ENABLE},
            size_multipliers={"s1": 1.0},
            regime=RegimeType.TRENDING,
            confidence=1.0,
            reason_codes=[],
            decided_at="n",
            expires_at="l",
        )
        assert a.can_strategy_trade("s1") is True

    def test_disabled(self):
        a = MetaDecisionAgent()
        a._current_decision = MetaDecision(
            global_state=GlobalTradingState.NORMAL,
            strategy_states={"s1": StrategyState.DISABLE},
            size_multipliers={"s1": 0.0},
            regime=RegimeType.CHOPPY,
            confidence=0.5,
            reason_codes=[],
            decided_at="n",
            expires_at="l",
        )
        assert a.can_strategy_trade("s1") is False

    def test_unknown_default_disable(self):
        a = MetaDecisionAgent()
        a._current_decision = MetaDecision(
            global_state=GlobalTradingState.NORMAL,
            strategy_states={},
            size_multipliers={},
            regime=RegimeType.TRENDING,
            confidence=1.0,
            reason_codes=[],
            decided_at="n",
            expires_at="l",
        )
        assert a.can_strategy_trade("unk") is False

    def test_size_mult(self):
        a = MetaDecisionAgent()
        a._current_decision = MetaDecision(
            global_state=GlobalTradingState.NORMAL,
            strategy_states={"s1": StrategyState.ENABLE},
            size_multipliers={"s1": 0.5},
            regime=RegimeType.TRENDING,
            confidence=1.0,
            reason_codes=[],
            decided_at="n",
            expires_at="l",
        )
        assert (
            a.get_size_multiplier("s1") == 0.5 and a.get_size_multiplier("unk") == 0.0
        )


class TestFailSafe:
    async def test_halts(self):
        a = _make()
        await a._fail_safe("r", "d")
        assert a._current_decision.global_state == GlobalTradingState.HALTED


class TestCycle:
    async def test_skip(self):
        a = _make()
        a._last_decision_time = datetime.utcnow()
        await a.cycle()

    async def test_decides(self):
        a = _make()
        a._last_decision_time = datetime.utcnow() - timedelta(seconds=10)
        await a.cycle()
        assert a._current_decision.global_state == GlobalTradingState.HALTED


class TestHooks:
    async def test_on_start(self):
        await _make().on_start()

    async def test_on_pause(self):
        a = _make()
        await a.on_pause()
        assert a._current_decision.global_state == GlobalTradingState.HALTED

    async def test_on_resume(self):
        await _make().on_resume()

    def test_get_current(self):
        assert isinstance(MetaDecisionAgent().get_current_decision(), MetaDecision)
