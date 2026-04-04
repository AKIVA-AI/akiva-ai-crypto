"""
Base Agent class for the multi-agent trading system.
All agents inherit from this class and communicate via Redis pub/sub.

PRODUCTION-READY: Writes heartbeats directly to Supabase for monitoring.
"""

import asyncio
import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

import httpx
import redis.asyncio as redis

from app.core.agent_identity import (
    create_agent_identity,
    verify_agent_signature,
)

logger = logging.getLogger(__name__)

# ── Agent behavior version tracking (D21 Agentic Workspace) ──

AGENT_BEHAVIOR_VERSION = "1.0.0"  # Bump on prompt/tool/model changes


@dataclass
class AgentBehaviorVersion:
    """Tracks the versioned behavior configuration of an agent."""

    version: str
    prompt_hash: str  # SHA-256 of the agent's system prompt / config
    tools: List[str]  # List of tool/capability names
    model: str  # Model identifier (e.g., "rule-based", "llm-v1")
    changed_at: str  # ISO timestamp of last change


@dataclass
class AgentDriftMetrics:
    """Tracks drift indicators for agent behavior monitoring."""

    override_count: int = 0  # Times a human overrode agent decision
    fallback_count: int = 0  # Times agent fell back to default behavior
    approval_count: int = 0  # Times agent decision was approved
    rejection_count: int = 0  # Times agent decision was rejected
    total_decisions: int = 0

    @property
    def override_rate(self) -> float:
        return self.override_count / max(self.total_decisions, 1)

    @property
    def fallback_rate(self) -> float:
        return self.fallback_count / max(self.total_decisions, 1)

    @property
    def approval_rate(self) -> float:
        return self.approval_count / max(self.total_decisions, 1)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "override_count": self.override_count,
            "fallback_count": self.fallback_count,
            "approval_count": self.approval_count,
            "rejection_count": self.rejection_count,
            "total_decisions": self.total_decisions,
            "override_rate": round(self.override_rate, 4),
            "fallback_rate": round(self.fallback_rate, 4),
            "approval_rate": round(self.approval_rate, 4),
        }


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
    signature: Optional[str] = None  # HMAC signature for Zero Trust verification

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "AgentMessage":
        parsed = json.loads(data)
        return cls(**parsed)

    @classmethod
    def create(
        cls,
        source: str,
        channel: AgentChannel,
        payload: Dict[str, Any],
        target: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> "AgentMessage":
        return cls(
            id=str(uuid4()),
            timestamp=datetime.now(UTC).isoformat(),
            source_agent=source,
            target_agent=target,
            channel=channel.value,
            payload=payload,
            correlation_id=correlation_id or str(uuid4()),
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
        capabilities: Optional[List[str]] = None,
    ):
        self.agent_id = agent_id
        self.agent_type = agent_type
        self.redis_url = redis_url
        self.subscribed_channels = subscribed_channels or []
        self.capabilities = capabilities or []

        # Per-agent identity (Zero Trust — each agent has unique signing key)
        self._identity = create_agent_identity(agent_id, agent_type)

        # Behavior versioning and drift monitoring (D21 Agentic Workspace)
        config_str = f"{agent_id}:{agent_type}:{','.join(capabilities or [])}"
        self._behavior_version = AgentBehaviorVersion(
            version=AGENT_BEHAVIOR_VERSION,
            prompt_hash=hashlib.sha256(config_str.encode()).hexdigest()[:16],
            tools=list(capabilities or []),
            model="rule-based",
            changed_at=datetime.now(UTC).isoformat(),
        )
        self._drift = AgentDriftMetrics()

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
            "last_heartbeat": None,
            "signature_failures": 0,
        }

        # Redis resilience
        self._max_reconnect_attempts = 10
        self._reconnect_delay = 1.0  # seconds, doubles each attempt
        self._message_queue: list = []  # Buffer messages during disconnect
        self._max_queue_size = 1000

        # Supabase configuration for heartbeats
        self._supabase_url = os.getenv("SUPABASE_URL", "")
        self._supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self._http_client: Optional[httpx.AsyncClient] = None

    async def connect(self):
        """Establish Redis connection with retry logic."""
        attempt = 0
        delay = self._reconnect_delay

        while attempt < self._max_reconnect_attempts:
            try:
                self._redis = redis.from_url(self.redis_url)
                await self._redis.ping()  # Verify connection
                self._pubsub = self._redis.pubsub()
                self._http_client = httpx.AsyncClient(timeout=10.0)

                # Subscribe to channels
                if self.subscribed_channels:
                    channels = [ch.value for ch in self.subscribed_channels]
                    await self._pubsub.subscribe(*channels)
                    logger.info(f"[{self.agent_id}] Subscribed to channels: {channels}")

                # Always subscribe to control and heartbeat
                await self._pubsub.subscribe(
                    AgentChannel.CONTROL.value, AgentChannel.HEARTBEAT.value
                )

                logger.info(f"[{self.agent_id}] Connected to Redis")

                # Flush queued messages
                await self._flush_message_queue()
                return

            except Exception as e:
                attempt += 1
                if attempt >= self._max_reconnect_attempts:
                    logger.error(
                        f"[{self.agent_id}] Failed to connect to Redis after {attempt} attempts: {e}"
                    )
                    raise
                logger.warning(
                    f"[{self.agent_id}] Redis connection attempt {attempt} failed: {e}. Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)  # Exponential backoff, max 30s

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

    async def _flush_message_queue(self):
        """Publish any messages that were queued during disconnect."""
        if not self._message_queue:
            return

        flushed = 0
        while self._message_queue:
            channel, payload, correlation_id = self._message_queue.pop(0)
            try:
                await self.publish(channel, payload, correlation_id)
                flushed += 1
            except Exception as e:
                logger.error(f"[{self.agent_id}] Failed to flush queued message: {e}")
                break

        if flushed:
            logger.info(f"[{self.agent_id}] Flushed {flushed} queued messages")

    async def publish(
        self,
        channel: AgentChannel,
        payload: Dict[str, Any],
        correlation_id: Optional[str] = None,
    ):
        """Publish a message to a channel, with queue fallback."""
        if not self._redis:
            # Queue message for later delivery
            if len(self._message_queue) < self._max_queue_size:
                self._message_queue.append((channel, payload, correlation_id))
                logger.warning(
                    f"[{self.agent_id}] Redis unavailable, message queued ({len(self._message_queue)} in queue)"
                )
            else:
                logger.error(f"[{self.agent_id}] Message queue full, dropping message")
            return

        message = AgentMessage.create(
            source=self.agent_id,
            channel=channel,
            payload=payload,
            correlation_id=correlation_id,
        )

        # Sign message for Zero Trust verification
        message.signature = self._identity.sign_message(message.to_json())

        try:
            await self._redis.publish(channel.value, message.to_json())
            self._metrics["messages_sent"] += 1
            logger.debug(
                f"[{self.agent_id}] Published to {channel.value}: {message.id}"
            )
        except redis.ConnectionError:
            # Queue and attempt reconnect
            if len(self._message_queue) < self._max_queue_size:
                self._message_queue.append((channel, payload, correlation_id))
            logger.warning(
                f"[{self.agent_id}] Redis connection lost during publish, queued message"
            )
            await self._attempt_reconnect()

    async def _attempt_reconnect(self):
        """Attempt to reconnect to Redis."""
        logger.info(f"[{self.agent_id}] Attempting Redis reconnection...")
        try:
            if self._pubsub:
                await self._pubsub.close()
            if self._redis:
                await self._redis.close()
        except Exception:
            pass

        try:
            self._redis = redis.from_url(self.redis_url)
            await self._redis.ping()
            self._pubsub = self._redis.pubsub()

            if self.subscribed_channels:
                channels = [ch.value for ch in self.subscribed_channels]
                await self._pubsub.subscribe(*channels)

            await self._pubsub.subscribe(
                AgentChannel.CONTROL.value, AgentChannel.HEARTBEAT.value
            )

            logger.info(f"[{self.agent_id}] Reconnected to Redis")
            await self._flush_message_queue()

        except Exception as e:
            logger.error(f"[{self.agent_id}] Reconnection failed: {e}")
            self._redis = None

    async def _write_heartbeat_to_supabase(self):
        """Write heartbeat directly to Supabase agents table"""
        if not self._supabase_url or not self._supabase_key or not self._http_client:
            logger.debug(
                f"[{self.agent_id}] Supabase not configured, skipping DB heartbeat"
            )
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
                "error_message": None,
            }

            response = await self._http_client.post(
                f"{self._supabase_url}/rest/v1/agents",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates",
                },
                json=payload,
            )

            if response.status_code not in (200, 201, 204):
                logger.warning(
                    f"[{self.agent_id}] Heartbeat write failed: {response.status_code} {response.text}"
                )
            else:
                logger.debug(f"[{self.agent_id}] Heartbeat written to Supabase")

        except ImportError:
            # psutil not available, use defaults
            await self._write_heartbeat_simple()
        except Exception as e:
            logger.error(
                f"[{self.agent_id}] Failed to write heartbeat to Supabase: {e}"
            )

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
                "error_message": None,
            }

            await self._http_client.post(
                f"{self._supabase_url}/rest/v1/agents",
                headers={
                    "apikey": self._supabase_key,
                    "Authorization": f"Bearer {self._supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates",
                },
                json=payload,
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
                "metrics": self._metrics,
                "behavior_version": self._behavior_version.version,
                "drift": self._drift.to_dict(),
            },
        )
        self._metrics["last_heartbeat"] = datetime.now(UTC).isoformat()

        # Supabase heartbeat for monitoring
        await self._write_heartbeat_to_supabase()

    async def send_alert(
        self, severity: str, title: str, message: str, metadata: Optional[Dict] = None
    ):
        """Send an alert to the alerts channel AND persist to Supabase"""
        await self.publish(
            AgentChannel.ALERTS,
            {
                "severity": severity,
                "title": title,
                "message": message,
                "metadata": metadata or {},
            },
        )

        # Also persist to Supabase alerts table
        if self._supabase_url and self._supabase_key and self._http_client:
            try:
                await self._http_client.post(
                    f"{self._supabase_url}/rest/v1/alerts",
                    headers={
                        "apikey": self._supabase_key,
                        "Authorization": f"Bearer {self._supabase_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "title": title,
                        "message": message,
                        "severity": severity,
                        "source": f"agent:{self.agent_id}",
                        "metadata": metadata or {},
                    },
                )
            except Exception as e:
                logger.error(f"[{self.agent_id}] Failed to persist alert: {e}")

    def register_handler(self, channel: AgentChannel, handler: Callable):
        """Register a message handler for a specific channel"""
        self._message_handlers[channel.value] = handler

    # Channels that require valid signature for Zero Trust
    SIGNED_CHANNELS = frozenset(
        {
            AgentChannel.EXECUTION.value,
            AgentChannel.RISK_CHECK.value,
            AgentChannel.RISK_APPROVED.value,
            AgentChannel.RISK_REJECTED.value,
            AgentChannel.CONTROL.value,
        }
    )

    async def _process_message(self, raw_message: Dict):
        """Process incoming message from pub/sub with signature verification."""
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

            # Zero Trust: verify signature on critical channels
            if channel in self.SIGNED_CHANNELS and message.signature:
                # Build unsigned payload for verification
                unsigned = AgentMessage(
                    id=message.id,
                    timestamp=message.timestamp,
                    source_agent=message.source_agent,
                    target_agent=message.target_agent,
                    channel=message.channel,
                    payload=message.payload,
                    correlation_id=message.correlation_id,
                    signature=None,
                )
                if not verify_agent_signature(
                    message.source_agent, unsigned.to_json(), message.signature
                ):
                    self._metrics["signature_failures"] += 1
                    logger.warning(
                        f"[{self.agent_id}] Rejected message with invalid signature "
                        f"from {message.source_agent} on {channel}"
                    )
                    return

            # Handle control messages
            if channel == AgentChannel.CONTROL.value:
                await self._handle_control(message)
                return

            # Call registered handler
            if hasattr(self, "_message_handlers") and channel in self._message_handlers:
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
                try:
                    message = await self._pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=0.1
                    )
                    if message:
                        await self._process_message(message)
                except (redis.ConnectionError, redis.TimeoutError):
                    logger.warning(
                        f"[{self.agent_id}] Redis connection lost, attempting reconnect..."
                    )
                    await self._attempt_reconnect()
                    await asyncio.sleep(1)

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
                        "Content-Type": "application/json",
                    },
                    json={"status": "stopped"},
                )
            except Exception as e:
                logger.error(f"[{self.agent_id}] Failed to mark as stopped: {e}")

    async def _heartbeat_loop(self):
        """Send periodic heartbeats (every 30 seconds for Supabase)"""
        while self._running:
            await self.send_heartbeat()
            await asyncio.sleep(30)  # 30 second interval for production

    # ── Drift monitoring methods ──

    def record_decision(self, approved: bool):
        """Record an agent decision outcome for drift tracking."""
        self._drift.total_decisions += 1
        if approved:
            self._drift.approval_count += 1
        else:
            self._drift.rejection_count += 1

    def record_override(self):
        """Record a human override of an agent decision."""
        self._drift.override_count += 1
        self._drift.total_decisions += 1

    def record_fallback(self):
        """Record the agent falling back to default behavior."""
        self._drift.fallback_count += 1

    def get_behavior_info(self) -> Dict[str, Any]:
        """Return behavior version + drift metrics for monitoring."""
        return {
            "behavior_version": asdict(self._behavior_version),
            "drift": self._drift.to_dict(),
        }

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
