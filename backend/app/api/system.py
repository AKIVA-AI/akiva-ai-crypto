"""
System Control API - Kill Switch and System Management
"""

from typing import Any, Dict

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user
from app.database import (
    activate_kill_switch,
    create_alert,
    deactivate_kill_switch,
    get_kill_switch_status,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/system", tags=["system"])


class KillSwitchRequest(BaseModel):
    """Kill switch activation request."""

    reason: str
    user_id: str | None = None


class KillSwitchResponse(BaseModel):
    """Kill switch operation response."""

    success: bool
    message: str
    status: Dict[str, Any]


@router.post("/kill-switch/activate", response_model=KillSwitchResponse)
async def activate_kill_switch_endpoint(
    request: KillSwitchRequest, current_user: Dict = Depends(get_current_user)
):
    """
    Activate the kill switch to halt all trading operations.

    Requires admin privileges.
    """
    try:
        # Check if user has admin privileges (implement your auth logic)
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin privileges required")

        success = await activate_kill_switch(
            request.reason, request.user_id or current_user.get("id")
        )

        if success:
            status = await get_kill_switch_status()
            return KillSwitchResponse(
                success=True,
                message=f"Kill switch activated: {request.reason}",
                status=status,
            )
        else:
            raise HTTPException(
                status_code=500, detail="Failed to activate kill switch"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("kill_switch_activation_api_error", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/kill-switch/deactivate", response_model=KillSwitchResponse)
async def deactivate_kill_switch_endpoint(
    current_user: Dict = Depends(get_current_user),
):
    """
    Deactivate the kill switch to resume trading operations.

    Requires admin privileges.
    """
    try:
        # Check if user has admin privileges
        if not current_user.get("is_admin", False):
            raise HTTPException(status_code=403, detail="Admin privileges required")

        success = await deactivate_kill_switch(current_user.get("id"))

        if success:
            status = await get_kill_switch_status()
            return KillSwitchResponse(
                success=True, message="Kill switch deactivated", status=status
            )
        else:
            raise HTTPException(
                status_code=500, detail="Failed to deactivate kill switch"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("kill_switch_deactivation_api_error", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/kill-switch/status")
async def get_kill_switch_status_endpoint(
    current_user: Dict = Depends(get_current_user),
):
    """
    Get the current kill switch status.

    Requires authenticated user.
    """
    try:
        status = await get_kill_switch_status()
        return {
            "kill_switch": status,
            "system_status": "operational" if not status["active"] else "halted",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("kill_switch_status_api_error", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/alert")
async def create_system_alert(
    title: str,
    message: str,
    severity: str = "info",
    current_user: Dict = Depends(get_current_user),
):
    """
    Create a system alert.

    Requires authenticated user.
    """
    try:
        await create_alert(
            title=title,
            message=message,
            severity=severity,
            source="api",
            metadata={"user_id": current_user.get("id")},
        )

        return {"message": "Alert created successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_alert_api_error", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/health")
async def system_health_check():
    """
    System health check endpoint.

    Returns overall system status.
    """
    try:
        kill_switch_status = await get_kill_switch_status()

        return {
            "status": "healthy",
            "kill_switch_active": kill_switch_status["active"],
            "timestamp": kill_switch_status["timestamp"],
            "services": {
                "api": "operational",
                "database": "operational",  # Add actual health checks
                "risk_engine": "operational",
                "execution": "operational"
                if not kill_switch_status["active"]
                else "halted",
            },
        }

    except Exception as e:
        logger.error("health_check_error", error=str(e))
        return {"status": "unhealthy", "error": str(e)}
