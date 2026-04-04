"""
MEXC Exchange Adapter - Supports Spot, Margin, and Futures Trading
"""

import hashlib
import hmac
import random
import time
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

import httpx
import structlog

from app.adapters.base import VenueAdapter
from app.config import settings
from app.models.domain import Order, OrderSide, OrderStatus, VenueHealth, VenueStatus

logger = structlog.get_logger()


class MEXCAdapter(VenueAdapter):
    """
    Adapter for MEXC Exchange API.

    Supports:
    - Spot trading
    - Margin trading (with leverage)
    - Futures trading (perpetual contracts)
    - Paper trading mode
    """

    SPOT_BASE_URL = "https://api.mexc.com"
    FUTURES_BASE_URL = "https://contract.mexc.com"

    def __init__(self, market_type: str = "spot"):
        super().__init__(paper_mode=settings.is_paper_mode)
        self.name = "mexc"
        self.market_type = market_type  # spot, margin, futures
        self._connected = False
        self._client: Optional[httpx.AsyncClient] = None
        self._last_health_check: Optional[datetime] = None
        self._consecutive_errors = 0

    async def connect(self) -> bool:
        """Establish connection to MEXC API."""
        if self.paper_mode:
            self._connected = True
            logger.info("mexc_connected", mode="paper", market_type=self.market_type)
            return True

        # Validate credentials exist
        if not settings.mexc.api_key or not settings.mexc.api_secret:
            logger.error("mexc_connect_failed", reason="missing_credentials")
            return False

        # Initialize HTTP client
        base_url = (
            self.FUTURES_BASE_URL
            if self.market_type == "futures"
            else self.SPOT_BASE_URL
        )
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=30.0,
            headers={"Content-Type": "application/json"},
        )

        # Test connectivity
        try:
            await self._make_request(
                "GET",
                "/api/v3/account"
                if self.market_type != "futures"
                else "/api/v1/private/account/assets",
            )
            self._connected = True
            logger.info("mexc_connected", mode="live", market_type=self.market_type)
            return True
        except Exception as e:
            logger.error("mexc_connect_failed", error=str(e))
            return False

    async def disconnect(self):
        """Clean up connection resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False
        logger.info("mexc_disconnected")

    def _generate_signature(self, params: Dict) -> str:
        """Generate HMAC SHA256 signature for authenticated requests."""
        query_string = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
        signature = hmac.new(
            settings.mexc.api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return signature

    async def _make_request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        body: Optional[Dict] = None,
        signed: bool = True,
    ) -> Dict:
        """Make a request to MEXC API."""
        if self.paper_mode:
            raise RuntimeError("Cannot make real request in paper mode")

        if not self._client:
            raise RuntimeError("Client not initialized - call connect() first")

        params = params or {}

        if signed:
            params["timestamp"] = str(int(time.time() * 1000))
            params["recvWindow"] = "5000"
            params["signature"] = self._generate_signature(params)

        headers = {
            "X-MEXC-APIKEY": settings.mexc.api_key,
        }

        try:
            if method == "GET":
                response = await self._client.get(path, params=params, headers=headers)
            elif method == "POST":
                response = await self._client.post(
                    path, params=params, json=body, headers=headers
                )
            elif method == "DELETE":
                response = await self._client.delete(
                    path, params=params, headers=headers
                )
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            self._consecutive_errors = 0
            return response.json()

        except httpx.HTTPStatusError as e:
            self._consecutive_errors += 1
            logger.error(
                "mexc_api_error", status_code=e.response.status_code, path=path
            )
            raise
        except Exception as e:
            self._consecutive_errors += 1
            logger.error("mexc_request_failed", error=str(e), path=path)
            raise

    async def place_order(self, order: Order) -> Order:
        """Place an order - paper or live."""
        if self.paper_mode:
            return await self._simulate_fill(order)

        return await self._place_live_order(order)

    async def _place_live_order(self, order: Order) -> Order:
        """Place a real order on MEXC."""
        start_time = time.time()

        if self.market_type == "futures":
            params = {
                "symbol": order.instrument.replace("-", "_"),
                "side": 1
                if order.side == OrderSide.BUY
                else 2,  # 1=open long, 2=open short
                "openType": 1,  # Isolated margin
                "type": 5 if order.order_type == "market" else 1,  # 5=market, 1=limit
                "vol": str(order.size),
            }
            if order.price and order.order_type == "limit":
                params["price"] = str(order.price)

            path = "/api/v1/private/order/submit"
        else:
            params = {
                "symbol": order.instrument.replace("-", ""),
                "side": order.side.value.upper(),
                "type": "MARKET" if order.order_type == "market" else "LIMIT",
                "quantity": str(order.size),
            }
            if order.price and order.order_type == "limit":
                params["price"] = str(order.price)

            path = "/api/v3/order"

        try:
            response = await self._make_request("POST", path, params=params)

            latency_ms = int((time.time() - start_time) * 1000)
            order.latency_ms = latency_ms

            if response.get("orderId") or response.get("data"):
                order.venue_order_id = str(
                    response.get("orderId") or response.get("data")
                )
                order.status = OrderStatus.OPEN
                logger.info(
                    "mexc_order_placed", order_id=str(order.id), latency_ms=latency_ms
                )
            else:
                order.status = OrderStatus.REJECTED
                logger.error(
                    "mexc_order_rejected", order_id=str(order.id), response=response
                )

            return order

        except Exception as e:
            order.status = OrderStatus.REJECTED
            logger.error("mexc_order_failed", order_id=str(order.id), error=str(e))
            return order

    async def _simulate_fill(self, order: Order) -> Order:
        """Simulate order fill in paper mode with realistic behavior."""
        # Simulate network latency (30-150ms typical for MEXC)
        latency_ms = random.randint(30, 150)
        order.latency_ms = latency_ms

        # Simulate slippage (0.1% to 0.3% for MEXC - slightly higher than Coinbase)
        slippage_pct = random.uniform(0.001, 0.003)
        base_price = order.price or await self._get_simulated_price(order.instrument)

        if order.side == OrderSide.BUY:
            fill_price = base_price * (1 + slippage_pct)
        else:
            fill_price = base_price * (1 - slippage_pct)

        # Simulate partial fills (15% chance - slightly higher for MEXC)
        if random.random() < 0.15:
            fill_ratio = random.uniform(0.4, 0.9)
            order.filled_size = order.size * fill_ratio
            order.status = OrderStatus.OPEN
            logger.info(
                "mexc_paper_order_partial",
                order_id=str(order.id),
                fill_ratio=fill_ratio,
            )
        else:
            order.filled_size = order.size
            order.status = OrderStatus.FILLED

        order.filled_price = round(fill_price, 2)
        order.slippage = round(slippage_pct * 100, 4)
        order.venue_order_id = f"mexc-paper-{uuid4().hex[:12]}"

        logger.info(
            "mexc_paper_order_filled",
            order_id=str(order.id),
            price=order.filled_price,
            slippage_bps=order.slippage * 100,
            latency_ms=latency_ms,
        )

        return order

    async def _get_simulated_price(self, instrument: str) -> float:
        """Get simulated price for an instrument."""
        prices = {
            "BTC-USDT": 50000 + random.uniform(-500, 500),
            "ETH-USDT": 3000 + random.uniform(-50, 50),
            "SOL-USDT": 100 + random.uniform(-5, 5),
            "DOGE-USDT": 0.08 + random.uniform(-0.005, 0.005),
            "BTC_USDT": 50000 + random.uniform(-500, 500),
            "ETH_USDT": 3000 + random.uniform(-50, 50),
        }
        return prices.get(instrument, 100)

    async def cancel_order(self, venue_order_id: str) -> bool:
        """Cancel an open order."""
        if self.paper_mode:
            logger.info("mexc_paper_order_cancelled", venue_order_id=venue_order_id)
            return True

        try:
            if self.market_type == "futures":
                params = {"orderId": venue_order_id}
                await self._make_request(
                    "POST", "/api/v1/private/order/cancel", params=params
                )
            else:
                params = {"orderId": venue_order_id}
                await self._make_request("DELETE", "/api/v3/order", params=params)

            logger.info("mexc_order_cancelled", venue_order_id=venue_order_id)
            return True

        except Exception as e:
            logger.error(
                "mexc_order_cancel_error", venue_order_id=venue_order_id, error=str(e)
            )
            return False

    async def get_balance(self) -> Dict[str, float]:
        """Get account balances."""
        if self.paper_mode:
            if self.market_type == "futures":
                return {"USDT": 50000.00}  # Futures uses USDT as collateral
            return {"USDT": 50000.00, "BTC": 0.5, "ETH": 5.0, "SOL": 100.0}

        try:
            if self.market_type == "futures":
                response = await self._make_request(
                    "GET", "/api/v1/private/account/assets"
                )
                return {
                    asset["currency"]: float(asset["availableBalance"])
                    for asset in response.get("data", [])
                }
            else:
                response = await self._make_request("GET", "/api/v3/account")
                return {
                    b["asset"]: float(b["free"])
                    for b in response.get("balances", [])
                    if float(b["free"]) > 0
                }
        except Exception as e:
            logger.error("mexc_get_balance_failed", error=str(e))
            return {}

    async def get_positions(self) -> List[Dict]:
        """Get current positions (futures only, or spot balances)."""
        if self.paper_mode:
            if self.market_type == "futures":
                return [
                    {
                        "instrument": "BTC_USDT",
                        "size": 0.1,
                        "side": "buy",
                        "entry_price": 49000,
                        "leverage": 10,
                    },
                    {
                        "instrument": "ETH_USDT",
                        "size": 1.0,
                        "side": "sell",
                        "entry_price": 3100,
                        "leverage": 5,
                    },
                ]
            return []

        try:
            if self.market_type == "futures":
                response = await self._make_request(
                    "GET", "/api/v1/private/position/open_positions"
                )
                positions = []
                for pos in response.get("data", []):
                    if float(pos.get("holdVol", 0)) > 0:
                        positions.append(
                            {
                                "instrument": pos["symbol"],
                                "size": float(pos["holdVol"]),
                                "side": "buy" if pos["positionType"] == 1 else "sell",
                                "entry_price": float(pos["openAvgPrice"]),
                                "leverage": int(pos["leverage"]),
                                "unrealized_pnl": float(pos.get("unrealisedPnl", 0)),
                                "liquidation_price": float(
                                    pos.get("liquidatePrice", 0)
                                ),
                            }
                        )
                return positions
            else:
                balances = await self.get_balance()
                return [
                    {
                        "instrument": f"{currency}-USDT",
                        "size": amount,
                        "side": "buy",
                        "entry_price": 0,
                    }
                    for currency, amount in balances.items()
                    if currency not in ["USDT", "USD"]
                ]
        except Exception as e:
            logger.error("mexc_get_positions_failed", error=str(e))
            return []

    async def get_open_orders(self) -> List[Dict]:
        """Get all open orders."""
        if self.paper_mode:
            return []

        try:
            if self.market_type == "futures":
                response = await self._make_request(
                    "GET", "/api/v1/private/order/list/open_orders"
                )
                orders = []
                for order_data in response.get("data", []):
                    orders.append(
                        {
                            "venue_order_id": str(order_data.get("orderId")),
                            "instrument": order_data.get("symbol"),
                            "side": "buy" if order_data.get("side") == 1 else "sell",
                            "size": float(order_data.get("vol", 0)),
                            "price": float(order_data.get("price", 0)),
                            "status": "open",
                        }
                    )
                return orders
            else:
                response = await self._make_request("GET", "/api/v3/openOrders")
                return [
                    {
                        "venue_order_id": str(o["orderId"]),
                        "instrument": o["symbol"],
                        "side": o["side"].lower(),
                        "size": float(o["origQty"]),
                        "price": float(o["price"]),
                        "status": o["status"].lower(),
                    }
                    for o in response
                ]
        except Exception as e:
            logger.error("mexc_get_open_orders_failed", error=str(e))
            return []

    async def set_leverage(self, symbol: str, leverage: int) -> bool:
        """Set leverage for a futures symbol."""
        if self.market_type != "futures":
            logger.warning("mexc_leverage_not_supported", market_type=self.market_type)
            return False

        if self.paper_mode:
            logger.info("mexc_paper_leverage_set", symbol=symbol, leverage=leverage)
            return True

        try:
            params = {
                "symbol": symbol,
                "leverage": str(leverage),
                "openType": 1,  # Isolated margin
            }
            await self._make_request(
                "POST", "/api/v1/private/position/change_leverage", params=params
            )
            logger.info("mexc_leverage_set", symbol=symbol, leverage=leverage)
            return True
        except Exception as e:
            logger.error("mexc_set_leverage_failed", symbol=symbol, error=str(e))
            return False

    async def get_ticker(self, symbol: str) -> Optional[Dict]:
        """Get current ticker data (public endpoint)."""
        try:
            async with httpx.AsyncClient() as client:
                if self.market_type == "futures":
                    response = await client.get(
                        f"{self.FUTURES_BASE_URL}/api/v1/contract/ticker?symbol={symbol}"
                    )
                else:
                    response = await client.get(
                        f"{self.SPOT_BASE_URL}/api/v3/ticker/price?symbol={symbol.replace('-', '')}"
                    )

                if response.status_code == 200:
                    data = response.json()
                    if self.market_type == "futures":
                        return {
                            "price": float(data.get("data", {}).get("lastPrice", 0)),
                            "bid": float(data.get("data", {}).get("bid1", 0)),
                            "ask": float(data.get("data", {}).get("ask1", 0)),
                            "volume_24h": float(
                                data.get("data", {}).get("volume24", 0)
                            ),
                        }
                    else:
                        return {
                            "price": float(data.get("price", 0)),
                            "symbol": symbol,
                        }
                return None
        except Exception as e:
            logger.error("mexc_get_ticker_failed", symbol=symbol, error=str(e))
            return None

    async def get_funding_rate(self, symbol: str) -> Optional[Dict]:
        """Get current funding rate for futures."""
        if self.market_type != "futures":
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.FUTURES_BASE_URL}/api/v1/contract/funding_rate?symbol={symbol}"
                )

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "symbol": symbol,
                        "funding_rate": float(
                            data.get("data", {}).get("fundingRate", 0)
                        ),
                        "next_funding_time": data.get("data", {}).get("nextSettleTime"),
                    }
                return None
        except Exception as e:
            logger.error("mexc_get_funding_rate_failed", symbol=symbol, error=str(e))
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
            latency = random.randint(30, 150) if self.paper_mode else 0

        # Try a real latency check in live mode
        if not self.paper_mode and self._connected:
            try:
                start = time.time()
                await self.get_ticker(
                    "BTC_USDT" if self.market_type == "futures" else "BTCUSDT"
                )
                latency = int((time.time() - start) * 1000)
            except Exception:
                self._consecutive_errors += 1

        error_rate = min(self._consecutive_errors * 2.0, 100.0)

        supported = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "DOGE-USDT"]
        if self.market_type == "futures":
            supported = ["BTC_USDT", "ETH_USDT", "SOL_USDT"]

        return VenueHealth(
            venue_id=uuid4(),
            name=f"{self.name}_{self.market_type}",
            status=status,
            latency_ms=latency,
            error_rate=error_rate,
            last_heartbeat=self._last_health_check,
            is_enabled=self._connected,
            supported_instruments=supported,
        )
