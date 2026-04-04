"""
API routes for market data operations.
"""

from datetime import datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/market", tags=["market"])


class CandleResponse(BaseModel):
    """OHLCV candle data."""

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@router.get("/ticker/{symbol}")
async def get_ticker(symbol: str, exchange: str = "binance"):
    """Get current ticker for a symbol."""
    try:
        from app.services.market_data_service import market_data_service

        ticker = await market_data_service.get_ticker(symbol, exchange)
        return ticker
    except Exception:
        # Return mock data for demo
        return {
            "symbol": symbol,
            "exchange": exchange,
            "price": 50000.0 if "BTC" in symbol else 3000.0,
            "bid": 49990.0 if "BTC" in symbol else 2999.0,
            "ask": 50010.0 if "BTC" in symbol else 3001.0,
            "volume_24h": 1000000.0,
            "change_24h": 2.5,
            "timestamp": datetime.utcnow().isoformat(),
        }


@router.get("/candles/{symbol}")
async def get_candles(
    symbol: str,
    timeframe: str = "5m",
    limit: int = Query(default=100, le=1000),
    exchange: str = "binance",
):
    """Get OHLCV candles for a symbol."""
    try:
        from app.freqtrade.data_provider import FreqTradeDataProvider

        provider = FreqTradeDataProvider()
        df = provider.get_ohlcv(f"{symbol}/USDT", timeframe, limit)

        candles = df.to_dict(orient="records")
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "exchange": exchange,
            "count": len(candles),
            "candles": candles,
        }
    except Exception as e:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "exchange": exchange,
            "count": 0,
            "candles": [],
            "error": str(e),
        }


@router.get("/orderbook/{symbol}")
async def get_orderbook(
    symbol: str, depth: int = Query(default=20, le=100), exchange: str = "binance"
):
    """Get orderbook for a symbol."""
    try:
        from app.services.market_data_service import market_data_service

        orderbook = await market_data_service.get_orderbook(symbol, exchange, depth)
        return orderbook
    except Exception:
        # Return mock orderbook
        base_price = 50000.0 if "BTC" in symbol else 3000.0
        return {
            "symbol": symbol,
            "exchange": exchange,
            "bids": [[base_price - i * 10, 1.0 + i * 0.1] for i in range(depth)],
            "asks": [[base_price + i * 10, 1.0 + i * 0.1] for i in range(depth)],
            "timestamp": datetime.utcnow().isoformat(),
        }


@router.get("/trades/{symbol}")
async def get_recent_trades(
    symbol: str, limit: int = Query(default=50, le=500), exchange: str = "binance"
):
    """Get recent trades for a symbol."""
    try:
        from app.services.market_data_service import market_data_service

        trades = await market_data_service.get_trades(symbol, exchange, limit)
        return trades
    except Exception as e:
        return {
            "symbol": symbol,
            "exchange": exchange,
            "count": 0,
            "trades": [],
            "error": str(e),
        }


@router.get("/symbols")
async def get_available_symbols(exchange: str = "binance"):
    """Get list of available trading symbols."""
    # Common trading pairs
    symbols = [
        "BTC/USDT",
        "ETH/USDT",
        "SOL/USDT",
        "BNB/USDT",
        "XRP/USDT",
        "ADA/USDT",
        "DOGE/USDT",
        "DOT/USDT",
        "LINK/USDT",
        "AVAX/USDT",
        "MATIC/USDT",
        "UNI/USDT",
        "ATOM/USDT",
        "LTC/USDT",
        "ETC/USDT",
        "FIL/USDT",
    ]
    return {"exchange": exchange, "count": len(symbols), "symbols": symbols}


@router.get("/exchanges")
async def get_supported_exchanges():
    """Get list of supported exchanges."""
    return {
        "exchanges": [
            {
                "name": "binance",
                "status": "active",
                "features": ["spot", "futures", "margin"],
            },
            {"name": "coinbase", "status": "active", "features": ["spot"]},
            {"name": "kraken", "status": "active", "features": ["spot", "futures"]},
            {
                "name": "bybit",
                "status": "active",
                "features": ["spot", "futures", "perpetual"],
            },
            {
                "name": "okx",
                "status": "active",
                "features": ["spot", "futures", "perpetual"],
            },
        ]
    }
