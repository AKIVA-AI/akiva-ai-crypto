"""
Strategy Lifecycle Management - Handles strategy states and transitions.

Strategies must EARN the right to trade continuously through performance.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class StrategyLifecycleState(str, Enum):
    """Strategy lifecycle states"""
    ACTIVE = "active"           # Fully enabled, can trade
    QUARANTINED = "quarantined" # Temporarily disabled due to performance
    DISABLED = "disabled"       # Manually disabled
    PAPER_ONLY = "paper_only"   # Can only trade in paper mode


@dataclass
class StrategyStateTransition:
    """Record of a state transition"""
    from_state: StrategyLifecycleState
    to_state: StrategyLifecycleState
    reason: str
    triggered_by: str  # "automatic" or user_id
    timestamp: str


@dataclass
class StrategyLifecycle:
    """Complete lifecycle state for a strategy"""
    strategy_id: str
    current_state: StrategyLifecycleState
    state_entered_at: str
    transition_history: List[StrategyStateTransition] = field(default_factory=list)
    
    # Performance metrics for transition decisions
    edge_decay_pct: float = 0.0          # How much edge has decayed
    performance_vs_expectation: float = 1.0  # Actual/Expected performance
    current_drawdown_pct: float = 0.0
    execution_quality: float = 1.0       # 0 to 1
    
    # Quarantine info
    quarantine_reason: Optional[str] = None
    quarantine_expires_at: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            "strategy_id": self.strategy_id,
            "current_state": self.current_state.value,
            "state_entered_at": self.state_entered_at,
            "edge_decay_pct": self.edge_decay_pct,
            "performance_vs_expectation": self.performance_vs_expectation,
            "current_drawdown_pct": self.current_drawdown_pct,
            "execution_quality": self.execution_quality,
            "quarantine_reason": self.quarantine_reason,
            "quarantine_expires_at": self.quarantine_expires_at,
            "transition_count": len(self.transition_history)
        }


class StrategyLifecycleManager:
    """
    Manages strategy lifecycle transitions.
    
    Strategies must earn the right to trade through performance.
    Automatic transitions based on:
    - Edge decay
    - Performance vs expectation
    - Drawdown
    - Execution degradation
    """
    
    def __init__(self):
        self._strategies: Dict[str, StrategyLifecycle] = {}
        
        # Transition thresholds
        self._thresholds = {
            # ACTIVE -> QUARANTINED triggers
            "edge_decay_max": 0.30,           # 30% edge decay
            "performance_ratio_min": 0.70,   # 70% of expected
            "drawdown_quarantine": 0.10,     # 10% drawdown
            "execution_quality_min": 0.90,   # 90% execution quality
            
            # QUARANTINED -> ACTIVE triggers
            "quarantine_min_hours": 4,       # Minimum quarantine time
            "recovery_performance_min": 1.0, # Must meet expectation
            
            # QUARANTINED -> DISABLED triggers
            "max_quarantine_count": 3,       # 3 quarantines in 30 days
            "consecutive_quarantine": 2,     # 2 consecutive quarantines
            
            # PAPER_ONLY -> ACTIVE triggers
            "paper_profit_days": 5,          # 5 profitable paper days
            "paper_min_trades": 20,          # Minimum 20 paper trades
        }
        
        self._quarantine_count_30d: Dict[str, int] = {}
    
    def register_strategy(self, strategy_id: str, initial_state: StrategyLifecycleState = StrategyLifecycleState.PAPER_ONLY):
        """Register a new strategy"""
        if strategy_id in self._strategies:
            logger.warning(f"Strategy {strategy_id} already registered")
            return
        
        self._strategies[strategy_id] = StrategyLifecycle(
            strategy_id=strategy_id,
            current_state=initial_state,
            state_entered_at=datetime.utcnow().isoformat()
        )
        
        logger.info(f"Registered strategy {strategy_id} with state {initial_state.value}")
    
    def get_strategy(self, strategy_id: str) -> Optional[StrategyLifecycle]:
        """Get strategy lifecycle state"""
        return self._strategies.get(strategy_id)
    
    def can_trade(self, strategy_id: str, is_paper_mode: bool = False) -> bool:
        """Check if strategy can trade"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return False
        
        if strategy.current_state == StrategyLifecycleState.ACTIVE:
            return True
        elif strategy.current_state == StrategyLifecycleState.PAPER_ONLY:
            return is_paper_mode
        else:
            return False
    
    def update_metrics(
        self,
        strategy_id: str,
        edge_decay_pct: Optional[float] = None,
        performance_vs_expectation: Optional[float] = None,
        current_drawdown_pct: Optional[float] = None,
        execution_quality: Optional[float] = None
    ):
        """Update strategy metrics"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return
        
        if edge_decay_pct is not None:
            strategy.edge_decay_pct = edge_decay_pct
        if performance_vs_expectation is not None:
            strategy.performance_vs_expectation = performance_vs_expectation
        if current_drawdown_pct is not None:
            strategy.current_drawdown_pct = current_drawdown_pct
        if execution_quality is not None:
            strategy.execution_quality = execution_quality
    
    def evaluate_transitions(self, strategy_id: str) -> Optional[StrategyStateTransition]:
        """
        Evaluate if a strategy should transition states.
        Returns transition if one should occur.
        """
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return None
        
        current = strategy.current_state
        
        # ACTIVE -> QUARANTINED checks
        if current == StrategyLifecycleState.ACTIVE:
            return self._check_active_to_quarantine(strategy)
        
        # QUARANTINED checks
        elif current == StrategyLifecycleState.QUARANTINED:
            # Check expiration
            if strategy.quarantine_expires_at:
                expires = datetime.fromisoformat(strategy.quarantine_expires_at)
                if datetime.utcnow() > expires:
                    return self._check_quarantine_to_active(strategy)
            
            # Check if should escalate to DISABLED
            return self._check_quarantine_to_disabled(strategy)
        
        # PAPER_ONLY -> ACTIVE checks
        elif current == StrategyLifecycleState.PAPER_ONLY:
            return self._check_paper_to_active(strategy)
        
        return None
    
    def _check_active_to_quarantine(self, strategy: StrategyLifecycle) -> Optional[StrategyStateTransition]:
        """Check if active strategy should be quarantined"""
        reasons = []
        
        if strategy.edge_decay_pct > self._thresholds["edge_decay_max"]:
            reasons.append(f"edge_decay:{strategy.edge_decay_pct:.1%}")
        
        if strategy.performance_vs_expectation < self._thresholds["performance_ratio_min"]:
            reasons.append(f"underperformance:{strategy.performance_vs_expectation:.1%}")
        
        if strategy.current_drawdown_pct > self._thresholds["drawdown_quarantine"]:
            reasons.append(f"drawdown:{strategy.current_drawdown_pct:.1%}")
        
        if strategy.execution_quality < self._thresholds["execution_quality_min"]:
            reasons.append(f"execution_degraded:{strategy.execution_quality:.1%}")
        
        if reasons:
            return StrategyStateTransition(
                from_state=StrategyLifecycleState.ACTIVE,
                to_state=StrategyLifecycleState.QUARANTINED,
                reason=", ".join(reasons),
                triggered_by="automatic",
                timestamp=datetime.utcnow().isoformat()
            )
        
        return None
    
    def _check_quarantine_to_active(self, strategy: StrategyLifecycle) -> Optional[StrategyStateTransition]:
        """Check if quarantined strategy should be reactivated"""
        # Must meet minimum performance
        if strategy.performance_vs_expectation >= self._thresholds["recovery_performance_min"]:
            # Must have good execution quality
            if strategy.execution_quality >= self._thresholds["execution_quality_min"]:
                return StrategyStateTransition(
                    from_state=StrategyLifecycleState.QUARANTINED,
                    to_state=StrategyLifecycleState.ACTIVE,
                    reason="performance_recovered",
                    triggered_by="automatic",
                    timestamp=datetime.utcnow().isoformat()
                )
        
        return None
    
    def _check_quarantine_to_disabled(self, strategy: StrategyLifecycle) -> Optional[StrategyStateTransition]:
        """Check if quarantine should escalate to disabled"""
        count = self._quarantine_count_30d.get(strategy.strategy_id, 0)
        
        if count >= self._thresholds["max_quarantine_count"]:
            return StrategyStateTransition(
                from_state=StrategyLifecycleState.QUARANTINED,
                to_state=StrategyLifecycleState.DISABLED,
                reason=f"exceeded_quarantine_limit:{count}",
                triggered_by="automatic",
                timestamp=datetime.utcnow().isoformat()
            )
        
        return None
    
    def _check_paper_to_active(self, strategy: StrategyLifecycle) -> Optional[StrategyStateTransition]:
        """Check if paper-only strategy should be promoted"""
        # This would check paper trading performance
        # For now, require manual promotion
        return None
    
    def execute_transition(self, strategy_id: str, transition: StrategyStateTransition):
        """Execute a state transition"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return
        
        old_state = strategy.current_state
        
        strategy.current_state = transition.to_state
        strategy.state_entered_at = transition.timestamp
        strategy.transition_history.append(transition)
        
        # Handle quarantine-specific logic
        if transition.to_state == StrategyLifecycleState.QUARANTINED:
            strategy.quarantine_reason = transition.reason
            strategy.quarantine_expires_at = (
                datetime.utcnow() + timedelta(hours=self._thresholds["quarantine_min_hours"])
            ).isoformat()
            
            # Increment quarantine count
            self._quarantine_count_30d[strategy_id] = (
                self._quarantine_count_30d.get(strategy_id, 0) + 1
            )
        else:
            strategy.quarantine_reason = None
            strategy.quarantine_expires_at = None
        
        logger.warning(
            f"Strategy {strategy_id} transition: {old_state.value} -> {transition.to_state.value} "
            f"(reason: {transition.reason})"
        )
    
    def manually_disable(self, strategy_id: str, user_id: str, reason: str):
        """Manually disable a strategy"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return
        
        transition = StrategyStateTransition(
            from_state=strategy.current_state,
            to_state=StrategyLifecycleState.DISABLED,
            reason=f"manual:{reason}",
            triggered_by=user_id,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self.execute_transition(strategy_id, transition)
    
    def manually_enable(self, strategy_id: str, user_id: str):
        """Manually enable a strategy (to PAPER_ONLY first)"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return
        
        transition = StrategyStateTransition(
            from_state=strategy.current_state,
            to_state=StrategyLifecycleState.PAPER_ONLY,
            reason="manual_enable",
            triggered_by=user_id,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self.execute_transition(strategy_id, transition)
    
    def promote_to_active(self, strategy_id: str, user_id: str):
        """Manually promote a paper strategy to active"""
        strategy = self._strategies.get(strategy_id)
        if not strategy:
            return
        
        if strategy.current_state != StrategyLifecycleState.PAPER_ONLY:
            logger.warning(f"Cannot promote {strategy_id}: not in PAPER_ONLY state")
            return
        
        transition = StrategyStateTransition(
            from_state=strategy.current_state,
            to_state=StrategyLifecycleState.ACTIVE,
            reason="manual_promotion",
            triggered_by=user_id,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self.execute_transition(strategy_id, transition)
    
    def get_all_states(self) -> Dict[str, Dict]:
        """Get all strategy lifecycle states"""
        return {
            strategy_id: strategy.to_dict()
            for strategy_id, strategy in self._strategies.items()
        }


# Global instance
lifecycle_manager = StrategyLifecycleManager()
