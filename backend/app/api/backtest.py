import asyncio
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.schemas.backtest_schemas import (
    BacktestDetailResponse,
    BacktestRequest,
    BacktestSummaryResponse,
    EquityCurveResponse,
    EquityPointResponse,
    ErrorResponse,
    PerformanceMetricsResponse,
    TradeResponse,
    TradesResponse,
)
from app.models.backtest_result import BacktestResult, PerformanceMetrics
from app.services.cache import TTLCache
from app.services.institutional_backtester import (
    BacktestConfig,
    InstitutionalBacktester,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backtest", tags=["backtest"])

# In-memory storage for demo (replace with database in production)
_backtest_results: dict[str, BacktestResult] = {}
_market_data_cache = TTLCache(max_size=128)


def _metrics_to_response(metrics: PerformanceMetrics) -> PerformanceMetricsResponse:
    """Convert PerformanceMetrics model to response schema."""
    return PerformanceMetricsResponse(
        total_return=metrics.total_return,
        annualized_return=metrics.annualized_return,
        sharpe_ratio=metrics.sharpe_ratio,
        sortino_ratio=metrics.sortino_ratio,
        calmar_ratio=metrics.calmar_ratio,
        max_drawdown=metrics.max_drawdown,
        max_drawdown_duration_days=metrics.max_drawdown_duration_days,
        total_trades=metrics.total_trades,
        winning_trades=metrics.winning_trades,
        losing_trades=metrics.losing_trades,
        win_rate=metrics.win_rate,
        profit_factor=metrics.profit_factor,
        avg_win=metrics.avg_win,
        avg_loss=metrics.avg_loss,
        volatility=metrics.volatility,
        var_95=metrics.var_95,
        cvar_95=metrics.cvar_95,
    )


def _get_strategy_class(strategy_name: str):
    """
    Load strategy class by name.

    In production, this would load from the strategy registry.
    For now, returns a mock strategy.
    """

    class MockStrategy:
        def populate_indicators(self, dataframe, metadata):
            return dataframe

        def populate_entry_trend(self, dataframe, metadata):
            dataframe["enter_long"] = 0
            dataframe["enter_short"] = 0
            dataframe.loc[dataframe.index % 20 == 0, "enter_long"] = 1
            return dataframe

        def populate_exit_trend(self, dataframe, metadata):
            dataframe["exit_long"] = 0
            dataframe["exit_short"] = 0
            for i in range(len(dataframe)):
                if i >= 10 and dataframe.iloc[i - 10].get("enter_long", 0) == 1:
                    dataframe.loc[dataframe.index[i], "exit_long"] = 1
            return dataframe

    return MockStrategy()


async def _fetch_market_data(
    instruments: List[str],
    start_date: datetime,
    end_date: datetime,
    timeframe: str,
):
    """
    Fetch historical market data.

    In production, this would fetch from database or exchange.
    For now, generates mock data.
    """
    import numpy as np
    import pandas as pd

    cache_key = f"{','.join(instruments)}:{start_date.isoformat()}:{end_date.isoformat()}:{timeframe}"
    # Cache synthetic data to avoid recomputing for identical requests.
    cached = _market_data_cache.get(cache_key)
    if cached is not None:
        return cached

    def _build_dataframe() -> pd.DataFrame:
        if timeframe == "1h":
            periods = int((end_date - start_date).total_seconds() / 3600)
        elif timeframe == "4h":
            periods = int((end_date - start_date).total_seconds() / 14400)
        elif timeframe == "1d":
            periods = int((end_date - start_date).total_seconds() / 86400)
        else:
            periods = 500

        periods = min(periods, 5000)
        if periods <= 1:
            return pd.DataFrame()

        np.random.seed(42)
        dates = pd.date_range(start=start_date, periods=periods, freq=timeframe)
        price = 50000 + np.cumsum(np.random.randn(periods) * 100)

        return pd.DataFrame(
            {
                "date": dates,
                "open": price,
                "high": price * 1.005,
                "low": price * 0.995,
                "close": price,
                "volume": np.random.uniform(100, 1000, periods),
            }
        )

    data = await asyncio.to_thread(_build_dataframe)
    _market_data_cache.set(cache_key, data, ttl_seconds=60)
    return data


@router.post(
    "/run",
    response_model=BacktestSummaryResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        404: {"model": ErrorResponse, "description": "Strategy not found"},
        500: {"model": ErrorResponse, "description": "Backtest failed"},
    },
    summary="Run a backtest",
    description="Execute a backtest for the specified strategy and return summary results.",
)
async def run_backtest(request: BacktestRequest):
    """
    Run a backtest for the specified strategy.

    Returns a summary of results. Use /backtest/{id} for full details.
    """
    try:
        logger.info(
            "Starting backtest: %s on %s", request.strategy_name, request.instruments
        )

        # 1. Load strategy
        strategy = _get_strategy_class(request.strategy_name)
        if strategy is None:
            raise HTTPException(
                status_code=404,
                detail=f"Strategy '{request.strategy_name}' not found",
            )

        # 2. Fetch market data
        data = await _fetch_market_data(
            request.instruments,
            request.start_date,
            request.end_date,
            request.timeframe,
        )

        if data.empty:
            raise HTTPException(
                status_code=400,
                detail="No market data available for specified date range",
            )

        # 3. Configure backtester
        config = BacktestConfig(
            strategy_name=request.strategy_name,
            instruments=request.instruments,
            start_date=request.start_date,
            end_date=request.end_date,
            initial_capital=request.initial_capital,
            timeframe=request.timeframe,
            slippage_bps=request.slippage_bps,
            commission_bps=request.commission_bps,
        )

        # 4. Run backtest
        backtester = InstitutionalBacktester(config)
        result = await asyncio.to_thread(backtester.run_backtest, strategy, data)

        # 5. Store result
        result_id = str(result.id)
        _backtest_results[result_id] = result

        logger.info("Backtest complete: %s, %s trades", result_id, len(result.trades))

        # 6. Return summary
        return BacktestSummaryResponse(
            id=result_id,
            strategy_name=result.strategy_name,
            status="completed",
            start_date=result.start_date,
            end_date=result.end_date,
            created_at=result.created_at,
            execution_time_seconds=result.execution_time_seconds,
            initial_capital=result.initial_capital,
            final_equity=result.final_equity,
            total_return=result.metrics.total_return if result.metrics else 0.0,
            total_trades=len(result.trades),
            sharpe_ratio=result.metrics.sharpe_ratio if result.metrics else 0.0,
            max_drawdown=result.metrics.max_drawdown if result.metrics else 0.0,
            win_rate=result.metrics.win_rate if result.metrics else 0.0,
            has_in_sample=result.in_sample_metrics is not None,
            has_out_sample=result.out_sample_metrics is not None,
        )

    except HTTPException:
        raise
    except ValueError as exc:
        logger.error("Validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Backtest failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(exc)}")


