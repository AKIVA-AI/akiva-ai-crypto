"""
Agent Orchestrator - Manages the lifecycle of all trading agents.
Handles startup, shutdown, health monitoring, and coordination.

UPGRADED: Now includes Meta-Decision and Capital Allocation agents
for institution-grade profitability and risk management.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Type

from .base_agent import BaseAgent, AgentChannel, AgentMessage
from .signal_agent import SignalAgent
from .risk_agent import RiskAgent
from .execution_agent import ExecutionAgent
from .meta_decision_agent import MetaDecisionAgent
from .capital_allocation_agent import CapitalAllocationAgent

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """
    Orchestrates multiple trading agents, managing their lifecycle
    and providing a unified control interface.
    
    CRITICAL: Meta-Decision Agent has VETO POWER over all other agents.
    No strategy can trade without Meta-Decision approval.
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._agents: Dict[str, BaseAgent] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._running = False
        self._started_at: Optional[str] = None
        
    def register_agent(self, agent: BaseAgent):
        """Register an agent with the orchestrator"""
        self._agents[agent.agent_id] = agent
        logger.info(f"Registered agent: {agent.agent_id} ({agent.agent_type})")
    
    def create_default_agents(self):
        """Create the default set of trading agents with proper hierarchy"""
        
        # META-DECISION AGENT (SUPREME AUTHORITY)
        # Must be created first - has veto power over all others
        meta_agent = MetaDecisionAgent(
            agent_id="meta-decision-agent-01",
            redis_url=self.redis_url
        )
        self.register_agent(meta_agent)
        
        # CAPITAL ALLOCATION AGENT
        # Manages capital distribution across strategies
        capital_agent = CapitalAllocationAgent(
            agent_id="capital-allocation-agent-01",
            redis_url=self.redis_url,
            total_capital=100000.0
        )
        self.register_agent(capital_agent)
        
        # RISK AGENT (Single source of truth for risk)
        risk_agent = RiskAgent(
            agent_id="risk-agent-01",
            redis_url=self.redis_url
        )
        self.register_agent(risk_agent)
        
        # SIGNAL AGENT (proposes intents only, never executes)
        signal_agent = SignalAgent(
            agent_id="signal-agent-01",
            redis_url=self.redis_url,
            strategies=["trend_following", "mean_reversion", "funding_arbitrage"]
        )
        self.register_agent(signal_agent)
        
        # EXECUTION AGENT (executes only approved intents)
        execution_agent = ExecutionAgent(
            agent_id="execution-agent-01",
            redis_url=self.redis_url,
            venues=["coinbase", "kraken", "hyperliquid"]
        )
        self.register_agent(execution_agent)
        
        logger.info(f"Created {len(self._agents)} agents with Meta-Decision authority")
    
    async def start(self):
        """Start all registered agents"""
        if self._running:
            logger.warning("Orchestrator already running")
            return
        
        self._running = True
        self._started_at = datetime.utcnow().isoformat()
        
        logger.info(f"Starting {len(self._agents)} agents...")
        
        for agent_id, agent in self._agents.items():
            task = asyncio.create_task(agent.run())
            self._tasks[agent_id] = task
            logger.info(f"Started agent: {agent_id}")
        
        # Start monitoring task
        self._tasks["monitor"] = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop all agents gracefully"""
        if not self._running:
            return
        
        logger.info("Stopping all agents...")
        self._running = False
        
        # Cancel all tasks
        for agent_id, task in self._tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        self._tasks.clear()
        logger.info("All agents stopped")
    
    async def _monitor_loop(self):
        """Monitor agent health and restart failed agents"""
        while self._running:
            for agent_id, task in list(self._tasks.items()):
                if agent_id == "monitor":
                    continue
                
                if task.done():
                    exception = task.exception()
                    if exception:
                        logger.error(f"Agent {agent_id} crashed: {exception}")
                        # Restart the agent
                        if agent_id in self._agents:
                            new_task = asyncio.create_task(self._agents[agent_id].run())
                            self._tasks[agent_id] = new_task
                            logger.info(f"Restarted agent: {agent_id}")
            
            await asyncio.sleep(5)
    
    async def send_command(self, command: str, target_agent: Optional[str] = None):
        """Send a control command to agents"""
        import redis.asyncio as redis_async
        
        r = redis_async.from_url(self.redis_url)
        
        message = AgentMessage.create(
            source="orchestrator",
            channel=AgentChannel.CONTROL,
            payload={
                "command": command,
                "target": target_agent
            }
        )
        
        await r.publish(AgentChannel.CONTROL.value, message.to_json())
        await r.close()
        
        logger.info(f"Sent command '{command}' to {target_agent or 'all agents'}")
    
    async def pause_all(self):
        """Pause all agents"""
        await self.send_command("pause")
    
    async def resume_all(self):
        """Resume all agents"""
        await self.send_command("resume")
    
    async def shutdown(self):
        """Shutdown all agents"""
        await self.send_command("shutdown")
        await self.stop()
    
    def get_status(self) -> Dict:
        """Get orchestrator and agent status"""
        agent_statuses = {}
        
        for agent_id, agent in self._agents.items():
            task = self._tasks.get(agent_id)
            agent_statuses[agent_id] = {
                "type": agent.agent_type,
                "running": task is not None and not task.done(),
                "metrics": agent._metrics
            }
        
        return {
            "running": self._running,
            "started_at": self._started_at,
            "agent_count": len(self._agents),
            "agents": agent_statuses
        }


# Global orchestrator instance
orchestrator = AgentOrchestrator()


async def start_trading_system(redis_url: str = "redis://localhost:6379"):
    """Convenience function to start the trading system"""
    global orchestrator
    orchestrator = AgentOrchestrator(redis_url=redis_url)
    orchestrator.create_default_agents()
    await orchestrator.start()
    return orchestrator


async def stop_trading_system():
    """Convenience function to stop the trading system"""
    global orchestrator
    await orchestrator.shutdown()
