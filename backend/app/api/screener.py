"""
Strategy Screener API Endpoints

Provides endpoints for:
- Running strategy scans
- Getting opportunity rankings
- Deploying opportunities to trading
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.services.strategy_screener import Exchange, ScreenerConfig, strategy_screener

router = APIRouter(prefix="/screener", tags=["screener"])


class ScanRequest(BaseModel):
    """Request to run a strategy scan."""

    strategies: Optional[List[str]] = None
    exchanges: Optional[List[str]] = None
    timeframes: Optional[List[str]] = None
    lookback_days: int = 30
    min_win_rate: float = 50.0
    min_sharpe: float = 0.5
    max_drawdown: float = 20.0
    top_n: int = 20


class DeployRequest(BaseModel):
    """Request to deploy an opportunity."""

    opportunity_id: str
    mode: str = "paper"  # paper or live
    max_position_size: float = 0.1
    max_leverage: float = 2.0


@router.get("/")
async def get_screener_status():
    """Get current screener status and cached opportunities."""
    return strategy_screener.to_dict()


@router.post("/scan")
async def run_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    Run a strategy scan across all coins.
    Returns immediately with scan ID, results available via GET /screener
    """
    # Build config from request
    config = ScreenerConfig(
        strategies=request.strategies or ["WhaleFlowScalper", "HighWinRateScalper"],
        exchanges=[Exchange(e) for e in (request.exchanges or ["coinbase_futures"])],
        timeframes=request.timeframes or ["2h"],
        lookback_days=request.lookback_days,
        min_win_rate=request.min_win_rate,
        min_sharpe=request.min_sharpe,
        max_drawdown=request.max_drawdown,
        top_n=request.top_n,
    )

    # Update screener config
    strategy_screener.config = config

    # Run scan (for now synchronously, could be background task)
    opportunities = await strategy_screener.scan()

    return {
        "status": "completed",
        "scan_time": datetime.utcnow().isoformat(),
        "total_opportunities": len(opportunities),
        "top_opportunities": [
            {
                "rank": o.rank,
                "strategy": o.strategy,
                "pair": o.pair,
                "score": o.score,
                "win_rate": o.win_rate,
                "sharpe": o.sharpe_ratio,
            }
            for o in opportunities[:10]
        ],
    }


@router.get("/opportunities")
async def get_opportunities(
    strategy: Optional[str] = None,
    exchange: Optional[str] = None,
    min_score: float = 0,
):
    """Get filtered list of opportunities."""
    opps = strategy_screener.get_opportunities()

    # Apply filters
    if strategy:
        opps = [o for o in opps if o.strategy == strategy]
    if exchange:
        opps = [o for o in opps if o.exchange.value == exchange]
    if min_score > 0:
        opps = [o for o in opps if o.score >= min_score]

    return {
        "count": len(opps),
        "opportunities": [
            {
                "id": o.id,
                "rank": o.rank,
                "strategy": o.strategy,
                "pair": o.pair,
                "exchange": o.exchange.value,
                "timeframe": o.timeframe,
                "score": o.score,
                "win_rate": o.win_rate,
                "sharpe_ratio": o.sharpe_ratio,
                "max_drawdown": o.max_drawdown,
                "profit_factor": o.profit_factor,
                "total_trades": o.total_trades,
            }
            for o in opps
        ],
    }


@router.get("/opportunities/{opportunity_id}")
async def get_opportunity(opportunity_id: str):
    """Get details for a specific opportunity."""
    opp = strategy_screener.get_opportunity_by_id(opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    return {
        "id": opp.id,
        "strategy": opp.strategy,
        "pair": opp.pair,
        "exchange": opp.exchange.value,
        "timeframe": opp.timeframe,
        "score": opp.score,
        "rank": opp.rank,
        "metrics": {
            "win_rate": opp.win_rate,
            "sharpe_ratio": opp.sharpe_ratio,
            "max_drawdown": opp.max_drawdown,
            "profit_factor": opp.profit_factor,
            "total_trades": opp.total_trades,
            "avg_trade_pnl": opp.avg_trade_pnl,
        },
        "last_scanned": opp.last_scanned.isoformat(),
        "is_active": opp.is_active,
    }


@router.post("/deploy")
async def deploy_opportunity(request: DeployRequest):
    """Deploy an opportunity to paper or live trading."""
    opp = strategy_screener.get_opportunity_by_id(request.opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    # TODO: Actually deploy to FreqTrade bot
    # For now, return deployment plan
    return {
        "status": "planned",
        "opportunity_id": opp.id,
        "deployment": {
            "strategy": opp.strategy,
            "pair": opp.pair,
            "exchange": opp.exchange.value,
            "mode": request.mode,
            "max_position_size": request.max_position_size,
            "max_leverage": request.max_leverage,
        },
        "message": f"Ready to deploy {opp.strategy} on {opp.pair}. Use run_multi_strategy.py to start.",
    }
