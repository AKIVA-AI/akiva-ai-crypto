"""
DEX Aggregator Adapter - For 0x/1inch style execution via 0x API or 1inch.
Supports quote fetching, swap execution, and gas estimation.
"""
import structlog
import aiohttp
from typing import Dict, List, Optional
from datetime import datetime
from uuid import uuid4
from dataclasses import dataclass
from decimal import Decimal
import random
import hashlib
import json

from app.adapters.base import VenueAdapter
from app.models.domain import Order, OrderStatus, VenueHealth, VenueStatus
from app.config import settings

logger = structlog.get_logger()


@dataclass
class SwapQuote:
    """DEX swap quote response."""
    sell_token: str
    buy_token: str
    sell_amount: str
    buy_amount: str
    price: float
    gas_estimate: int
    gas_price_gwei: float
    protocol: str
    route: List[str]
    slippage_bps: int
    price_impact_pct: float
    expires_at: datetime


@dataclass
class SwapResult:
    """DEX swap execution result."""
    tx_hash: str
    status: str
    sell_amount: float
    buy_amount: float
    effective_price: float
    gas_used: int
    gas_cost_eth: float
    block_number: int
    timestamp: datetime


class DEXAdapter(VenueAdapter):
    """
    Adapter for DEX aggregator (0x/1inch style).
    Supports multiple DEX aggregator backends.
    """
    
    # Supported aggregators
    AGGREGATOR_0X = "0x"
    AGGREGATOR_1INCH = "1inch"
    AGGREGATOR_PARASWAP = "paraswap"
    
    # Base URLs
    BASE_URLS = {
        "0x": "https://api.0x.org",
        "1inch": "https://api.1inch.dev/swap/v6.0/1",  # Ethereum mainnet
        "paraswap": "https://apiv5.paraswap.io",
    }
    
    # Common token addresses (Ethereum)
    TOKEN_ADDRESSES = {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "DAI": "0x6B175474E89094C44Da98b954EescdeCB5E9fCe68",
        "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    }
    
    def __init__(self, aggregator: str = "0x"):
        super().__init__(paper_mode=settings.is_paper_mode)
        self.name = "dex"
        self.aggregator = aggregator
        self.base_url = self.BASE_URLS.get(aggregator, self.BASE_URLS["0x"])
        self._connected = False
        self._session: Optional[aiohttp.ClientSession] = None
        
        # Rate limiting
        self._last_request_time: Optional[datetime] = None
        self._min_request_interval_ms = 100
        
        # Paper trading state
        self._paper_balances: Dict[str, float] = {
            "ETH": 10.0,
            "USDC": 50000.0,
            "WBTC": 0.5,
        }
    
    async def connect(self) -> bool:
        """Initialize connection to DEX aggregator."""
        if self.paper_mode:
            self._connected = True
            logger.info("dex_connected", mode="paper", aggregator=self.aggregator)
            return True
        
        try:
            # Verify API connectivity
            self._session = aiohttp.ClientSession(
                headers=self._get_headers()
            )
            
            # Test connection with a simple quote
            async with self._session.get(
                f"{self.base_url}/swap/v1/quote",
                params={
                    "sellToken": "ETH",
                    "buyToken": "USDC",
                    "sellAmount": "1000000000000000000",  # 1 ETH
                }
            ) as resp:
                if resp.status in [200, 400]:  # 400 is ok, means API is responding
                    self._connected = True
                    logger.info("dex_connected", aggregator=self.aggregator)
                    return True
                    
        except Exception as e:
            logger.error("dex_connection_failed", error=str(e))
        
        return False
    
    async def disconnect(self) -> None:
        """Close connection."""
        if self._session:
            await self._session.close()
            self._session = None
        self._connected = False
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers with authentication."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        if settings.dex.api_key:
            if self.aggregator == "0x":
                headers["0x-api-key"] = settings.dex.api_key
            elif self.aggregator == "1inch":
                headers["Authorization"] = f"Bearer {settings.dex.api_key}"
        
        return headers
    
    async def get_quote(
        self,
        sell_token: str,
        buy_token: str,
        sell_amount: float,
        slippage_bps: int = 50,  # 0.5% default
    ) -> Optional[SwapQuote]:
        """
        Get a swap quote from the DEX aggregator.
        
        Args:
            sell_token: Token to sell (symbol or address)
            buy_token: Token to buy (symbol or address)
            sell_amount: Amount to sell (in token units)
            slippage_bps: Maximum slippage in basis points
        
        Returns:
            SwapQuote with pricing and route information
        """
        if self.paper_mode:
            return self._simulate_quote(sell_token, buy_token, sell_amount, slippage_bps)
        
        try:
            # Convert symbols to addresses if needed
            sell_address = self.TOKEN_ADDRESSES.get(sell_token.upper(), sell_token)
            buy_address = self.TOKEN_ADDRESSES.get(buy_token.upper(), buy_token)
            
            # Convert to wei/smallest unit (assuming 18 decimals for simplicity)
            sell_amount_wei = int(sell_amount * 10**18)
            
            params = {
                "sellToken": sell_address,
                "buyToken": buy_address,
                "sellAmount": str(sell_amount_wei),
                "slippagePercentage": slippage_bps / 10000,
            }
            
            async with self._session.get(
                f"{self.base_url}/swap/v1/quote",
                params=params
            ) as resp:
                if resp.status != 200:
                    error = await resp.text()
                    logger.warning("dex_quote_failed", status=resp.status, error=error)
                    return None
                
                data = await resp.json()
                
                return SwapQuote(
                    sell_token=sell_token,
                    buy_token=buy_token,
                    sell_amount=data.get("sellAmount", "0"),
                    buy_amount=data.get("buyAmount", "0"),
                    price=float(data.get("price", 0)),
                    gas_estimate=int(data.get("estimatedGas", 200000)),
                    gas_price_gwei=float(data.get("gasPrice", 0)) / 1e9,
                    protocol=data.get("sources", [{}])[0].get("name", "unknown"),
                    route=data.get("orders", []),
                    slippage_bps=slippage_bps,
                    price_impact_pct=float(data.get("estimatedPriceImpact", 0)),
                    expires_at=datetime.utcnow(),
                )
                
        except Exception as e:
            logger.error("dex_quote_error", error=str(e))
            return None
    
    def _simulate_quote(
        self,
        sell_token: str,
        buy_token: str,
        sell_amount: float,
        slippage_bps: int,
    ) -> SwapQuote:
        """Simulate a quote for paper trading."""
        # Mock prices
        prices = {
            ("ETH", "USDC"): 3200.0,
            ("USDC", "ETH"): 1/3200.0,
            ("WBTC", "USDC"): 68000.0,
            ("USDC", "WBTC"): 1/68000.0,
            ("ETH", "WBTC"): 3200/68000,
            ("WBTC", "ETH"): 68000/3200,
        }
        
        key = (sell_token.upper(), buy_token.upper())
        base_price = prices.get(key, 1.0)
        
        # Add some spread
        spread = random.uniform(0.001, 0.005)
        price = base_price * (1 - spread)
        
        buy_amount = sell_amount * price
        
        return SwapQuote(
            sell_token=sell_token,
            buy_token=buy_token,
            sell_amount=str(int(sell_amount * 10**18)),
            buy_amount=str(int(buy_amount * 10**18)),
            price=price,
            gas_estimate=random.randint(150000, 300000),
            gas_price_gwei=random.uniform(20, 50),
            protocol="uniswap_v3" if random.random() > 0.5 else "curve",
            route=["pool_1", "pool_2"],
            slippage_bps=slippage_bps,
            price_impact_pct=random.uniform(0.01, 0.5),
            expires_at=datetime.utcnow(),
        )
    
    async def execute_swap(
        self,
        quote: SwapQuote,
        wallet_address: str,
        private_key: Optional[str] = None,
    ) -> Optional[SwapResult]:
        """
        Execute a swap based on a quote.
        
        In production, this would sign and submit the transaction.
        In paper mode, it simulates the swap.
        """
        if self.paper_mode:
            return self._simulate_swap(quote)
        
        # Production swap would:
        # 1. Build transaction from quote
        # 2. Sign with private key
        # 3. Submit to network
        # 4. Wait for confirmation
        
        logger.warning("dex_live_swap_not_implemented")
        raise NotImplementedError("Live DEX swaps require wallet integration")
    
    def _simulate_swap(self, quote: SwapQuote) -> SwapResult:
        """Simulate swap execution for paper trading."""
        # Add realistic slippage
        slippage = random.uniform(0.001, quote.slippage_bps / 10000)
        effective_price = quote.price * (1 - slippage)
        
        sell_amount = float(quote.sell_amount) / 10**18
        buy_amount = sell_amount * effective_price
        
        # Update paper balances
        sell_token = quote.sell_token.upper()
        buy_token = quote.buy_token.upper()
        
        if sell_token in self._paper_balances:
            self._paper_balances[sell_token] -= sell_amount
        if buy_token in self._paper_balances:
            self._paper_balances[buy_token] = self._paper_balances.get(buy_token, 0) + buy_amount
        
        # Simulate gas cost
        gas_used = random.randint(int(quote.gas_estimate * 0.8), quote.gas_estimate)
        gas_cost_eth = (gas_used * quote.gas_price_gwei) / 1e9
        
        return SwapResult(
            tx_hash=f"0x{hashlib.sha256(str(datetime.utcnow()).encode()).hexdigest()}",
            status="success",
            sell_amount=sell_amount,
            buy_amount=buy_amount,
            effective_price=effective_price,
            gas_used=gas_used,
            gas_cost_eth=gas_cost_eth,
            block_number=random.randint(18000000, 19000000),
            timestamp=datetime.utcnow(),
        )
    
    async def place_order(self, order: Order) -> Order:
        """
        Place a swap order through the DEX aggregator.
        
        Converts the order format to a swap and executes.
        """
        if self.paper_mode:
            # Simulate DEX execution with higher slippage
            slippage = random.uniform(0.002, 0.01)
            base_price = order.price or 3000  # ETH default
            fill_price = base_price * (1 + slippage if order.side.value == "buy" else 1 - slippage)
            
            order.status = OrderStatus.FILLED
            order.filled_size = order.size
            order.filled_price = fill_price
            order.slippage = slippage * 100
            order.venue_order_id = f"dex-{uuid4().hex[:8]}"
            order.latency_ms = random.randint(2000, 15000)  # Block confirmation time
            
            logger.info("dex_order_filled",
                       order_id=order.venue_order_id,
                       instrument=order.instrument,
                       size=order.size,
                       slippage_pct=order.slippage)
            
            return order
        
        # In production, convert to swap and execute
        # Parse instrument to get tokens (e.g., "ETH/USDC")
        tokens = order.instrument.split("/")
        if len(tokens) != 2:
            order.status = OrderStatus.REJECTED
            return order
        
        sell_token = tokens[0] if order.side.value == "sell" else tokens[1]
        buy_token = tokens[1] if order.side.value == "sell" else tokens[0]
        
        quote = await self.get_quote(sell_token, buy_token, order.size)
        if not quote:
            order.status = OrderStatus.REJECTED
            return order
        
        # Execute swap
        result = await self.execute_swap(quote, "")  # Would need wallet address
        if result and result.status == "success":
            order.status = OrderStatus.FILLED
            order.filled_size = result.buy_amount if order.side.value == "buy" else result.sell_amount
            order.filled_price = result.effective_price
            order.venue_order_id = result.tx_hash
        else:
            order.status = OrderStatus.REJECTED
        
        return order
    
    async def cancel_order(self, venue_order_id: str) -> bool:
        """
        Cancel an order - not typically possible on DEX after submission.
        """
        logger.warning("dex_cancel_not_supported", order_id=venue_order_id)
        return False  # DEX orders typically can't be cancelled once submitted
    
    async def get_balance(self) -> Dict[str, float]:
        """Get token balances."""
        if self.paper_mode:
            return self._paper_balances.copy()
        
        # In production, would query on-chain balances
        return {}
    
    async def get_positions(self) -> List[Dict]:
        """Get positions - DEX swaps are atomic, no open positions."""
        return []
    
    async def get_gas_price(self) -> Dict[str, float]:
        """Get current gas prices."""
        if self.paper_mode:
            return {
                "slow": random.uniform(15, 25),
                "standard": random.uniform(25, 40),
                "fast": random.uniform(40, 60),
                "instant": random.uniform(60, 100),
            }
        
        try:
            async with self._session.get(
                "https://api.etherscan.io/api",
                params={"module": "gastracker", "action": "gasoracle"}
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    result = data.get("result", {})
                    return {
                        "slow": float(result.get("SafeGasPrice", 20)),
                        "standard": float(result.get("ProposeGasPrice", 30)),
                        "fast": float(result.get("FastGasPrice", 50)),
                    }
        except Exception as e:
            logger.error("gas_price_fetch_error", error=str(e))
        
        return {"standard": 30.0}
    
    async def health_check(self) -> VenueHealth:
        """Check DEX aggregator health."""
        latency_ms = random.randint(500, 2000) if self.paper_mode else 0
        
        if not self.paper_mode and self._session:
            start = datetime.utcnow()
            try:
                async with self._session.get(f"{self.base_url}/swap/v1/quote", 
                    params={"sellToken": "ETH", "buyToken": "USDC", "sellAmount": "1000000000000000000"}
                ) as resp:
                    latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
            except Exception:
                pass
        
        return VenueHealth(
            venue_id=uuid4(),
            name=f"dex_{self.aggregator}",
            status=VenueStatus.HEALTHY if self._connected else VenueStatus.DOWN,
            latency_ms=latency_ms,
            error_rate=0.0,
            last_heartbeat=datetime.utcnow(),
            is_enabled=True,
        )
