"""
API routes for arbitrage operations.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/arbitrage", tags=["arbitrage"])


class ArbitrageConfigRequest(BaseModel):
    """Configuration for arbitrage strategies."""

    enable_funding_rate: bool = True
    enable_cross_exchange: bool = True
    enable_statistical: bool = True
    enable_triangular: bool = True
    exchanges: List[str] = ["binance", "bybit", "coinbase"]


@router.get("/status")
async def get_arbitrage_status():
    """Get arbitrage engine status."""
    try:
        from app.arbitrage import get_arbitrage_engine

        engine = get_arbitrage_engine()
        return engine.get_status()
    except Exception as e:
        return {
            "status": "not_initialized",
            "error": str(e),
            "message": "Arbitrage engine not yet initialized",
        }


@router.get("/opportunities")
async def get_opportunities(
    strategy: Optional[str] = None, min_profit_bps: float = 0, limit: int = 50
):
    """Get current arbitrage opportunities."""
    try:
        from app.arbitrage import get_arbitrage_engine

        engine = get_arbitrage_engine()

        opportunities = engine.get_all_opportunities()

        # Filter by strategy if specified
        if strategy:
            strategy_map = {
                "funding_rate": "FundingRateOpportunity",
                "cross_exchange": "CrossExchangeOpportunity",
                "statistical": "PairsTradeOpportunity",
                "triangular": "TriangularOpportunity",
            }
            target_type = strategy_map.get(strategy)
            if target_type:
                opportunities = [
                    o for o in opportunities if type(o).__name__ == target_type
                ]

        # Convert to dict and filter by profit
        results = []
        for opp in opportunities[:limit]:
            opp_dict = {
                "type": type(opp).__name__,
                "timestamp": opp.timestamp.isoformat()
                if hasattr(opp, "timestamp")
                else None,
            }

            # Add type-specific fields
            if hasattr(opp, "symbol"):
                opp_dict["symbol"] = opp.symbol
            if hasattr(opp, "exchange"):
                opp_dict["exchange"] = opp.exchange
            if hasattr(opp, "annualized_return"):
                opp_dict["annualized_return"] = opp.annualized_return
            if hasattr(opp, "profit_bps"):
                opp_dict["profit_bps"] = opp.profit_bps
            if hasattr(opp, "expected_profit_pct"):
                opp_dict["expected_profit_pct"] = opp.expected_profit_pct
            if hasattr(opp, "confidence"):
                opp_dict["confidence"] = opp.confidence

            results.append(opp_dict)

        return {"count": len(results), "opportunities": results}
    except Exception as e:
        return {"count": 0, "opportunities": [], "error": str(e)}


@router.get("/funding-rates")
async def get_funding_rates(exchange: Optional[str] = None):
    """Get current funding rates."""
    try:
        from app.arbitrage import get_arbitrage_engine

        engine = get_arbitrage_engine()

        if engine.funding_rate:
            opportunities = engine.funding_rate.get_opportunities()
            return {
                "count": len(opportunities),
                "rates": [
                    {
                        "symbol": o.symbol,
                        "exchange": o.exchange,
                        "funding_rate": o.funding_rate,
                        "annualized_return": o.annualized_return,
                        "direction": o.direction.value,
                        "hours_until_funding": o.hours_until_funding,
                    }
                    for o in opportunities
                    if not exchange or o.exchange == exchange
                ],
            }
        return {"count": 0, "rates": []}
    except Exception as e:
        return {"count": 0, "rates": [], "error": str(e)}


@router.get("/stats")
async def get_arbitrage_stats():
    """Get aggregated arbitrage statistics."""
    try:
        from app.arbitrage import get_arbitrage_engine

        engine = get_arbitrage_engine()
        stats = engine.get_stats()

        return {
            "total_opportunities": stats.total_opportunities,
            "by_strategy": {
                "funding_rate": stats.funding_rate_opportunities,
                "cross_exchange": stats.cross_exchange_opportunities,
                "statistical": stats.statistical_opportunities,
                "triangular": stats.triangular_opportunities,
            },
            "estimated_profit_usd": stats.total_estimated_profit_usd,
            "active_positions": stats.active_positions,
            "total_pnl_usd": stats.total_pnl_usd,
        }
    except Exception as e:
        return {"total_opportunities": 0, "by_strategy": {}, "error": str(e)}


@router.post("/start")
async def start_arbitrage(config: Optional[ArbitrageConfigRequest] = None):
    """Start arbitrage engine."""
    try:
        from app.arbitrage import ArbitrageEngine

        kwargs = {}
        if config:
            kwargs = {
                "enable_funding_rate": config.enable_funding_rate,
                "enable_cross_exchange": config.enable_cross_exchange,
                "enable_statistical": config.enable_statistical,
                "enable_triangular": config.enable_triangular,
                "exchanges": config.exchanges,
            }

        engine = ArbitrageEngine.get_instance(**kwargs)
        await engine.start()

        return {"status": "started", "config": kwargs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_arbitrage():
    """Stop arbitrage engine."""
    try:
        from app.arbitrage import get_arbitrage_engine

        engine = get_arbitrage_engine()
        await engine.stop()
        return {"status": "stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
