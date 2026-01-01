"""
Base Agent class for the multi-agent trading system.
All agents inherit from this class and communicate via Redis pub/sub.

PRODUCTION-READY: Writes heartbeats directly to Supabase for monitoring.
"""

import asyncio
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import UUID, uuid4

import redis.asyncio as redis
import httpx

logger = logging.getLogger(__name__)


class AgentChannel(str, Enum):
    """Redis pub/sub channels for agent communication"""
    MARKET_DATA = "agent:market_data"
    SIGNALS = "agent:signals"
    RISK_CHECK = "agent:risk_check"
    RISK_APPROVED = "agent:risk_approved"
    RISK_REJECTED = "agent:risk_rejected"
    EXECUTION = "agent:execution"
    FILLS = "agent:fills"
    HEARTBEAT = "agent:heartbeat"
    CONTROL = "agent:control"
    ALERTS = "agent:alerts"


@dataclass
class AgentMessage:
    """Standard message format for inter-agent communication"""
    id: str
    timestamp: str
    source_agent: str
    target_agent: Optional[str]
    channel: str
    payload: Dict[str, Any]
    correlation_id: Optional[str] = None
    
    def to_json(self) -> str:
        return json.dumps(asdict(self))
    
    @classmethod
    def from_json(cls, data: str) -> 'AgentMessage':
        parsed = json.loads(data)
        return cls(**parsed)
    
    @classmethod
    def create(
        cls,
        source: str,
        channel: AgentChannel,
        payload: Dict[str, Any],
        target: Optional[str] = None,
        correlation_id: Optional[str] = None
    ) -> 'AgentMessage':
        return cls(
            id=str(uuid4()),
            timestamp=datetime.now(UTC).isoformat(),
            source_agent=source,
            target_agent=target,
            channel=channel.value,
            payload=payload,
            correlation_id=correlation_id or str(uuid4())
        )


