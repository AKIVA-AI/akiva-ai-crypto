# Multi-Agent Trading System
# Uses Redis pub/sub for low-latency inter-agent communication

from .agent_orchestrator import AgentOrchestrator
from .arbitrage_agent import ArbitrageAgent
from .base_agent import AgentChannel, AgentMessage, BaseAgent
from .capital_allocation_agent import CapitalAllocationAgent
from .execution_agent import ExecutionAgent
from .freqtrade_signal_agent import FreqTradeSignalAgent
from .meta_decision_agent import MetaDecisionAgent
from .risk_agent import RiskAgent
from .signal_agent import SignalAgent

__all__ = [
    "BaseAgent",
    "AgentMessage",
    "AgentChannel",
    "SignalAgent",
    "RiskAgent",
    "ExecutionAgent",
    "AgentOrchestrator",
    "FreqTradeSignalAgent",
    "MetaDecisionAgent",
    "CapitalAllocationAgent",
    "ArbitrageAgent",
]
