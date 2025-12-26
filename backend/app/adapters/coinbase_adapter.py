"""
Coinbase Advanced Trade Adapter - Supports both Paper and Live Trading
"""
import structlog
import hmac
import hashlib
import time
import json
from typing import Dict, List, Optional
from datetime import datetime
from uuid import uuid4
import random
import httpx

from app.adapters.base import VenueAdapter
from app.models.domain import Order, OrderStatus, OrderSide, VenueHealth, VenueStatus
from app.config import settings

logger = structlog.get_logger()


class CoinbaseAdapter(VenueAdapter):
    """
    Adapter for Coinbase Advanced Trade API.
    
    Supports:
    - Paper trading mode (simulated fills)
    - Live trading mode (real API calls)
    """
    
    BASE_URL = "https://api.coinbase.com"
    API_VERSION = "2024-02-01"
    
    def __init__(self):
        super().__init__(paper_mode=settings.is_paper_mode)
        self.name = "coinbase"
        self._connected = False
        self._client: Optional[httpx.AsyncClient] = None
        self._last_health_check: Optional[datetime] = None
        self._consecutive_errors = 0
        
    async def connect(self) -> bool:
        """Establish connection to Coinbase API."""
        if self.paper_mode:
            self._connected = True
            logger.info("coinbase_connected", mode="paper")
            return True
        
        # Validate credentials exist
        if not settings.coinbase.api_key or not settings.coinbase.api_secret:
            logger.error("coinbase_connect_failed", reason="missing_credentials")
            return False
        
        # Initialize HTTP client for live trading
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            timeout=30.0,
            headers={
                "Content-Type": "application/json",
                "CB-VERSION": self.API_VERSION,
            }
        )
        
        # Test connectivity with accounts endpoint
        try:
            response = await self._authenticated_request("GET", "/api/v3/brokerage/accounts")
            if response.get("accounts"):
                self._connected = True
                logger.info("coinbase_connected", mode="live", accounts=len(response["accounts"]))
                return True
            else:
                logger.warning("coinbase_connect_partial", response=response)
                self._connected = True
                return True
        except Exception as e:
            logger.error("coinbase_connect_failed", error=str(e))
            return False
    
    async def disconnect(self):
        """Clean up connection resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False
        logger.info("coinbase_disconnected")
    
    def _generate_signature(self, timestamp: str, method: str, path: str, body: str = "") -> str:
        """Generate HMAC signature for authenticated requests."""
        message = timestamp + method + path + body
        signature = hmac.new(
            settings.coinbase.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    async def _authenticated_request(
        self,
        method: str,
        path: str,
        body: Optional[Dict] = None
    ) -> Dict:
        """Make an authenticated request to Coinbase API."""
        if self.paper_mode:
            raise RuntimeError("Cannot make authenticated request in paper mode")
        
        if not self._client:
            raise RuntimeError("Client not initialized - call connect() first")
        
        timestamp = str(int(time.time()))
        body_str = json.dumps(body) if body else ""
        signature = self._generate_signature(timestamp, method, path, body_str)
        
        headers = {
            "CB-ACCESS-KEY": settings.coinbase.api_key,
            "CB-ACCESS-SIGN": signature,
            "CB-ACCESS-TIMESTAMP": timestamp,
        }
        
        try:
            if method == "GET":
                response = await self._client.get(path, headers=headers)
            elif method == "POST":
                response = await self._client.post(path, headers=headers, json=body)
            elif method == "DELETE":
                response = await self._client.delete(path, headers=headers)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            self._consecutive_errors = 0
            return response.json()
            
        except httpx.HTTPStatusError as e:
            self._consecutive_errors += 1
            logger.error(
                "coinbase_api_error",
                status_code=e.response.status_code,
                body=e.response.text,
                path=path
            )
            raise
        except Exception as e:
            self._consecutive_errors += 1
            logger.error("coinbase_request_failed", error=str(e), path=path)
            raise
    
    async def place_order(self, order: Order) -> Order:
        """Place an order - paper or live."""
        if self.paper_mode:
            return await self._simulate_fill(order)
        
        return await self._place_live_order(order)
    
    async def _place_live_order(self, order: Order) -> Order:
        """Place a real order on Coinbase."""
        order_config = {
            "client_order_id": str(order.id),
            "product_id": order.instrument,
            "side": order.side.value.upper(),
        }
        
        # Order type configuration
        if order.order_type == "market":
            if order.side == OrderSide.BUY:
                order_config["order_configuration"] = {
                    "market_market_ioc": {
                        "quote_size": str(order.size * (order.price or 50000))  # Approximate USD value
                    }
                }
            else:
                order_config["order_configuration"] = {
                    "market_market_ioc": {
                        "base_size": str(order.size)
                    }
                }
        else:  # limit order
            order_config["order_configuration"] = {
                "limit_limit_gtc": {
                    "base_size": str(order.size),
                    "limit_price": str(order.price),
                }
            }
        
        start_time = time.time()
        
        try:
            response = await self._authenticated_request(
                "POST",
                "/api/v3/brokerage/orders",
                order_config
            )
            
            latency_ms = int((time.time() - start_time) * 1000)
            order.latency_ms = latency_ms
            
            if response.get("success"):
                order_data = response.get("order_configuration", {})
                order.venue_order_id = response.get("order_id")
                order.status = OrderStatus.OPEN
                
                logger.info(
                    "live_order_placed",
                    order_id=str(order.id),
                    venue_order_id=order.venue_order_id,
                    latency_ms=latency_ms
                )
            else:
                order.status = OrderStatus.REJECTED
                error_msg = response.get("error_response", {}).get("message", "Unknown error")
                logger.error("live_order_rejected", order_id=str(order.id), error=error_msg)
            
            return order
            
        except Exception as e:
            order.status = OrderStatus.REJECTED
            logger.error("live_order_failed", order_id=str(order.id), error=str(e))
            return order
    
    async def _simulate_fill(self, order: Order) -> Order:
        """Simulate order fill in paper mode with realistic behavior."""
        # Simulate network latency (20-100ms)
        latency_ms = random.randint(20, 100)
        order.latency_ms = latency_ms
        
        # Simulate slippage (0.05% to 0.2%)
        slippage_pct = random.uniform(0.0005, 0.002)
        base_price = order.price or await self._get_simulated_price(order.instrument)
        
        if order.side == OrderSide.BUY:
            fill_price = base_price * (1 + slippage_pct)
        else:
            fill_price = base_price * (1 - slippage_pct)
        
        # Simulate partial fills (10% chance)
        if random.random() < 0.10:
            fill_ratio = random.uniform(0.5, 0.95)
            order.filled_size = order.size * fill_ratio
            order.status = OrderStatus.OPEN  # Partial fill
            logger.info("paper_order_partial", order_id=str(order.id), fill_ratio=fill_ratio)
        else:
            order.filled_size = order.size
            order.status = OrderStatus.FILLED
        
        order.filled_price = round(fill_price, 2)
        order.slippage = round(slippage_pct * 100, 4)
        order.venue_order_id = f"paper-{uuid4().hex[:12]}"
        
        logger.info(
            "paper_order_filled",
            order_id=str(order.id),
            price=order.filled_price,
            slippage_bps=order.slippage * 100,
            latency_ms=latency_ms
        )
        
        return order
    
    async def _get_simulated_price(self, instrument: str) -> float:
        """Get simulated price for an instrument."""
        prices = {
            "BTC-USD": 50000 + random.uniform(-500, 500),
            "ETH-USD": 3000 + random.uniform(-50, 50),
            "SOL-USD": 100 + random.uniform(-5, 5),
            "DOGE-USD": 0.08 + random.uniform(-0.005, 0.005),
        }
        return prices.get(instrument, 100)
    
    async def cancel_order(self, venue_order_id: str) -> bool:
        """Cancel an open order."""
        if self.paper_mode:
            logger.info("paper_order_cancelled", venue_order_id=venue_order_id)
            return True
        
        try:
            response = await self._authenticated_request(
                "POST",
                "/api/v3/brokerage/orders/batch_cancel",
                {"order_ids": [venue_order_id]}
            )
            
            results = response.get("results", [])
            if results and results[0].get("success"):
                logger.info("live_order_cancelled", venue_order_id=venue_order_id)
                return True
            else:
                logger.warning("live_order_cancel_failed", venue_order_id=venue_order_id, response=response)
                return False
                
        except Exception as e:
            logger.error("order_cancel_error", venue_order_id=venue_order_id, error=str(e))
            return False
    
    async def get_balance(self) -> Dict[str, float]:
        """Get account balances."""
        if self.paper_mode:
            return {
                "USD": 100000.00,
                "BTC": 1.5,
                "ETH": 10.0,
                "SOL": 50.0
            }
        
        try:
            response = await self._authenticated_request("GET", "/api/v3/brokerage/accounts")
            
            balances = {}
            for account in response.get("accounts", []):
                currency = account.get("currency")
                available = float(account.get("available_balance", {}).get("value", 0))
                if available > 0:
                    balances[currency] = available
            
            return balances
            
        except Exception as e:
            logger.error("get_balance_failed", error=str(e))
            return {}
    
    async def get_positions(self) -> List[Dict]:
        """Get current positions (for spot, this is non-USD balances)."""
        if self.paper_mode:
            return [
                {"instrument": "BTC-USD", "size": 1.5, "side": "buy", "entry_price": 48000},
                {"instrument": "ETH-USD", "size": 10.0, "side": "buy", "entry_price": 2800},
            ]
        
        try:
            balances = await self.get_balance()
            positions = []
            
            for currency, amount in balances.items():
                if currency != "USD" and amount > 0:
                    positions.append({
                        "instrument": f"{currency}-USD",
                        "size": amount,
                        "side": "buy",
                        "entry_price": 0  # Would need to track from fills
                    })
            
            return positions
            
        except Exception as e:
            logger.error("get_positions_failed", error=str(e))
            return []
    
    async def get_open_orders(self) -> List[Dict]:
        """Get all open orders."""
        if self.paper_mode:
            return []
        
        try:
            response = await self._authenticated_request(
                "GET",
                "/api/v3/brokerage/orders/historical/batch?order_status=OPEN"
            )
            
            orders = []
            for order_data in response.get("orders", []):
                orders.append({
                    "venue_order_id": order_data.get("order_id"),
                    "instrument": order_data.get("product_id"),
                    "side": order_data.get("side", "").lower(),
                    "size": float(order_data.get("base_size", 0)),
                    "price": float(order_data.get("average_filled_price", 0)),
                    "status": order_data.get("status"),
                })
            
            return orders
            
        except Exception as e:
            logger.error("get_open_orders_failed", error=str(e))
            return []
    
    async def get_ticker(self, product_id: str) -> Optional[Dict]:
        """Get current ticker data (public endpoint)."""
        try:
            # Use public endpoint - no auth required
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/api/v3/brokerage/market/products/{product_id}/ticker",
                    headers={"CB-VERSION": self.API_VERSION}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    trades = data.get("trades", [])
                    if trades:
                        return {
                            "price": float(trades[0].get("price", 0)),
                            "size": float(trades[0].get("size", 0)),
                            "time": trades[0].get("time"),
                            "product_id": product_id
                        }
                
                return None
                
        except Exception as e:
            logger.error("get_ticker_failed", product_id=product_id, error=str(e))
            return None
    
    async def health_check(self) -> VenueHealth:
        """Check venue health status."""
        self._last_health_check = datetime.utcnow()
        
        # Determine status based on connection state and errors
        if not self._connected:
            status = VenueStatus.OFFLINE
            latency = 0
        elif self._consecutive_errors >= 5:
            status = VenueStatus.OFFLINE
            latency = 0
        elif self._consecutive_errors >= 2:
            status = VenueStatus.DEGRADED
            latency = random.randint(200, 500) if self.paper_mode else 0
        else:
            status = VenueStatus.HEALTHY
            latency = random.randint(20, 100) if self.paper_mode else 0
        
        # Try a real latency check in live mode
        if not self.paper_mode and self._connected:
            try:
                start = time.time()
                await self.get_ticker("BTC-USD")
                latency = int((time.time() - start) * 1000)
            except Exception:
                self._consecutive_errors += 1
        
        error_rate = min(self._consecutive_errors * 2.0, 100.0)
        
        return VenueHealth(
            venue_id=uuid4(),
            name=self.name,
            status=status,
            latency_ms=latency,
            error_rate=error_rate,
            last_heartbeat=self._last_health_check,
            is_enabled=self._connected,
            supported_instruments=["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD"]
        )