class BaseAgent(ABC):
    """
    Base class for all trading agents.
    Provides Redis pub/sub connectivity, message handling, and Supabase heartbeats.
    
    PRODUCTION: Heartbeats are persisted to Supabase `agents` table for monitoring.
    """
    
    def __init__(
        self,
        agent_id: str,
        agent_type: str,
        redis_url: str = "redis://localhost:6379",
        subscribed_channels: Optional[List[AgentChannel]] = None,
        capabilities: Optional[List[str]] = None
    ):
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.redis_url = redis_url
        self.subscribed_channels = subscribed_channels or []
        self.capabilities = capabilities or []
        
        self._redis: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._running = False
        self._paused = False
        self._started_at: Optional[datetime] = None
        self._metrics = {
            "messages_received": 0,
            "messages_sent": 0,
            "cycles_run": 0,
            "errors": 0,
            "last_heartbeat": None
        }
        
        # Supabase configuration for heartbeats
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self._http_client: Optional[httpx.AsyncClient] = None
        
    async def connect(self):
        """Establish Redis connection and HTTP client"""
        try:
            self._redis = redis.from_url(self.redis_url)
            self._pubsub = self._redis.pubsub()
            self._http_client = httpx.AsyncClient(timeout=10.0)
            
            # Subscribe to channels
            if self.subscribed_channels:
                channels = [ch.value for ch in self.subscribed_channels]
                await self._pubsub.subscribe(*channels)
                logger.info(f"[{self.agent_id}] Subscribed to channels: {channels}")
            
            # Always subscribe to control and heartbeat
            await self._pubsub.subscribe(
                AgentChannel.CONTROL.value,
                AgentChannel.HEARTBEAT.value
            )
            
            logger.info(f"[{self.agent_id}] Connected to Redis")
            
        except Exception as e:
            logger.error(f"[{self.agent_id}] Failed to connect to Redis: {e}")
            raise
    
    async def disconnect(self):
        """Clean up Redis connection"""
        self._running = False
        if self._pubsub:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()
        if self._http_client:
            await self._http_client.aclose()
        logger.info(f"[{self.agent_id}] Disconnected from Redis")
    
    async def publish(self, channel: AgentChannel, payload: Dict[str, Any], correlation_id: Optional[str] = None):
        """Publish a message to a channel"""
        if not self._redis:
            raise RuntimeError("Not connected to Redis")
        
        message = AgentMessage.create(
            source=self.agent_id,
            channel=channel,
            payload=payload,
            correlation_id=correlation_id
        )
        
        await self._redis.publish(channel.value, message.to_json())
        self._metrics["messages_sent"] += 1
        logger.debug(f"[{self.agent_id}] Published to {channel.value}: {message.id}")
    
    async def _write_heartbeat_to_supabase(self):
        """Write heartbeat directly to Supabase agents table"""
        if not self._supabase_url or not self._supabase_key or not self._http_client:
            logger.debug(f"[{self.agent_id}] Supabase not configured, skipping DB heartbeat")
            return
        
        try:
            uptime_seconds = 0
            if self._started_at:
                uptime_seconds = (datetime.now(UTC) - self._started_at).total_seconds()
            
            # Calculate resource usage (placeholder - could integrate psutil)
            import psutil
            process = psutil.Process()
            cpu_usage = process.cpu_percent()
            memory_usage = process.memory_percent()
            
            payload = {
                "id": self.agent_id,
                "name": self.agent_id.replace("-", " ").title(),
                "type": self.agent_type,
                "status": "paused" if self._paused else "running",
                "last_heartbeat": datetime.now(UTC).isoformat(),
                "cpu_usage": round(cpu_usage, 2),
                "memory_usage": round(memory_usage, 2),
                "uptime": int(uptime_seconds),
                "capabilities": self.capabilities,
                "config": {"redis_url": self.redis_url[:30] + "..."},
                "error_message": None
            }
            
            response = await self._http_client.post(
                f"{self._supabase_url}/rest/v1/agents",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                json=payload
            )
            
            if response.status_code not in (200, 201, 204):
                logger.warning(f"[{self.agent_id}] Heartbeat write failed: {response.status_code} {response.text}")
            else:
                logger.debug(f"[{self.agent_id}] Heartbeat written to Supabase")
                
        except ImportError:
            # psutil not available, use defaults
            await self._write_heartbeat_simple()
        except Exception as e:
            logger.error(f"[{self.agent_id}] Failed to write heartbeat to Supabase: {e}")
    
    async def _write_heartbeat_simple(self):
        """Simple heartbeat without psutil"""
        if not self._supabase_url or not self._supabase_key or not self._http_client:
            return
            
        try:
            uptime_seconds = 0
            if self._started_at:
                uptime_seconds = (datetime.now(UTC) - self._started_at).total_seconds()
            
            payload = {
                "id": self.agent_id,
                "name": self.agent_id.replace("-", " ").title(),
                "type": self.agent_type,
                "status": "paused" if self._paused else "running",
                "last_heartbeat": datetime.now(UTC).isoformat(),
                "cpu_usage": 0,
                "memory_usage": 0,
                "uptime": int(uptime_seconds),
                "capabilities": self.capabilities,
                "config": {},
                "error_message": None
            }
            
            await self._http_client.post(
                f"{self._supabase_url}/rest/v1/agents",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                },
                json=payload
            )
        except Exception as e:
            logger.error(f"[{self.agent_id}] Simple heartbeat failed: {e}")
    
    async def send_heartbeat(self):
        """Send heartbeat to Redis AND Supabase"""
        # Redis heartbeat for inter-agent awareness
        await self.publish(
            AgentChannel.HEARTBEAT,
            {
                "agent_id": self.agent_id,
                "agent_type": self.agent_type,
                "status": "paused" if self._paused else "running",
                "metrics": self._metrics
            }
        )
        self._metrics["last_heartbeat"] = datetime.now(UTC).isoformat()
        
        # Supabase heartbeat for monitoring
        await self._write_heartbeat_to_supabase()
    
    async def send_alert(self, severity: str, title: str, message: str, metadata: Optional[Dict] = None):
        """Send an alert to the alerts channel AND persist to Supabase"""
        await self.publish(
            AgentChannel.ALERTS,
            {
                "severity": severity,
                "title": title,
                "message": message,
                "metadata": metadata or {}
            }
        )
        
        # Also persist to Supabase alerts table
        if self._supabase_url and self._supabase_key and self._http_client:
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
                        "source": f"agent:{self.agent_id}",
                        "metadata": metadata or {}
                    }
                )
            except Exception as e:
                logger.error(f"[{self.agent_id}] Failed to persist alert: {e}")
    
    def register_handler(self, channel: AgentChannel, handler: Callable):
        """Register a message handler for a specific channel"""
        self._message_handlers[channel.value] = handler
    
    async def _process_message(self, raw_message: Dict):
        """Process incoming message from pub/sub"""
        try:
            if raw_message["type"] != "message":
                return
            
            channel = raw_message["channel"]
            if isinstance(channel, bytes):
                channel = channel.decode()
            
            data = raw_message["data"]
            if isinstance(data, bytes):
                data = data.decode()
            
            message = AgentMessage.from_json(data)
            self._metrics["messages_received"] += 1
            
            # Handle control messages
            if channel == AgentChannel.CONTROL.value:
                await self._handle_control(message)
                return
            
            # Call registered handler
            if hasattr(self, '_message_handlers') and channel in self._message_handlers:
                await self._message_handlers[channel](message)
            else:
                # Default to abstract handle_message
                await self.handle_message(message)
                
        except Exception as e:
            logger.error(f"[{self.agent_id}] Error processing message: {e}")
            self._metrics["errors"] += 1
    
    async def _handle_control(self, message: AgentMessage):
        """Handle control messages (pause, resume, shutdown)"""
        command = message.payload.get("command")
        target = message.payload.get("target")
        
        # Check if this command is for us
        if target and target != self.agent_id:
            return
        
        if command == "shutdown":
            logger.info(f"[{self.agent_id}] Received shutdown command")
            self._running = False
        elif command == "pause":
            logger.info(f"[{self.agent_id}] Received pause command")
            self._paused = True
            await self.on_pause()
        elif command == "resume":
            logger.info(f"[{self.agent_id}] Received resume command")
            self._paused = False
            await self.on_resume()
    
    async def run(self):
        """Main agent loop"""
        await self.connect()
        self._running = True
        self._started_at = datetime.now(UTC)
        self._message_handlers = {}
        
        logger.info(f"[{self.agent_id}] Starting agent loop")
        
        # Start heartbeat task
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        
        try:
            await self.on_start()
            
            while self._running:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=0.1
                )
                if message:
                    await self._process_message(message)
                
                # Run agent-specific cycle if not paused
                if not self._paused:
                    await self.cycle()
                    self._metrics["cycles_run"] += 1
                else:
                    await asyncio.sleep(0.5)  # Sleep when paused
                
        except asyncio.CancelledError:
            logger.info(f"[{self.agent_id}] Agent cancelled")
        except Exception as e:
            logger.error(f"[{self.agent_id}] Agent error: {e}")
            await self.send_alert("critical", f"Agent Error: {self.agent_id}", str(e))
        finally:
            heartbeat_task.cancel()
            await self.on_stop()
            
            # Mark agent as stopped in Supabase
            await self._mark_stopped()
            
            await self.disconnect()
    
    async def _mark_stopped(self):
        """Mark agent as stopped in Supabase"""
        if self._supabase_url and self._supabase_key and self._http_client:
            try:
                await self._http_client.patch(
                    f"{self._supabase_url}/rest/v1/agents?id=eq.{self.agent_id}",
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                        "Content-Type": "application/json"
                    },
                    json={"status": "stopped"}
                )
            except Exception as e:
                logger.error(f"[{self.agent_id}] Failed to mark as stopped: {e}")
    
    async def _heartbeat_loop(self):
        """Send periodic heartbeats (every 30 seconds for Supabase)"""
        while self._running:
            await self.send_heartbeat()
            await asyncio.sleep(30)  # 30 second interval for production
    
    # Abstract methods to be implemented by subclasses
    
    @abstractmethod
    async def handle_message(self, message: AgentMessage):
        """Handle incoming message"""
        pass
    
    @abstractmethod
    async def cycle(self):
        """Run one agent cycle"""
        pass
    
    async def on_start(self):
        """Called when agent starts"""
        pass
    
    async def on_stop(self):
        """Called when agent stops"""
        pass
    
    async def on_pause(self):
        """Called when agent is paused"""
        pass
    
    async def on_resume(self):
        """Called when agent resumes"""
        pass
