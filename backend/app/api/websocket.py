"""
WebSocket API - Real-time streaming endpoints.

Provides WebSocket connections for:
- Real-time market data (prices, orderbook)
- Trading signals
- Arbitrage opportunities
- Portfolio updates
- Agent status
"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from enum import Enum
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/ws", tags=["websocket"])


class StreamType(str, Enum):
    """Available stream types."""
    MARKET = "market"
    SIGNALS = "signals"
    ARBITRAGE = "arbitrage"
    PORTFOLIO = "portfolio"
    AGENTS = "agents"
    ALL = "all"


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""
    
    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = {
            stream.value: set() for stream in StreamType
        }
        self._user_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, stream: str, user_id: Optional[str] = None):
        """Accept and track a new connection."""
        await websocket.accept()
        
        if stream in self._connections:
            self._connections[stream].add(websocket)
        
        if user_id:
            self._user_connections[user_id] = websocket
        
        logger.info(f"WebSocket connected: stream={stream}, user={user_id}")
    
    def disconnect(self, websocket: WebSocket, stream: str, user_id: Optional[str] = None):
        """Remove a disconnected connection."""
        if stream in self._connections:
            self._connections[stream].discard(websocket)
        
        if user_id and user_id in self._user_connections:
            del self._user_connections[user_id]
        
        logger.info(f"WebSocket disconnected: stream={stream}")
    
    async def broadcast(self, stream: str, data: Dict[str, Any]):
        """Broadcast message to all connections on a stream."""
        if stream not in self._connections:
            return
        
        message = json.dumps({
            "stream": stream,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data
        })
        
        disconnected = set()
        for websocket in self._connections[stream]:
            try:
                await websocket.send_text(message)
            except Exception:
                disconnected.add(websocket)
        
        # Clean up disconnected
        for ws in disconnected:
            self._connections[stream].discard(ws)
    
    async def send_to_user(self, user_id: str, data: Dict[str, Any]):
        """Send message to specific user."""
        if user_id in self._user_connections:
            try:
                await self._user_connections[user_id].send_json(data)
            except Exception:
                del self._user_connections[user_id]
    
    def get_connection_count(self, stream: str) -> int:
        """Get number of connections on a stream."""
        return len(self._connections.get(stream, set()))


# Global connection manager
manager = ConnectionManager()


async def _authenticate_websocket(websocket: WebSocket) -> Optional[str]:
    """
    Authenticate a WebSocket connection via token query parameter or first message.

    Returns the authenticated user_id or None if authentication fails.
    """
    # Try token from query params
    token = websocket.query_params.get("token")
    if not token:
        # Check Authorization header (some WS clients support it)
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        return None

    try:
        from app.core.security import verify_token
        user = await verify_token(token)
        return user.get("id")
    except Exception as e:
        logger.warning("websocket_auth_failed", error=str(e))
        return None


@router.websocket("/stream/{stream_type}")
async def websocket_stream(
    websocket: WebSocket,
    stream_type: str,
    user_id: Optional[str] = Query(None)
):
    """
    Main WebSocket endpoint for real-time data streams.

    Authentication required via ?token=<jwt> query parameter or Authorization header.

    Stream types:
    - market: Real-time price updates
    - signals: Trading signals from strategies
    - arbitrage: Arbitrage opportunities
    - portfolio: Portfolio updates
    - agents: Agent status updates
    - all: All streams combined
    """
    # Authenticate the WebSocket connection
    authenticated_user_id = await _authenticate_websocket(websocket)
    if authenticated_user_id is None:
        await websocket.close(code=4001, reason="Authentication required")
        logger.warning("websocket_rejected_unauthenticated", stream=stream_type)
        return

    # Use authenticated user_id, ignore client-provided user_id
    user_id = authenticated_user_id
    await manager.connect(websocket, stream_type, user_id)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "stream": stream_type,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for client messages (ping/pong, subscriptions)
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0
                )
                
                # Handle client commands
                message = json.loads(data)
                await handle_client_message(websocket, message, stream_type)
                
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, stream_type, user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, stream_type, user_id)


async def handle_client_message(websocket: WebSocket, message: Dict, stream: str):
    """Handle incoming client messages."""
    msg_type = message.get("type")
    
    if msg_type == "pong":
        pass  # Client responded to ping
    
    elif msg_type == "subscribe":
        # Subscribe to specific symbols
        symbols = message.get("symbols", [])
        await websocket.send_json({
            "type": "subscribed",
            "symbols": symbols
        })
    
    elif msg_type == "unsubscribe":
        symbols = message.get("symbols", [])
        await websocket.send_json({
            "type": "unsubscribed",
            "symbols": symbols
        })


# Broadcast functions for other services to use
async def broadcast_market_update(symbol: str, price: float, change: float):
    """Broadcast market price update."""
    await manager.broadcast(StreamType.MARKET.value, {
        "type": "price",
        "symbol": symbol,
        "price": price,
        "change_24h": change
    })


async def broadcast_signal(signal: Dict[str, Any]):
    """Broadcast trading signal."""
    await manager.broadcast(StreamType.SIGNALS.value, {
        "type": "signal",
        "signal": signal
    })


async def broadcast_arbitrage(opportunity: Dict[str, Any]):
    """Broadcast arbitrage opportunity."""
    await manager.broadcast(StreamType.ARBITRAGE.value, {
        "type": "opportunity",
        "opportunity": opportunity
    })


async def broadcast_portfolio_update(user_id: str, portfolio: Dict[str, Any]):
    """Broadcast portfolio update to specific user."""
    await manager.send_to_user(user_id, {
        "type": "portfolio_update",
        "portfolio": portfolio
    })


def get_websocket_status() -> Dict[str, Any]:
    """Get WebSocket server status."""
    return {
        "connections": {
            stream.value: manager.get_connection_count(stream.value)
            for stream in StreamType
        },
        "total": sum(
            manager.get_connection_count(stream.value)
            for stream in StreamType
        )
    }

