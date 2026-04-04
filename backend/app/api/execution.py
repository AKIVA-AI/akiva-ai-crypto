import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.strategy_registry import strategy_registry
from app.database import get_supabase
from app.services.cache import TTLCache
from app.services.institutional_backtester import BacktestConfig
from app.services.walk_forward_engine import WalkForwardConfig, WalkForwardEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/execution", tags=["execution"])
_market_data_cache = TTLCache(max_size=128)


class StrategyRegisterRequest(BaseModel):
    """Request body for registering a strategy."""

    name: str = Field(..., description="Strategy name")
    description: str = Field(default="", description="Strategy description")
    parameters: Dict[str, Any] = Field(
        default_factory=dict, description="Parameter definitions"
    )


class StrategyResponse(BaseModel):
    """Strategy metadata response."""

    name: str
    description: str
    parameters: Dict[str, Any]


class WalkForwardRequest(BaseModel):
    """Request body for walk-forward analysis."""

    strategy_name: str
    instruments: List[str]
    start_date: datetime
    end_date: datetime
    timeframe: str = "1h"
    initial_capital: float = 100000.0
    train_window: int = 200
    test_window: int = 100
    step_size: int = 100


class WalkForwardResponse(BaseModel):
    """Walk-forward response summary."""

    strategy_name: str
    total_windows: int
    aggregate_metrics: Optional[Dict[str, Any]]


def _metrics_to_dict(metrics) -> Optional[Dict[str, Any]]:
    if metrics is None:
        return None
    return metrics.to_dict()


def _get_strategy_instance(strategy_name: str):
    registered = strategy_registry.get_strategy(strategy_name)
    if not registered:
        return None
    if registered.strategy_class is None:
        return None
    return registered.strategy_class()


async def _fetch_market_data(
    instruments: List[str],
    start_date: datetime,
    end_date: datetime,
    timeframe: str,
):
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
    "/strategies",
    response_model=StrategyResponse,
    summary="Register strategy",
    description="Register a strategy in the execution engine registry.",
)
async def register_strategy(request: StrategyRegisterRequest):
    """Register a new strategy."""

    class RegisteredStrategy:
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

    try:
        definition = strategy_registry.register_strategy(
            strategy_class=RegisteredStrategy,
            name=request.name,
            description=request.description,
            parameters=request.parameters,
            overwrite=True,
        )
        return StrategyResponse(
            name=definition.name,
            description=definition.description,
            parameters=definition.parameters,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get(
    "/strategies",
    response_model=List[StrategyResponse],
    summary="List strategies",
    description="List all registered strategies.",
)
async def list_strategies():
    """List registered strategies."""
    strategies = strategy_registry.list_strategies(
        include_config=False, include_runtime=True
    )
    return [
        StrategyResponse(
            name=meta.name,
            description=meta.description,
            parameters=meta.parameters,
        )
        for meta in strategies
    ]


@router.post(
    "/walk-forward",
    response_model=WalkForwardResponse,
    summary="Run walk-forward analysis",
    description="Execute walk-forward backtests across rolling windows.",
)
async def run_walk_forward(request: WalkForwardRequest):
    """Run walk-forward analysis for a registered strategy."""
    strategy = _get_strategy_instance(request.strategy_name)
    if strategy is None:
        raise HTTPException(
            status_code=404,
            detail=f"Strategy '{request.strategy_name}' not found",
        )

    data = await _fetch_market_data(
        request.instruments,
        request.start_date,
        request.end_date,
        request.timeframe,
    )
    if data.empty:
        raise HTTPException(
            status_code=400, detail="No market data for requested window"
        )

    engine = WalkForwardEngine(
        WalkForwardConfig(
            train_window=request.train_window,
            test_window=request.test_window,
            step_size=request.step_size,
            initial_capital=request.initial_capital,
            timeframe=request.timeframe,
        )
    )

    base_config = BacktestConfig(
        strategy_name=request.strategy_name,
        instruments=request.instruments,
        start_date=request.start_date,
        end_date=request.end_date,
        initial_capital=request.initial_capital,
        timeframe=request.timeframe,
    )

    result = await asyncio.to_thread(engine.run, strategy, data, base_config)

    _persist_walk_forward_result(
        strategy_name=request.strategy_name,
        instruments=request.instruments,
        start_date=request.start_date,
        end_date=request.end_date,
        timeframe=request.timeframe,
        initial_capital=request.initial_capital,
        total_windows=result.total_windows,
        aggregate_metrics=_metrics_to_dict(result.aggregate_metrics),
    )

    return WalkForwardResponse(
        strategy_name=request.strategy_name,
        total_windows=result.total_windows,
        aggregate_metrics=_metrics_to_dict(result.aggregate_metrics),
    )


def _persist_walk_forward_result(
    strategy_name: str,
    instruments: List[str],
    start_date: datetime,
    end_date: datetime,
    timeframe: str,
    initial_capital: float,
    total_windows: int,
    aggregate_metrics: Optional[Dict[str, Any]],
) -> None:
    try:
        supabase = get_supabase()
        supabase.table("walk_forward_results").insert(
            {
                "strategy_name": strategy_name,
                "instruments": instruments,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "timeframe": timeframe,
                "initial_capital": initial_capital,
                "total_windows": total_windows,
                "aggregate_metrics": aggregate_metrics,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("walk_forward_persist_failed: %s", exc)
