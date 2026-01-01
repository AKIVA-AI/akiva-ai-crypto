"""
Capital Allocation Agent - Manages capital distribution across strategies.

This agent manages HOW MUCH capital each strategy receives, not trade direction.
It dynamically adjusts allocations based on performance, risk, and regime.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from .base_agent import BaseAgent, AgentChannel, AgentMessage

logger = logging.getLogger(__name__)


@dataclass
class StrategyAllocation:
    """Capital allocation for a single strategy"""
    strategy_id: str
    weight: float                    # 0.0 to 1.0
    risk_budget_usd: float           # Max USD at risk
    exposure_cap_usd: float          # Max position size
    is_quarantined: bool             # If true, weight = 0
    quarantine_reason: Optional[str]
    performance_score: float         # Recent performance metric
    correlation_penalty: float       # Penalty for correlated exposure


@dataclass
class PortfolioAllocation:
    """Complete portfolio allocation state"""
    allocations: Dict[str, StrategyAllocation]
    total_capital: float
    deployed_capital: float
    cash_reserve_pct: float
    regime_multiplier: float
    decided_at: str
    
    def to_dict(self) -> Dict:
        return {
            "allocations": {
                k: {
                    "strategy_id": v.strategy_id,
                    "weight": v.weight,
                    "risk_budget_usd": v.risk_budget_usd,
                    "exposure_cap_usd": v.exposure_cap_usd,
                    "is_quarantined": v.is_quarantined,
                    "quarantine_reason": v.quarantine_reason,
                    "performance_score": v.performance_score,
                    "correlation_penalty": v.correlation_penalty
                }
                for k, v in self.allocations.items()
            },
            "total_capital": self.total_capital,
            "deployed_capital": self.deployed_capital,
            "cash_reserve_pct": self.cash_reserve_pct,
            "regime_multiplier": self.regime_multiplier,
            "decided_at": self.decided_at
        }


class CapitalAllocationAgent(BaseAgent):
    """
    Capital Allocation Agent - Manages how much capital each strategy receives.
    
    Inputs:
    - Strategy performance metrics
    - Uncertainty estimates
    - Correlation across strategies
    - Drawdowns
    - Regime labels from Meta-Decision Agent
    
    Outputs:
    - Dynamic strategy weights
    - Per-strategy risk budgets
    - Exposure caps
    
    Rules:
    - Reduce exposure during volatility spikes
    - Reduce exposure during drawdowns
    - Penalize correlated strategies
    - Zero weight for quarantined strategies
    """
    
    def __init__(
        self,
        agent_id: str = "capital-allocation-agent-01",
        redis_url: str = "redis://localhost:6379",
        total_capital: float = 100000.0
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="capital-allocation",
            redis_url=redis_url,
            subscribed_channels=[
                AgentChannel.FILLS,
                AgentChannel.CONTROL,
                AgentChannel.HEARTBEAT
            ]
        )
        
        self._total_capital = total_capital
        
        # Strategy performance tracking
        self._strategy_metrics: Dict[str, Dict] = {}
        
        # Correlation tracking (simplified)
        self._correlation_matrix: Dict[str, Dict[str, float]] = {}
        
        # Current regime from Meta-Decision Agent
        self._current_regime = "normal"
        self._regime_multiplier = 1.0
        
        # Base weights (before adjustments)
        self._base_weights = {
            "trend_following": 0.30,
            "mean_reversion": 0.25,
            "funding_arbitrage": 0.20,
            "momentum": 0.15,
            "breakout": 0.10
        }
        
        # Quarantine list
        self._quarantined: Dict[str, str] = {}  # strategy_id -> reason
        
        # Thresholds for automatic quarantine
        self._quarantine_thresholds = {
            "max_drawdown_pct": 0.15,           # -15% strategy drawdown
            "min_sharpe_30d": 0.5,              # Sharpe below 0.5
            "max_loss_streak": 5,               # 5 consecutive losses
            "max_daily_loss_pct": 0.03,         # -3% in single day
            "min_expectancy": 0.0,              # Negative expectancy
            "max_slippage_avg": 0.003           # 0.3% average slippage
        }
        
        # Current allocation
        self._current_allocation = self._create_initial_allocation()
        
        self._reallocation_interval = 60.0  # Rebalance every 60 seconds
        self._last_reallocation = datetime.utcnow()
    
    def _create_initial_allocation(self) -> PortfolioAllocation:
        """Create initial conservative allocation"""
        allocations = {}
        
        for strategy_id, base_weight in self._base_weights.items():
            allocations[strategy_id] = StrategyAllocation(
                strategy_id=strategy_id,
                weight=base_weight * 0.5,  # Start at 50% of target
                risk_budget_usd=self._total_capital * base_weight * 0.02,  # 2% risk per strategy
                exposure_cap_usd=self._total_capital * base_weight * 0.5,
                is_quarantined=False,
                quarantine_reason=None,
                performance_score=0.5,
                correlation_penalty=0.0
            )
        
        return PortfolioAllocation(
            allocations=allocations,
            total_capital=self._total_capital,
            deployed_capital=0.0,
            cash_reserve_pct=0.3,  # 30% cash reserve initially
            regime_multiplier=0.5,  # Conservative start
            decided_at=datetime.utcnow().isoformat()
        )
    
    async def handle_message(self, message: AgentMessage):
        """Process incoming messages"""
        try:
            if message.channel == AgentChannel.FILLS.value:
                await self._process_fill(message.payload)
            elif message.channel == AgentChannel.CONTROL.value:
                await self._process_control(message.payload)
        except Exception as e:
            logger.error(f"[{self.agent_id}] Error processing message: {e}")
    
    async def _process_fill(self, data: Dict):
        """Track strategy performance from fills"""
        strategy_id = data.get("strategy")
        if not strategy_id:
            return
        
        pnl = data.get("pnl", 0)
        size_usd = data.get("size_usd", 0)
        slippage = data.get("slippage", 0)
        
        if strategy_id not in self._strategy_metrics:
            self._strategy_metrics[strategy_id] = {
                "total_pnl": 0,
                "trade_count": 0,
                "win_count": 0,
                "loss_streak": 0,
                "max_drawdown": 0,
                "peak_pnl": 0,
                "total_slippage": 0,
                "daily_pnl": 0,
                "last_trade_date": None
            }
        
        metrics = self._strategy_metrics[strategy_id]
        metrics["trade_count"] += 1
        metrics["total_pnl"] += pnl
        metrics["total_slippage"] += abs(slippage)
        
        # Track wins/losses
        if pnl > 0:
            metrics["win_count"] += 1
            metrics["loss_streak"] = 0
        else:
            metrics["loss_streak"] += 1
        
        # Track drawdown
        if metrics["total_pnl"] > metrics["peak_pnl"]:
            metrics["peak_pnl"] = metrics["total_pnl"]
        
        drawdown = (metrics["peak_pnl"] - metrics["total_pnl"]) / max(metrics["peak_pnl"], 1)
        if drawdown > metrics["max_drawdown"]:
            metrics["max_drawdown"] = drawdown
        
        # Check for auto-quarantine
        await self._check_quarantine_conditions(strategy_id, metrics)
    
    async def _process_control(self, data: Dict):
        """Process control messages including meta-decision updates"""
        command = data.get("command")
        
        if command == "meta_decision":
            decision = data.get("decision", {})
            self._current_regime = decision.get("regime", "normal")
            
            # Adjust regime multiplier based on regime
            regime_multipliers = {
                "trending": 1.0,
                "ranging": 0.8,
                "choppy": 0.5,
                "volatile": 0.3,
                "crisis": 0.0
            }
            self._regime_multiplier = regime_multipliers.get(self._current_regime, 0.5)
            
            logger.info(
                f"[{self.agent_id}] Regime update: {self._current_regime}, "
                f"multiplier: {self._regime_multiplier}"
            )
    
    async def _check_quarantine_conditions(self, strategy_id: str, metrics: Dict):
        """Check if strategy should be quarantined"""
        reasons = []
        
        # Check drawdown
        if metrics["max_drawdown"] > self._quarantine_thresholds["max_drawdown_pct"]:
            reasons.append(f"drawdown:{metrics['max_drawdown']:.1%}")
        
        # Check loss streak
        if metrics["loss_streak"] >= self._quarantine_thresholds["max_loss_streak"]:
            reasons.append(f"loss_streak:{metrics['loss_streak']}")
        
        # Check expectancy
        if metrics["trade_count"] > 10:  # Need enough trades
            win_rate = metrics["win_count"] / metrics["trade_count"]
            avg_pnl = metrics["total_pnl"] / metrics["trade_count"]
            if avg_pnl < self._quarantine_thresholds["min_expectancy"]:
                reasons.append(f"negative_expectancy:{avg_pnl:.2f}")
        
        # Check slippage
        if metrics["trade_count"] > 0:
            avg_slippage = metrics["total_slippage"] / metrics["trade_count"]
            if avg_slippage > self._quarantine_thresholds["max_slippage_avg"]:
                reasons.append(f"high_slippage:{avg_slippage:.4f}")
        
        if reasons:
            await self._quarantine_strategy(strategy_id, ", ".join(reasons))
    
    async def _quarantine_strategy(self, strategy_id: str, reason: str):
        """Quarantine a strategy (set weight to 0)"""
        if strategy_id in self._quarantined:
            return  # Already quarantined
        
        self._quarantined[strategy_id] = reason
        
        if strategy_id in self._current_allocation.allocations:
            alloc = self._current_allocation.allocations[strategy_id]
            alloc.is_quarantined = True
            alloc.quarantine_reason = reason
            alloc.weight = 0.0
            alloc.risk_budget_usd = 0.0
            alloc.exposure_cap_usd = 0.0
        
        logger.warning(f"[{self.agent_id}] QUARANTINED {strategy_id}: {reason}")
        
        await self.send_alert(
            "warning",
            f"Strategy Quarantined: {strategy_id}",
            reason,
            {"strategy_id": strategy_id}
        )
    
    async def unquarantine_strategy(self, strategy_id: str):
        """Manually restore a quarantined strategy"""
        if strategy_id in self._quarantined:
            del self._quarantined[strategy_id]
            
            if strategy_id in self._current_allocation.allocations:
                alloc = self._current_allocation.allocations[strategy_id]
                alloc.is_quarantined = False
                alloc.quarantine_reason = None
                # Start with reduced allocation
                base_weight = self._base_weights.get(strategy_id, 0.1)
                alloc.weight = base_weight * 0.25  # 25% of base initially
            
            logger.info(f"[{self.agent_id}] Unquarantined {strategy_id}")
    
    async def cycle(self):
        """Rebalancing cycle"""
        now = datetime.utcnow()
        
        if (now - self._last_reallocation).total_seconds() < self._reallocation_interval:
            await asyncio.sleep(0.5)
            return
        
        self._last_reallocation = now
        
        # Recalculate allocations
        await self._reallocate()
        
        # Broadcast new allocation
        await self._broadcast_allocation()
        
        await asyncio.sleep(0.5)
    
    async def _reallocate(self):
        """Calculate new allocations based on current state"""
        new_allocations = {}
        
        for strategy_id, base_weight in self._base_weights.items():
            # Start with base weight
            weight = base_weight
            
            # Apply regime multiplier
            weight *= self._regime_multiplier
            
            # Check if quarantined
            if strategy_id in self._quarantined:
                weight = 0.0
            else:
                # Apply performance adjustment
                metrics = self._strategy_metrics.get(strategy_id, {})
                performance_score = self._calculate_performance_score(metrics)
                weight *= performance_score
                
                # Apply correlation penalty
                correlation_penalty = self._calculate_correlation_penalty(strategy_id)
                weight *= (1 - correlation_penalty)
                
                # Apply drawdown reduction
                drawdown = metrics.get("max_drawdown", 0)
                if drawdown > 0.05:  # Start reducing at 5% drawdown
                    drawdown_factor = 1 - min(drawdown * 2, 0.8)  # Max 80% reduction
                    weight *= drawdown_factor
            
            # Normalize weight
            weight = max(0.0, min(1.0, weight))
            
            # Calculate USD amounts
            strategy_capital = self._total_capital * weight
            risk_budget = strategy_capital * 0.02  # 2% risk per strategy
            exposure_cap = strategy_capital * 2.0  # 2x leverage cap
            
            new_allocations[strategy_id] = StrategyAllocation(
                strategy_id=strategy_id,
                weight=weight,
                risk_budget_usd=risk_budget,
                exposure_cap_usd=exposure_cap,
                is_quarantined=strategy_id in self._quarantined,
                quarantine_reason=self._quarantined.get(strategy_id),
                performance_score=self._calculate_performance_score(
                    self._strategy_metrics.get(strategy_id, {})
                ),
                correlation_penalty=self._calculate_correlation_penalty(strategy_id)
            )
        
        # Calculate total deployed capital
        total_weight = sum(a.weight for a in new_allocations.values())
        deployed_capital = self._total_capital * total_weight
        cash_reserve_pct = 1 - total_weight
        
        self._current_allocation = PortfolioAllocation(
            allocations=new_allocations,
            total_capital=self._total_capital,
            deployed_capital=deployed_capital,
            cash_reserve_pct=cash_reserve_pct,
            regime_multiplier=self._regime_multiplier,
            decided_at=datetime.utcnow().isoformat()
        )
        
        logger.info(
            f"[{self.agent_id}] Reallocated: deployed={deployed_capital:.0f}, "
            f"cash_reserve={cash_reserve_pct:.1%}, regime_mult={self._regime_multiplier:.2f}"
        )
    
    def _calculate_performance_score(self, metrics: Dict) -> float:
        """Calculate performance score (0.0 to 1.5)"""
        if not metrics or metrics.get("trade_count", 0) < 5:
            return 0.5  # Default score for insufficient data
        
        trade_count = metrics["trade_count"]
        win_rate = metrics["win_count"] / trade_count
        avg_pnl = metrics["total_pnl"] / trade_count
        
        # Score based on win rate (0.3 to 0.7 → 0.5 to 1.0)
        win_rate_score = min(1.0, max(0.3, win_rate)) * 1.5
        
        # Score based on expectancy
        if avg_pnl > 0:
            expectancy_score = min(1.5, 1.0 + avg_pnl / 100)
        else:
            expectancy_score = max(0.0, 1.0 + avg_pnl / 50)  # Harsh penalty for losses
        
        # Combined score
        return min(1.5, (win_rate_score + expectancy_score) / 2)
    
    def _calculate_correlation_penalty(self, strategy_id: str) -> float:
        """Calculate penalty for correlated exposure (0.0 to 0.5)"""
        # Simplified: use predefined correlations
        correlation_groups = {
            "trend_following": ["momentum"],
            "momentum": ["trend_following", "breakout"],
            "breakout": ["momentum"],
            "mean_reversion": [],
            "funding_arbitrage": []
        }
        
        correlated = correlation_groups.get(strategy_id, [])
        
        # Penalty based on how many correlated strategies are active
        active_correlated = sum(
            1 for s in correlated 
            if s not in self._quarantined and 
            self._current_allocation.allocations.get(s, StrategyAllocation(s, 0, 0, 0, True, None, 0, 0)).weight > 0
        )
        
        return min(0.5, active_correlated * 0.15)
    
    async def _broadcast_allocation(self):
        """Broadcast current allocation to all agents"""
        await self.publish(
            AgentChannel.CONTROL,
            {
                "command": "capital_allocation",
                "allocation": self._current_allocation.to_dict(),
                "source": self.agent_id
            }
        )
    
    def get_allocation(self, strategy_id: str) -> Optional[StrategyAllocation]:
        """Get allocation for a specific strategy"""
        return self._current_allocation.allocations.get(strategy_id)
    
    def get_risk_budget(self, strategy_id: str) -> float:
        """Get risk budget for a strategy"""
        alloc = self.get_allocation(strategy_id)
        return alloc.risk_budget_usd if alloc else 0.0
    
    def get_exposure_cap(self, strategy_id: str) -> float:
        """Get exposure cap for a strategy"""
        alloc = self.get_allocation(strategy_id)
        return alloc.exposure_cap_usd if alloc else 0.0
    
    async def on_start(self):
        """Initialize on start"""
        logger.info(
            f"[{self.agent_id}] Capital Allocation Agent starting - "
            f"total_capital: ${self._total_capital:,.0f}"
        )
    
    async def on_pause(self):
        """On pause, zero all allocations"""
        for alloc in self._current_allocation.allocations.values():
            alloc.weight = 0.0
            alloc.risk_budget_usd = 0.0
            alloc.exposure_cap_usd = 0.0
        
        await self._broadcast_allocation()
        logger.warning(f"[{self.agent_id}] Paused - all allocations zeroed")
    
    async def on_resume(self):
        """On resume, recalculate allocations"""
        await self._reallocate()
        logger.info(f"[{self.agent_id}] Resumed - reallocating")
