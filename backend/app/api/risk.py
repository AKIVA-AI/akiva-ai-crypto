"""
API routes for risk management.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.database import get_supabase
from app.services.advanced_risk_engine import advanced_risk_engine
from app.services.risk_engine import risk_engine

router = APIRouter(prefix="/api/risk", tags=["risk"])


class KillSwitchRequest(BaseModel):
    book_id: Optional[str] = None
    activate: bool = True
    reason: str = "Manual activation"


class CircuitBreakerRequest(BaseModel):
    breaker_type: str
    activate: bool
    reason: Optional[str] = None


@router.get("/limits")
async def get_risk_limits(book_id: Optional[str] = None):
    """Get risk limits, optionally for a specific book."""
    supabase = get_supabase()
    query = supabase.table("risk_limits").select("*, books(name)")

    if book_id:
        query = query.eq("book_id", book_id)

    result = query.execute()
    return result.data


@router.get("/breaches")
async def get_risk_breaches(
    book_id: Optional[str] = None, is_resolved: Optional[bool] = None, limit: int = 100
):
    """Get risk breaches with optional filters."""
    supabase = get_supabase()
    query = supabase.table("risk_breaches").select("*, books(name)")

    if book_id:
        query = query.eq("book_id", book_id)
    if is_resolved is not None:
        query = query.eq("is_resolved", is_resolved)

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/circuit-breakers")
async def get_circuit_breakers():
    """Get all circuit breaker events."""
    supabase = get_supabase()
    result = (
        supabase.table("circuit_breaker_events")
        .select("*, books(name)")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data


@router.get("/circuit-breakers/status")
async def get_circuit_breaker_status():
    """Get current circuit breaker status."""
    return {"breakers": risk_engine._circuit_breakers, "timestamp": "now"}


@router.post("/kill-switch")
async def activate_kill_switch(req: KillSwitchRequest, x_user_id: str = Header(None)):
    """Activate kill switch (global or per-book)."""
    book_id = UUID(req.book_id) if req.book_id else None

    await risk_engine.activate_kill_switch(
        book_id=book_id, user_id=x_user_id, reason=req.reason
    )

    return {"success": True, "book_id": req.book_id, "global": req.book_id is None}


@router.post("/circuit-breaker")
async def manage_circuit_breaker(
    req: CircuitBreakerRequest, x_user_id: str = Header(None)
):
    """Activate or deactivate a circuit breaker."""
    if req.activate:
        await risk_engine.activate_circuit_breaker(
            breaker_type=req.breaker_type, reason=req.reason or "Manual activation"
        )
    else:
        await risk_engine.deactivate_circuit_breaker(req.breaker_type)

    return {"success": True, "breaker_type": req.breaker_type, "active": req.activate}


@router.get("/global-settings")
async def get_global_settings():
    """Get global risk settings."""
    supabase = get_supabase()
    result = supabase.table("global_settings").select("*").limit(1).execute()
    return result.data[0] if result.data else {}


# Advanced Risk Management Endpoints


@router.get("/var/{book_id}")
async def calculate_portfolio_var(
    book_id: str,
    method: str = "historical",
    confidence_levels: Optional[str] = None,
    lookback_days: Optional[int] = None,
):
    """Calculate Value at Risk for a trading book."""
    try:
        book_uuid = UUID(book_id)
        conf_levels = (
            [float(x.strip()) for x in confidence_levels.split(",")]
            if confidence_levels
            else None
        )

        result = await advanced_risk_engine.calculate_portfolio_var(
            book_id=book_uuid,
            method=method,
            confidence_levels=conf_levels,
            lookback_days=lookback_days,
        )

        return {
            "book_id": book_id,
            "var_95": result.var_95,
            "var_99": result.var_99,
            "var_999": result.var_999,
            "expected_shortfall_95": result.expected_shortfall_95,
            "expected_shortfall_99": result.expected_shortfall_99,
            "method": result.method,
            "confidence_levels": result.confidence_levels,
            "calculation_date": result.calculation_date.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VaR calculation failed: {str(e)}")


@router.post("/optimize/{book_id}")
async def optimize_portfolio(
    book_id: str,
    target_return: Optional[float] = None,
    max_volatility: Optional[float] = None,
    constraints: Optional[dict] = None,
):
    """Optimize portfolio using Modern Portfolio Theory."""
    try:
        book_uuid = UUID(book_id)

        result = await advanced_risk_engine.optimize_portfolio(
            book_id=book_uuid,
            target_return=target_return,
            max_volatility=max_volatility,
            constraints=constraints,
        )

        return {
            "book_id": book_id,
            "optimal_weights": result.optimal_weights,
            "expected_return": result.expected_return,
            "expected_volatility": result.expected_volatility,
            "sharpe_ratio": result.sharpe_ratio,
            "optimization_method": result.optimization_method,
            "constraints_satisfied": result.constraints_satisfied,
            "calculation_date": result.calculation_date.isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Portfolio optimization failed: {str(e)}"
        )


@router.get("/stress-test/{book_id}")
async def run_stress_tests(book_id: str, scenarios: Optional[str] = None):
    """Run comprehensive stress tests on the portfolio."""
    try:
        book_uuid = UUID(book_id)
        scenario_list = scenarios.split(",") if scenarios else None

        results = await advanced_risk_engine.run_stress_tests(
            book_id=book_uuid, scenarios=scenario_list
        )

        return {
            "book_id": book_id,
            "stress_tests": [
                {
                    "scenario_name": r.scenario_name,
                    "portfolio_return": r.portfolio_return,
                    "max_drawdown": r.max_drawdown,
                    "var_breached": r.var_breached,
                    "liquidity_impact": r.liquidity_impact,
                    "recovery_time_days": r.recovery_time_days,
                    "risk_metrics": r.risk_metrics,
                }
                for r in results
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stress testing failed: {str(e)}")


@router.get("/risk-attribution/{book_id}")
async def calculate_risk_attribution(book_id: str, method: str = "factor_model"):
    """Calculate risk attribution using factor models."""
    try:
        book_uuid = UUID(book_id)

        result = await advanced_risk_engine.calculate_risk_attribution(
            book_id=book_uuid, attribution_method=method
        )

        return {
            "book_id": book_id,
            "total_risk": result.total_risk,
            "systematic_risk": result.systematic_risk,
            "idiosyncratic_risk": result.idiosyncratic_risk,
            "asset_contributions": result.asset_contributions,
            "factor_contributions": result.factor_contributions,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Risk attribution failed: {str(e)}"
        )


@router.get("/liquidity-var/{book_id}")
async def calculate_liquidity_adjusted_var(book_id: str, time_horizon_days: int = 1):
    """Calculate Liquidity-Adjusted Value at Risk."""
    try:
        book_uuid = UUID(book_id)

        lvar = await advanced_risk_engine.calculate_liquidity_adjusted_var(
            book_id=book_uuid, time_horizon_days=time_horizon_days
        )

        return {
            "book_id": book_id,
            "liquidity_adjusted_var": lvar,
            "time_horizon_days": time_horizon_days,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Liquidity VaR calculation failed: {str(e)}"
        )


@router.get("/counterparty-risk/{book_id}")
async def assess_counterparty_risk(book_id: str):
    """Assess counterparty risk across all venues."""
    try:
        book_uuid = UUID(book_id)

        risk_assessment = await advanced_risk_engine.assess_counterparty_risk(
            book_id=book_uuid
        )

        return {"book_id": book_id, "counterparty_risks": risk_assessment}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Counterparty risk assessment failed: {str(e)}"
        )


@router.get("/risk-metrics/{book_id}")
async def get_comprehensive_risk_metrics(book_id: str):
    """Get comprehensive risk metrics dashboard for a book."""
    try:
        book_uuid = UUID(book_id)

        # Calculate multiple risk metrics in parallel
        var_result = await advanced_risk_engine.calculate_portfolio_var(book_uuid)
        stress_results = await advanced_risk_engine.run_stress_tests(book_uuid)
        attribution = await advanced_risk_engine.calculate_risk_attribution(book_uuid)
        lvar = await advanced_risk_engine.calculate_liquidity_adjusted_var(book_uuid)
        counterparty_risk = await advanced_risk_engine.assess_counterparty_risk(
            book_uuid
        )

        return {
            "book_id": book_id,
            "value_at_risk": {
                "var_95": var_result.var_95,
                "var_99": var_result.var_99,
                "var_999": var_result.var_999,
                "method": var_result.method,
            },
            "stress_testing": [
                {
                    "scenario": r.scenario_name,
                    "return": r.portfolio_return,
                    "breached": r.var_breached,
                }
                for r in stress_results
            ],
            "risk_attribution": {
                "total_risk": attribution.total_risk,
                "systematic_pct": (attribution.systematic_risk / attribution.total_risk)
                * 100,
                "idiosyncratic_pct": (
                    attribution.idiosyncratic_risk / attribution.total_risk
                )
                * 100,
            },
            "liquidity_adjusted_var": lvar,
            "counterparty_exposure": counterparty_risk,
            "generated_at": "now",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Risk metrics calculation failed: {str(e)}"
        )
