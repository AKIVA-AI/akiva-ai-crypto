"""
API routes for the multi-agent trading system.
Provides endpoints for controlling and monitoring agents.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.agent_orchestrator import (
    orchestrator,
    start_trading_system,
    stop_trading_system,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


class AgentCommand(BaseModel):
    command: str  # start, stop, pause, resume
    target_agent: Optional[str] = None


class AgentConfig(BaseModel):
    agent_type: str
    agent_id: str
    config: dict = {}


@router.get("/status")
async def get_agents_status():
    """Get status of all agents"""
    return orchestrator.get_status()


@router.post("/start")
async def start_agents(redis_url: str = "redis://localhost:6379"):
    """Start the multi-agent trading system"""
    try:
        await start_trading_system(redis_url)
        return {"status": "started", "agents": list(orchestrator._agents.keys())}
    except Exception as e:
        logger.error(f"Failed to start agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_agents():
    """Stop all agents"""
    try:
        await stop_trading_system()
        return {"status": "stopped"}
    except Exception as e:
        logger.error(f"Failed to stop agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/command")
async def send_agent_command(cmd: AgentCommand):
    """Send command to agents (pause, resume, etc.)"""
    valid_commands = ["pause", "resume", "shutdown"]

    if cmd.command not in valid_commands:
        raise HTTPException(
            status_code=400, detail=f"Invalid command. Valid commands: {valid_commands}"
        )

    try:
        await orchestrator.send_command(cmd.command, cmd.target_agent)
        return {"status": "command_sent", "command": cmd.command}
    except Exception as e:
        logger.error(f"Failed to send command: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics")
async def get_agent_metrics():
    """Get metrics for all agents"""
    status = orchestrator.get_status()

    metrics = {}
    for agent_id, agent_status in status.get("agents", {}).items():
        metrics[agent_id] = agent_status.get("metrics", {})

    return metrics


@router.get("/behavior/versions")
async def get_agent_behavior_versions():
    """Get behavior versions and drift metrics for all agents (D21)."""
    result = {}
    for agent_id, agent in orchestrator._agents.items():
        result[agent_id] = agent.get_behavior_info()
    return result


@router.get("/{agent_id}")
async def get_agent_detail(agent_id: str):
    """Get detailed status for a specific agent"""
    if agent_id not in orchestrator._agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent = orchestrator._agents[agent_id]
    task = orchestrator._tasks.get(agent_id)

    return {
        "agent_id": agent_id,
        "agent_type": agent.agent_type,
        "running": task is not None and not task.done(),
        "subscribed_channels": [ch.value for ch in agent.subscribed_channels],
        "metrics": agent._metrics,
        **agent.get_behavior_info(),
    }
