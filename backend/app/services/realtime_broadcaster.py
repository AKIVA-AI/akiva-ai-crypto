"""
Real-time Broadcaster Service

Broadcasts real-time updates to WebSocket clients:
- Market data (prices, orderbook changes)
- Trading signals
- Arbitrage opportunities
- Portfolio changes
- Agent status updates

Integrates with Redis pub/sub for distributed messaging.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Callable, Dict, Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)


class RealtimeBroadcaster:
    """
    Broadcasts real-time updates to WebSocket clients.

    Listens to Redis pub/sub channels and forwards
    updates to connected WebSocket clients.
    """

    # Redis channels to listen to
    CHANNELS = {
        "market_data": "broadcast:market",
        "signals": "broadcast:signals",
        "arbitrage": "broadcast:arbitrage",
        "portfolio": "broadcast:portfolio",
        "agents": "broadcast:agents",
    }

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._running = False
        self._handlers: Dict[str, Callable] = {}
        self._metrics = {
            "messages_broadcast": 0,
            "errors": 0,
        }

    async def start(self):
        """Start the broadcaster."""
        try:
            self._redis = redis.from_url(self.redis_url)
            self._pubsub = self._redis.pubsub()

            # Subscribe to all channels
            await self._pubsub.subscribe(*self.CHANNELS.values())

            self._running = True
            logger.info("Realtime broadcaster started")

            # Start listening loop
            asyncio.create_task(self._listen_loop())

        except Exception as e:
            logger.error(f"Failed to start broadcaster: {e}")
            raise

    async def stop(self):
        """Stop the broadcaster."""
        self._running = False

        if self._pubsub:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()

        if self._redis:
            await self._redis.close()

        logger.info("Realtime broadcaster stopped")

    def register_handler(self, channel: str, handler: Callable):
        """Register a handler for a channel."""
        self._handlers[channel] = handler

    async def _listen_loop(self):
        """Main listening loop."""
        while self._running:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=0.1
                )

                if message:
                    await self._process_message(message)

            except (redis.ConnectionError, redis.TimeoutError) as e:
                logger.warning(
                    f"Broadcaster Redis connection lost: {e}. Reconnecting..."
                )
                self._metrics["errors"] += 1
                await self._reconnect()
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Broadcaster error: {e}")
                self._metrics["errors"] += 1
                await asyncio.sleep(1)

    async def _process_message(self, message: Dict):
        """Process incoming Redis message."""
        try:
            channel = message.get("channel")
            if isinstance(channel, bytes):
                channel = channel.decode()

            data = message.get("data")
            if isinstance(data, bytes):
                data = data.decode()

            payload = json.loads(data)

            # Find and call handler
            if channel in self._handlers:
                await self._handlers[channel](payload)
                self._metrics["messages_broadcast"] += 1

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            self._metrics["errors"] += 1

    async def _reconnect(self):
        """Attempt to reconnect to Redis."""
        try:
            if self._pubsub:
                await self._pubsub.close()
            if self._redis:
                await self._redis.close()
        except Exception:
            pass

        for attempt in range(5):
            try:
                self._redis = redis.from_url(self.redis_url)
                await self._redis.ping()
                self._pubsub = self._redis.pubsub()
                await self._pubsub.subscribe(*self.CHANNELS.values())
                logger.info(f"Broadcaster reconnected to Redis (attempt {attempt + 1})")
                return
            except Exception as e:
                delay = min(2**attempt, 16)
                logger.warning(
                    f"Broadcaster reconnect attempt {attempt + 1} failed: {e}. Retry in {delay}s"
                )
                await asyncio.sleep(delay)

        logger.error("Broadcaster failed to reconnect after 5 attempts")

    async def publish(self, channel: str, data: Dict[str, Any]):
        """Publish data to a channel."""
        if not self._redis:
            return

        try:
            redis_channel = self.CHANNELS.get(channel, f"broadcast:{channel}")
            message = json.dumps(
                {"timestamp": datetime.utcnow().isoformat(), "data": data}
            )
            await self._redis.publish(redis_channel, message)
        except (redis.ConnectionError, redis.TimeoutError) as e:
            logger.warning(f"Failed to publish to {channel} (connection lost): {e}")
            await self._reconnect()
        except Exception as e:
            logger.error(f"Failed to publish to {channel}: {e}")

    # Convenience methods for common broadcasts

    async def broadcast_price_update(
        self, symbol: str, price: float, change: float = 0
    ):
        """Broadcast price update."""
        await self.publish(
            "market_data",
            {"type": "price", "symbol": symbol, "price": price, "change_24h": change},
        )

    async def broadcast_signal(
        self, strategy: str, pair: str, action: str, price: float, confidence: float
    ):
        """Broadcast trading signal."""
        await self.publish(
            "signals",
            {
                "type": "signal",
                "strategy": strategy,
                "pair": pair,
                "action": action,
                "price": price,
                "confidence": confidence,
            },
        )

    async def broadcast_arbitrage_opportunity(
        self, arb_type: str, details: Dict[str, Any]
    ):
        """Broadcast arbitrage opportunity."""
        await self.publish(
            "arbitrage",
            {"type": "opportunity", "arb_type": arb_type, "details": details},
        )

    async def broadcast_agent_status(self, agent_id: str, status: str, metrics: Dict):
        """Broadcast agent status update."""
        await self.publish(
            "agents",
            {
                "type": "status",
                "agent_id": agent_id,
                "status": status,
                "metrics": metrics,
            },
        )

    def get_metrics(self) -> Dict[str, Any]:
        """Get broadcaster metrics."""
        return {
            "running": self._running,
            "channels": list(self.CHANNELS.keys()),
            "metrics": self._metrics,
        }


# Global broadcaster instance
realtime_broadcaster = RealtimeBroadcaster()


async def start_broadcaster(redis_url: str = None):
    """Start the global broadcaster."""
    if redis_url:
        realtime_broadcaster.redis_url = redis_url
    await realtime_broadcaster.start()


async def stop_broadcaster():
    """Stop the global broadcaster."""
    await realtime_broadcaster.stop()