@router.get(
    "/{backtest_id}/equity-curve",
    response_model=EquityCurveResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get equity curve",
    description="Retrieve equity curve data for charting.",
)
async def get_equity_curve(
    backtest_id: str,
    sample_rate: int = Query(
        default=1, ge=1, le=100, description="Sample every Nth point"
    ),
):
    """Get equity curve data for visualization."""
    if backtest_id not in _backtest_results:
        raise HTTPException(
            status_code=404,
            detail=f"Backtest '{backtest_id}' not found",
        )

    result = _backtest_results[backtest_id]
    sampled_curve = result.equity_curve[::sample_rate]

    return EquityCurveResponse(
        backtest_id=backtest_id,
        strategy_name=result.strategy_name,
        data=[
            EquityPointResponse(
                timestamp=ep.timestamp,
                equity=ep.equity,
                drawdown=ep.drawdown,
                position_value=ep.position_value,
                cash=ep.cash,
            )
            for ep in sampled_curve
        ],
    )


@router.get(
    "/{backtest_id}/trades",
    response_model=TradesResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get trades",
    description="Retrieve list of trades from backtest.",
)
async def get_trades(
    backtest_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """Get trades from backtest with pagination."""
    if backtest_id not in _backtest_results:
        raise HTTPException(
            status_code=404,
            detail=f"Backtest '{backtest_id}' not found",
        )

    result = _backtest_results[backtest_id]
    trades_slice = result.trades[offset : offset + limit]

    return TradesResponse(
        backtest_id=backtest_id,
        strategy_name=result.strategy_name,
        total_trades=len(result.trades),
        trades=[
            TradeResponse(
                id=str(t.id),
                timestamp_open=t.timestamp_open,
                timestamp_close=t.timestamp_close,
                instrument=t.instrument,
                side=t.side,
                size=t.size,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                pnl=t.pnl,
                pnl_percent=t.pnl_percent,
                fees=t.fees,
            )
            for t in trades_slice
        ],
    )


@router.get(
    "/list",
    response_model=List[BacktestSummaryResponse],
    summary="List backtests",
    description="List all completed backtests.",
)
async def list_backtests(
    strategy_name: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    """List recent backtests, optionally filtered by strategy."""
    results = list(_backtest_results.values())

    if strategy_name:
        results = [r for r in results if r.strategy_name == strategy_name]

    results.sort(key=lambda r: r.created_at, reverse=True)
    results = results[:limit]

    return [
        BacktestSummaryResponse(
            id=str(r.id),
            strategy_name=r.strategy_name,
            status="completed",
            start_date=r.start_date,
            end_date=r.end_date,
            created_at=r.created_at,
            execution_time_seconds=r.execution_time_seconds,
            initial_capital=r.initial_capital,
            final_equity=r.final_equity,
            total_return=r.metrics.total_return if r.metrics else 0.0,
            total_trades=len(r.trades),
            sharpe_ratio=r.metrics.sharpe_ratio if r.metrics else 0.0,
            max_drawdown=r.metrics.max_drawdown if r.metrics else 0.0,
            win_rate=r.metrics.win_rate if r.metrics else 0.0,
            has_in_sample=r.in_sample_metrics is not None,
            has_out_sample=r.out_sample_metrics is not None,
        )
        for r in results
    ]


@router.get(
    "/{backtest_id}",
    response_model=BacktestDetailResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get backtest details",
    description="Retrieve full details of a completed backtest.",
)
async def get_backtest_result(backtest_id: str):
    """Get full backtest result by ID."""
    if backtest_id not in _backtest_results:
        raise HTTPException(
            status_code=404,
            detail=f"Backtest '{backtest_id}' not found",
        )

    result = _backtest_results[backtest_id]

    return BacktestDetailResponse(
        id=str(result.id),
        strategy_name=result.strategy_name,
        strategy_config=result.strategy_config,
        status="completed",
        instruments=result.instruments,
        timeframe=result.timeframe,
        start_date=result.start_date,
        end_date=result.end_date,
        initial_capital=result.initial_capital,
        final_equity=result.final_equity,
        metrics=_metrics_to_response(result.metrics),
        in_sample_metrics=(
            _metrics_to_response(result.in_sample_metrics)
            if result.in_sample_metrics
            else None
        ),
        out_sample_metrics=(
            _metrics_to_response(result.out_sample_metrics)
            if result.out_sample_metrics
            else None
        ),
        validation_metrics=(
            _metrics_to_response(result.validation_metrics)
            if result.validation_metrics
            else None
        ),
        created_at=result.created_at,
        execution_time_seconds=result.execution_time_seconds,
    )


@router.delete(
    "/{backtest_id}",
    status_code=204,
    responses={404: {"model": ErrorResponse}},
    summary="Delete backtest",
    description="Delete a backtest result.",
)
async def delete_backtest(backtest_id: str):
    """Delete a backtest result."""
    if backtest_id not in _backtest_results:
        raise HTTPException(
            status_code=404,
            detail=f"Backtest '{backtest_id}' not found",
        )

    del _backtest_results[backtest_id]
    return None
