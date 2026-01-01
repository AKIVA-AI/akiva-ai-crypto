"""
Agent Orchestrator - Manages the lifecycle of all trading agents.
Handles startup, shutdown, health monitoring, and coordination.

PRODUCTION-READY:
- Meta-Decision Agent has VETO POWER over all other agents
- All agents write heartbeats to Supabase
- Graceful shutdown and restart handling
- 24/7 operation with auto-recovery
"""

import asyncio
import logging
import os
import signal
from datetime import datetime, UTC
from typing import Dict, List, Optional

import httpx

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
    
    PRODUCTION: Monitors agent health, auto-restarts crashed agents,
    and persists status to Supabase.
    """
    
    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self._agents: Dict[str, BaseAgent] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._running = False
        self._started_at: Optional[str] = None
        self._restart_counts: Dict[str, int] = {}
        self._max_restarts = 5
        
        # Supabase for system health updates
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self._http_client: Optional[httpx.AsyncClient] = None
        
    def register_agent(self, agent: BaseAgent):
        """Register an agent with the orchestrator"""
        self._agents[agent.agent_id] = agent
        self._restart_counts[agent.agent_id] = 0
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
        total_capital = float(os.getenv("TOTAL_CAPITAL", "100000"))
        capital_agent = CapitalAllocationAgent(
            agent_id="capital-allocation-agent-01",
            redis_url=self.redis_url,
            total_capital=total_capital
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
        venues = os.getenv("ENABLED_VENUES", "coinbase,kraken").split(",")
        execution_agent = ExecutionAgent(
            agent_id="execution-agent-01",
            redis_url=self.redis_url,
            venues=venues
        )
        self.register_agent(execution_agent)
        
        logger.info(f"Created {len(self._agents)} agents with Meta-Decision authority")
    
    async def start(self):
        """Start all registered agents"""
        if self._running:
            logger.warning("Orchestrator already running")
            return
        
        self._running = True
        self._started_at = datetime.now(UTC).isoformat()
        self._http_client = httpx.AsyncClient(timeout=10.0)
        
        logger.info(f"Starting {len(self._agents)} agents...")
        
        # Update system health
        await self._update_system_health("agent_orchestrator", "healthy", "Starting agents")
        
        for agent_id, agent in self._agents.items():
            task = asyncio.create_task(self._run_agent_with_recovery(agent_id, agent))
            self._tasks[agent_id] = task
            logger.info(f"Started agent: {agent_id}")
        
        # Start monitoring task
        self._tasks["_monitor"] = asyncio.create_task(self._monitor_loop())
        
        logger.info("All agents started - orchestrator running 24/7")
    
    async def _run_agent_with_recovery(self, agent_id: str, agent: BaseAgent):
        """Run an agent with automatic recovery on crash"""
        while self._running:
            try:
                await agent.run()
                if self._running:
                    logger.warning(f"Agent {agent_id} exited unexpectedly, will restart")
            except Exception as e:
                logger.error(f"Agent {agent_id} crashed: {e}")
                self._restart_counts[agent_id] = self._restart_counts.get(agent_id, 0) + 1
                
                if self._restart_counts[agent_id] > self._max_restarts:
                    logger.critical(f"Agent {agent_id} exceeded max restarts ({self._max_restarts})")
                    await self._send_alert(
                        "critical",
                        f"Agent {agent_id} Failed",
                        f"Agent exceeded max restart attempts after error: {e}"
                    )
                    break
            
            if self._running:
                # Wait before restart
                await asyncio.sleep(5)
                logger.info(f"Restarting agent {agent_id} (attempt {self._restart_counts[agent_id]})")
    
    async def stop(self):
        """Stop all agents gracefully"""
        if not self._running:
            return
        
        logger.info("Stopping all agents...")
        self._running = False
        
        # Send shutdown command via Redis
        await self.send_command("shutdown")
        
        # Wait for tasks to complete with timeout
        for agent_id, task in self._tasks.items():
            if not task.done():
                task.cancel()
                try:
                    await asyncio.wait_for(task, timeout=5.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
        
        self._tasks.clear()
        
        # Update system health
        await self._update_system_health("agent_orchestrator", "stopped", "Shutdown complete")
        
        if self._http_client:
            await self._http_client.aclose()
        
        logger.info("All agents stopped")
    
    async def _monitor_loop(self):
        """Monitor agent health and log status"""
        while self._running:
            try:
                status = self.get_status()
                running_count = sum(1 for s in status["agents"].values() if s["running"])
                
                logger.info(f"Agent status: {running_count}/{len(self._agents)} running")
                
                # Update system health
                health_status = "healthy" if running_count == len(self._agents) else "degraded"
                await self._update_system_health(
                    "agent_orchestrator",
                    health_status,
                    f"{running_count}/{len(self._agents)} agents running"
                )
                
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
            
            await asyncio.sleep(60)  # Check every minute
    
    async def _update_system_health(self, component: str, status: str, details: str = ""):
        """Update system health in Supabase"""
        if not self._supabase_url or not self._supabase_key or not self._http_client:
            return
            
        try:
            await self._http_client.post(
                f"{self._supabase_url}/rest/v1/system_health",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                json={
                    "component": component,
                    "status": status,
                    "details": {"message": details},
                    "last_check_at": datetime.now(UTC).isoformat()
                }
            )
        except Exception as e:
            logger.error(f"Failed to update system health: {e}")
    
    async def _send_alert(self, severity: str, title: str, message: str):
        """Send alert to Supabase"""
        if not self._supabase_url or not self._supabase_key or not self._http_client:
            return
            
        try:
            await self._http_client.post(
                f"{self._supabase_url}/rest/v1/alerts",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "title": title,
                    "message": message,
                    "severity": severity,
                    "source": "agent_orchestrator"
                }
            )
        except Exception as e:
            logger.error(f"Failed to send alert: {e}")
    
    async def send_command(self, command: str, target_agent: Optional[str] = None):
        """Send a control command to agents via Redis"""
        import redis.asyncio as redis_async
        
        try:
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
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
    
    async def pause_all(self):
        """Pause all agents"""
        await self.send_command("pause")
    
    async def resume_all(self):
        """Resume all agents"""
        await self.send_command("resume")
    
    async def pause_agent(self, agent_id: str):
        """Pause a specific agent"""
        await self.send_command("pause", agent_id)
    
    async def resume_agent(self, agent_id: str):
        """Resume a specific agent"""
        await self.send_command("resume", agent_id)
    
    async def shutdown(self):
        """Full shutdown"""
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
                "restarts": self._restart_counts.get(agent_id, 0),
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


async def start_trading_system(redis_url: str = None):
    """Convenience function to start the trading system"""
    global orchestrator
    orchestrator = AgentOrchestrator(redis_url=redis_url)
    orchestrator.create_default_agents()
    
    # Handle signals for graceful shutdown
    loop = asyncio.get_running_loop()
    
    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(orchestrator.shutdown())
    
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)
    
    await orchestrator.start()
    
    # Keep running until shutdown
    while orchestrator._running:
        await asyncio.sleep(1)
    
    return orchestrator


async def stop_trading_system():
    """Convenience function to stop the trading system"""
    global orchestrator
    await orchestrator.shutdown()


# Entry point for running as standalone
if __name__ == "__main__":
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    try:
        asyncio.run(start_trading_system())
    except KeyboardInterrupt:
        logger.info("Shutdown requested")
        sys.exit(0)
