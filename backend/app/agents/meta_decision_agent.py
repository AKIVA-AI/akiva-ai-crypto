"""
Meta-Decision Agent - The supreme authority for trading permissions.

This agent does NOT trade and does NOT predict prices.
It decides WHETHER trading is allowed at all, and at what intensity.
It has VETO POWER over all strategy agents.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict

from .base_agent import BaseAgent, AgentChannel, AgentMessage

logger = logging.getLogger(__name__)


class GlobalTradingState(str, Enum):
    """System-wide trading permission state"""
    HALTED = "halted"           # No trading whatsoever
    REDUCE_ONLY = "reduce_only" # Only position-closing trades
    NORMAL = "normal"           # Full trading allowed


class StrategyState(str, Enum):
    """Per-strategy permission state"""
    ENABLE = "enable"           # Strategy can trade
    DISABLE = "disable"         # Strategy cannot trade
    REDUCE_SIZE = "reduce_size" # Strategy trades at reduced size


class RegimeType(str, Enum):
    """Market regime classification"""
    TRENDING = "trending"
    RANGING = "ranging"
    CHOPPY = "choppy"
    VOLATILE = "volatile"
    CRISIS = "crisis"


@dataclass
class MetaDecision:
    """Binding output from Meta-Decision Agent"""
    global_state: GlobalTradingState
    strategy_states: Dict[str, StrategyState]
    size_multipliers: Dict[str, float]
    regime: RegimeType
    confidence: float
    reason_codes: List[str]
    decided_at: str
    expires_at: str
    
    def to_dict(self) -> Dict:
        return {
            "global_state": self.global_state.value,
            "strategy_states": {k: v.value for k, v in self.strategy_states.items()},
            "size_multipliers": self.size_multipliers,
            "regime": self.regime.value,
            "confidence": self.confidence,
            "reason_codes": self.reason_codes,
            "decided_at": self.decided_at,
            "expires_at": self.expires_at
        }


class MetaDecisionAgent(BaseAgent):
    """
    Meta-Decision Agent - The supreme authority for trading permissions.
    
    Purpose: Decide whether trading is allowed at all, and at what intensity.
    Authority: Has veto power over all strategy agents.
    
    Inputs (aggregated from other agents):
    - Volatility regime
    - Trend vs chop classification
    - Liquidity / spread conditions
    - Correlation regime
    - Recent execution quality
    - Recent strategy performance vs expectation
    - System stress indicators
    
    Outputs (binding):
    - GLOBAL_STATE: HALTED | REDUCE_ONLY | NORMAL
    - Per-strategy state: ENABLE | DISABLE | REDUCE_SIZE
    - Size multipliers
    - Reason codes (auditable)
    
    Rules:
    - If inputs are missing, anomalous, or conflicting → fail safe to DISABLE
    - This agent must be consulted before any trade intent is approved
    """
    
    def __init__(
        self,
        agent_id: str = "meta-decision-agent-01",
        redis_url: str = "redis://localhost:6379"
    ):
        # Subscribe to all data feeds needed for decision making
        super().__init__(
            agent_id=agent_id,
            agent_type="meta-decision",
            redis_url=redis_url,
            subscribed_channels=[
                AgentChannel.MARKET_DATA,
                AgentChannel.HEARTBEAT,
                AgentChannel.FILLS,
                AgentChannel.ALERTS
            ]
        )
        
        # Current decision (always starts conservative)
        self._current_decision = MetaDecision(
            global_state=GlobalTradingState.HALTED,
            strategy_states={},
            size_multipliers={},
            regime=RegimeType.CHOPPY,
            confidence=0.0,
            reason_codes=["system_initializing"],
            decided_at=datetime.utcnow().isoformat(),
            expires_at=(datetime.utcnow() + timedelta(minutes=5)).isoformat()
        )
        
        # Aggregated inputs
        self._volatility_data: Dict[str, float] = {}
        self._liquidity_data: Dict[str, Dict] = {}
        self._execution_quality: Dict[str, Dict] = {}
        self._strategy_performance: Dict[str, Dict] = {}
        self._correlation_matrix: Dict[str, float] = {}
        self._system_stress: Dict[str, Any] = {}
        self._agent_health: Dict[str, Dict] = {}
        
        # Thresholds for regime classification
        self._thresholds = {
            "volatility_crisis": 0.05,      # 5% 1-min vol = crisis
            "volatility_high": 0.02,        # 2% = high volatility
            "volatility_normal": 0.01,      # 1% = normal
            "spread_degraded": 0.003,       # 0.3% spread = degraded
            "execution_quality_min": 0.95,  # 95% fill rate minimum
            "slippage_max": 0.002,          # 0.2% max avg slippage
            "daily_loss_warning": -0.02,    # -2% daily = warning
            "daily_loss_halt": -0.05,       # -5% daily = halt
            "drawdown_warning": -0.08,      # -8% drawdown = warning
            "drawdown_halt": -0.15,         # -15% drawdown = halt
            "correlation_high": 0.7,        # 70% correlation = reduce exposure
        }
        
        # Strategy registry
        self._registered_strategies = [
            "trend_following",
            "mean_reversion",
            "funding_arbitrage",
            "momentum",
            "breakout"
        ]
        
        self._decision_interval = 5.0  # Re-evaluate every 5 seconds
        self._last_decision_time = datetime.utcnow()
        
    async def handle_message(self, message: AgentMessage):
        """Process incoming data from various agents"""
        try:
            if message.channel == AgentChannel.MARKET_DATA.value:
                await self._process_market_data(message.payload)
            elif message.channel == AgentChannel.HEARTBEAT.value:
                await self._process_heartbeat(message.payload)
            elif message.channel == AgentChannel.FILLS.value:
                await self._process_fill(message.payload)
            elif message.channel == AgentChannel.ALERTS.value:
                await self._process_alert(message.payload)
        except Exception as e:
            logger.error(f"[{self.agent_id}] Error processing message: {e}")
            # On any error, fail safe
            await self._fail_safe("message_processing_error", str(e))
    
    async def _process_market_data(self, data: Dict):
        """Update volatility and liquidity indicators"""
        instrument = data.get("instrument", "unknown")
        
        # Calculate volatility from price changes
        price = data.get("price", 0)
        price_change = data.get("price_change_1m", 0)
        
        if price > 0:
            volatility = abs(price_change) / price
            self._volatility_data[instrument] = volatility
        
        # Track liquidity metrics
        spread = data.get("spread", 0)
        depth = data.get("depth", 0)
        self._liquidity_data[instrument] = {
            "spread": spread,
            "depth": depth,
            "updated_at": datetime.utcnow().isoformat()
        }
    
    async def _process_heartbeat(self, data: Dict):
        """Track agent health"""
        agent_id = data.get("agent_id", "unknown")
        self._agent_health[agent_id] = {
            "status": data.get("status"),
            "metrics": data.get("metrics", {}),
            "last_seen": datetime.utcnow().isoformat()
        }
    
    async def _process_fill(self, data: Dict):
        """Track execution quality"""
        strategy = data.get("strategy", "unknown")
        slippage = data.get("slippage", 0)
        latency = data.get("latency_ms", 0)
        
        if strategy not in self._execution_quality:
            self._execution_quality[strategy] = {
                "fills": 0,
                "total_slippage": 0,
                "total_latency": 0
            }
        
        eq = self._execution_quality[strategy]
        eq["fills"] += 1
        eq["total_slippage"] += abs(slippage)
        eq["total_latency"] += latency
        eq["avg_slippage"] = eq["total_slippage"] / eq["fills"]
        eq["avg_latency"] = eq["total_latency"] / eq["fills"]
    
    async def _process_alert(self, data: Dict):
        """Track system stress from alerts"""
        severity = data.get("severity", "info")
        source = data.get("source", "unknown")
        
        # Increment stress indicators
        if severity == "critical":
            self._system_stress["critical_alerts"] = self._system_stress.get("critical_alerts", 0) + 1
        elif severity == "warning":
            self._system_stress["warning_alerts"] = self._system_stress.get("warning_alerts", 0) + 1
    
    async def cycle(self):
        """Main decision cycle"""
        now = datetime.utcnow()
        
        # Only re-evaluate at intervals
        if (now - self._last_decision_time).total_seconds() < self._decision_interval:
            await asyncio.sleep(0.1)
            return
        
        self._last_decision_time = now
        
        # Make new decision
        decision = await self._make_decision()
        
        # If decision changed, broadcast it
        if decision.global_state != self._current_decision.global_state:
            logger.warning(
                f"[{self.agent_id}] Global state changed: "
                f"{self._current_decision.global_state.value} → {decision.global_state.value}"
            )
        
        self._current_decision = decision
        
        # Broadcast the binding decision
        await self._broadcast_decision(decision)
        
        await asyncio.sleep(0.1)
    
    async def _make_decision(self) -> MetaDecision:
        """
        Core decision logic.
        CRITICAL: If inputs are missing, anomalous, or conflicting → fail safe to DISABLE
        """
        reason_codes = []
        global_state = GlobalTradingState.NORMAL
        strategy_states = {s: StrategyState.ENABLE for s in self._registered_strategies}
        size_multipliers = {s: 1.0 for s in self._registered_strategies}
        confidence = 1.0
        
        # Check 1: Data freshness - if no market data, HALT
        if not self._volatility_data:
            reason_codes.append("no_market_data")
            return MetaDecision(
                global_state=GlobalTradingState.HALTED,
                strategy_states={s: StrategyState.DISABLE for s in self._registered_strategies},
                size_multipliers={s: 0.0 for s in self._registered_strategies},
                regime=RegimeType.CHOPPY,
                confidence=0.0,
                reason_codes=reason_codes,
                decided_at=datetime.utcnow().isoformat(),
                expires_at=(datetime.utcnow() + timedelta(minutes=1)).isoformat()
            )
        
        # Check 2: Agent health - if critical agents offline, HALT
        critical_agents = ["risk-agent-01", "execution-agent-01"]
        for agent_id in critical_agents:
            health = self._agent_health.get(agent_id)
            if not health:
                reason_codes.append(f"agent_missing:{agent_id}")
                global_state = GlobalTradingState.HALTED
                confidence *= 0.0
        
        if global_state == GlobalTradingState.HALTED:
            return MetaDecision(
                global_state=global_state,
                strategy_states={s: StrategyState.DISABLE for s in self._registered_strategies},
                size_multipliers={s: 0.0 for s in self._registered_strategies},
                regime=RegimeType.CRISIS,
                confidence=confidence,
                reason_codes=reason_codes,
                decided_at=datetime.utcnow().isoformat(),
                expires_at=(datetime.utcnow() + timedelta(minutes=1)).isoformat()
            )
        
        # Check 3: Volatility regime
        avg_volatility = sum(self._volatility_data.values()) / len(self._volatility_data) if self._volatility_data else 0
        regime = self._classify_regime(avg_volatility)
        
        if regime == RegimeType.CRISIS:
            reason_codes.append("volatility_crisis")
            global_state = GlobalTradingState.HALTED
            confidence *= 0.1
        elif regime == RegimeType.VOLATILE:
            reason_codes.append("high_volatility")
            global_state = GlobalTradingState.REDUCE_ONLY
            for s in strategy_states:
                size_multipliers[s] = 0.25
            confidence *= 0.5
        elif regime == RegimeType.CHOPPY:
            reason_codes.append("choppy_market")
            # Disable trend strategies in choppy markets
            strategy_states["trend_following"] = StrategyState.DISABLE
            strategy_states["momentum"] = StrategyState.DISABLE
            for s in strategy_states:
                size_multipliers[s] *= 0.5
            confidence *= 0.7
        
        # Check 4: Liquidity / spread conditions
        degraded_liquidity = False
        for instrument, liq in self._liquidity_data.items():
            if liq.get("spread", 0) > self._thresholds["spread_degraded"]:
                degraded_liquidity = True
                reason_codes.append(f"spread_wide:{instrument}")
        
        if degraded_liquidity:
            for s in size_multipliers:
                size_multipliers[s] *= 0.5
            confidence *= 0.8
        
        # Check 5: Execution quality
        for strategy, eq in self._execution_quality.items():
            if eq.get("avg_slippage", 0) > self._thresholds["slippage_max"]:
                reason_codes.append(f"high_slippage:{strategy}")
                strategy_states[strategy] = StrategyState.REDUCE_SIZE
                size_multipliers[strategy] *= 0.5
        
        # Check 6: System stress
        critical_alerts = self._system_stress.get("critical_alerts", 0)
        if critical_alerts > 3:
            reason_codes.append("excessive_critical_alerts")
            global_state = GlobalTradingState.REDUCE_ONLY
            confidence *= 0.5
        
        # Check 7: Correlation regime (simplified)
        # If many strategies correlated, reduce overall exposure
        high_correlation = sum(1 for c in self._correlation_matrix.values() if c > self._thresholds["correlation_high"])
        if high_correlation > 2:
            reason_codes.append("high_correlation")
            for s in size_multipliers:
                size_multipliers[s] *= 0.7
        
        # Finalize: if global state is not normal, disable non-essential strategies
        if global_state != GlobalTradingState.NORMAL:
            # Only keep conservative strategies
            for s in ["momentum", "breakout", "funding_arbitrage"]:
                if s in strategy_states:
                    strategy_states[s] = StrategyState.DISABLE
        
        return MetaDecision(
            global_state=global_state,
            strategy_states=strategy_states,
            size_multipliers=size_multipliers,
            regime=regime,
            confidence=max(0.0, min(1.0, confidence)),
            reason_codes=reason_codes if reason_codes else ["conditions_normal"],
            decided_at=datetime.utcnow().isoformat(),
            expires_at=(datetime.utcnow() + timedelta(seconds=30)).isoformat()
        )
    
    def _classify_regime(self, volatility: float) -> RegimeType:
        """Classify market regime based on volatility"""
        if volatility >= self._thresholds["volatility_crisis"]:
            return RegimeType.CRISIS
        elif volatility >= self._thresholds["volatility_high"]:
            return RegimeType.VOLATILE
        elif volatility >= self._thresholds["volatility_normal"]:
            return RegimeType.CHOPPY
        else:
            return RegimeType.TRENDING  # Low vol often means trending
    
    async def _broadcast_decision(self, decision: MetaDecision):
        """Broadcast the binding decision to all agents"""
        # Add new channel for meta decisions
        await self.publish(
            AgentChannel.CONTROL,
            {
                "command": "meta_decision",
                "decision": decision.to_dict(),
                "source": self.agent_id
            }
        )
        
        logger.info(
            f"[{self.agent_id}] Decision broadcast: "
            f"state={decision.global_state.value}, "
            f"regime={decision.regime.value}, "
            f"confidence={decision.confidence:.2f}, "
            f"reasons={decision.reason_codes}"
        )
    
    async def _fail_safe(self, reason: str, details: str):
        """Fail safe to HALTED state"""
        self._current_decision = MetaDecision(
            global_state=GlobalTradingState.HALTED,
            strategy_states={s: StrategyState.DISABLE for s in self._registered_strategies},
            size_multipliers={s: 0.0 for s in self._registered_strategies},
            regime=RegimeType.CRISIS,
            confidence=0.0,
            reason_codes=[reason, "fail_safe_activated"],
            decided_at=datetime.utcnow().isoformat(),
            expires_at=(datetime.utcnow() + timedelta(minutes=5)).isoformat()
        )
        
        await self._broadcast_decision(self._current_decision)
        
        await self.send_alert(
            "critical",
            f"Meta-Decision Fail Safe: {reason}",
            details,
            {"decision": self._current_decision.to_dict()}
        )
        
        logger.critical(f"[{self.agent_id}] FAIL SAFE: {reason} - {details}")
    
    def get_current_decision(self) -> MetaDecision:
        """Get the current binding decision"""
        return self._current_decision
    
    def can_strategy_trade(self, strategy_id: str) -> bool:
        """Check if a specific strategy is allowed to trade"""
        if self._current_decision.global_state == GlobalTradingState.HALTED:
            return False
        state = self._current_decision.strategy_states.get(strategy_id, StrategyState.DISABLE)
        return state != StrategyState.DISABLE
    
    def get_size_multiplier(self, strategy_id: str) -> float:
        """Get the size multiplier for a strategy"""
        return self._current_decision.size_multipliers.get(strategy_id, 0.0)
    
    async def on_start(self):
        """Initialize on start"""
        logger.info(
            f"[{self.agent_id}] Meta-Decision Agent starting - "
            f"strategies: {self._registered_strategies}"
        )
        # Start in HALTED until we collect enough data
        logger.warning(f"[{self.agent_id}] Starting in HALTED state until data collected")
    
    async def on_pause(self):
        """On pause, halt all trading"""
        await self._fail_safe("agent_paused", "Meta-Decision Agent was paused")
    
    async def on_resume(self):
        """On resume, stay halted until next cycle evaluates"""
        logger.info(f"[{self.agent_id}] Resumed - will evaluate on next cycle")
