"""
API routes for strategy management.

Production-ready FreqTrade strategy API.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


# Check FreqTrade availability at import time
try:
    from app.freqtrade.strategy_manager import StrategyManager, is_freqtrade_available

    FREQTRADE_AVAILABLE = is_freqtrade_available()
except ImportError:
    FREQTRADE_AVAILABLE = False


class BacktestRequest(BaseModel):
    """Backtest configuration."""

    strategy_name: str
    pair: str = "BTC/USDT"
    timeframe: str = "5m"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stake_amount: float = 100
    starting_balance: float = 10000


class StrategySignalRequest(BaseModel):
    """Request for strategy signals."""

    strategy_name: str
    pair: str
    timeframe: str = "5m"


@router.get("/status")
async def get_freqtrade_status():
    """Get FreqTrade system status."""
    return {
        "freqtrade_available": FREQTRADE_AVAILABLE,
        "message": "FreqTrade ready for production"
        if FREQTRADE_AVAILABLE
        else "FreqTrade not installed",
    }


@router.get("/")
async def list_strategies():
    """List all available FreqTrade strategies."""
    try:
        manager = StrategyManager()
        discovered = manager.discover_strategies()
        loaded = manager.load_all_strategies()

        return {
            "freqtrade_available": FREQTRADE_AVAILABLE,
            "discovered": discovered,
            "loaded": loaded,
            "strategies": manager.list_strategies(),
        }
    except Exception as e:
        return {
            "freqtrade_available": FREQTRADE_AVAILABLE,
            "discovered": [],
            "loaded": 0,
            "strategies": [],
            "error": str(e),
            "hint": "Install FreqTrade: pip install freqtrade",
        }


@router.get("/{strategy_name}")
async def get_strategy_details(strategy_name: str):
    """Get details for a specific strategy."""
    try:
        manager = StrategyManager()
        manager.load_strategy(strategy_name)
        info = manager.get_strategy_info(strategy_name)

        if not info:
            raise HTTPException(status_code=404, detail="Strategy not found")

        return {
            "name": info.name,
            "class_name": info.class_name,
            "timeframe": info.timeframe,
            "minimal_roi": info.minimal_roi,
            "stoploss": info.stoploss,
            "trailing_stop": info.trailing_stop,
            "can_short": info.can_short,
            "use_freqai": info.use_freqai,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{strategy_name}/validate")
async def validate_strategy(strategy_name: str):
    """Validate a strategy for production readiness."""
    try:
        manager = StrategyManager()
        if not manager.load_strategy(strategy_name):
            raise HTTPException(
                status_code=404, detail="Strategy not found or failed to load"
            )

        validation = manager.validate_strategy(strategy_name)

        return {
            "strategy_name": strategy_name,
            "production_ready": validation["valid"] and not validation["warnings"],
            "validation": validation,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backtest")
async def run_backtest(request: BacktestRequest):
    """Run backtest for a strategy."""
    try:
        from app.freqtrade.backtester import BacktestConfig, Backtester
        from app.freqtrade.data_provider import FreqTradeDataProvider
        from app.freqtrade.strategy_manager import StrategyManager

        # Load strategy
        manager = StrategyManager()
        if not manager.load_strategy(request.strategy_name):
            raise HTTPException(status_code=404, detail="Strategy not found")

        strategy = manager.get_strategy(request.strategy_name)

        # Get data
        provider = FreqTradeDataProvider()
        data = provider.get_ohlcv(request.pair, request.timeframe, limit=500)

        # Run backtest
        config = BacktestConfig(
            timeframe=request.timeframe,
            stake_amount=request.stake_amount,
            starting_balance=request.starting_balance,
        )
        backtester = Backtester(config)
        result = backtester.run_backtest(
            strategy, data, request.pair, request.strategy_name
        )

        return {
            "strategy": result.strategy_name,
            "pair": request.pair,
            "timeframe": result.timeframe,
            "period": {
                "start": result.start_date.isoformat(),
                "end": result.end_date.isoformat(),
            },
            "performance": {
                "starting_balance": result.starting_balance,
                "final_balance": result.final_balance,
                "total_profit_pct": round(result.total_profit_pct, 2),
                "total_trades": result.total_trades,
                "winning_trades": result.winning_trades,
                "losing_trades": result.losing_trades,
                "win_rate": round(result.win_rate, 2),
                "avg_profit_per_trade": round(result.avg_profit_per_trade, 2),
                "best_trade_pct": round(result.best_trade_pct, 2),
                "worst_trade_pct": round(result.worst_trade_pct, 2),
                "max_drawdown_pct": round(result.max_drawdown_pct, 2),
                "sharpe_ratio": round(result.sharpe_ratio, 2),
                "profit_factor": round(result.profit_factor, 2)
                if result.profit_factor != float("inf")
                else "∞",
            },
            "trades_count": len(result.trades),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/signal")
async def get_strategy_signal(request: StrategySignalRequest):
    """Get current signal from a strategy."""
    try:
        from app.freqtrade.data_provider import FreqTradeDataProvider
        from app.freqtrade.strategy_manager import StrategyManager

        # Load strategy
        manager = StrategyManager()
        if not manager.load_strategy(request.strategy_name):
            raise HTTPException(status_code=404, detail="Strategy not found")

        strategy = manager.get_strategy(request.strategy_name)

        # Get data
        provider = FreqTradeDataProvider()
        data = provider.get_ohlcv(request.pair, request.timeframe, limit=200)

        # Run strategy
        df = strategy.populate_indicators(data.copy(), {"pair": request.pair})
        df = strategy.populate_entry_trend(df, {"pair": request.pair})
        df = strategy.populate_exit_trend(df, {"pair": request.pair})

        # Get last row
        last = df.iloc[-1]

        signal = "neutral"
        if last.get("enter_long", 0) == 1:
            signal = "buy"
        elif last.get("exit_long", 0) == 1:
            signal = "sell"

        return {
            "strategy": request.strategy_name,
            "pair": request.pair,
            "timeframe": request.timeframe,
            "signal": signal,
            "price": float(last["close"]),
            "indicators": {
                "rsi": float(last.get("rsi", 0)),
                "ema_fast": float(last.get("ema_fast", 0)),
                "ema_slow": float(last.get("ema_slow", 0)),
            },
            "timestamp": last["date"].isoformat()
            if hasattr(last["date"], "isoformat")
            else str(last["date"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
