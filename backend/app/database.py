"""
Database connection and utilities for Supabase.
Kill switch state is now persisted to global_settings for cluster safety.
"""
import structlog
from datetime import datetime
from supabase import create_client, Client
from app.config import settings

logger = structlog.get_logger()

_supabase_client: Client | None = None
_db_initialized: bool = False


async def init_db():
    """
    Initialize the database connection.
    Creates Supabase client and validates connection.
    """
    global _db_initialized
    
    try:
        # Get or create the client
        client = get_supabase()
        
        # Validate connection with a simple query
        result = client.table("global_settings").select("id").limit(1).execute()
        
        _db_initialized = True
        logger.info("database_initialized", status="connected")
        
    except Exception as e:
        logger.error("database_initialization_failed", error=str(e))
        raise


async def close_db():
    """
    Close the database connection.
    Cleans up resources on shutdown.
    """
    global _supabase_client, _db_initialized
    
    try:
        # Supabase client doesn't require explicit closing
        # but we reset state for clean restarts
        _supabase_client = None
        _db_initialized = False
        
        logger.info("database_closed")
        
    except Exception as e:
        logger.error("database_close_failed", error=str(e))


def get_supabase() -> Client:
    """Get or create Supabase client."""
    global _supabase_client
    
    if _supabase_client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise ValueError("Supabase URL and service role key are required")

        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
        logger.info("supabase_client_initialized", url=settings.supabase_url)
    
    return _supabase_client


async def audit_log(
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    before_state: dict | None = None,
    after_state: dict | None = None,
    severity: str = "info",
    book_id: str | None = None,
    ip_address: str | None = None
):
    """Log an audit event to the database asynchronously."""
    try:
        supabase = get_supabase()
        # Use async execute for non-blocking operation
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: supabase.table("audit_events").insert({
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "user_id": user_id,
            "user_email": user_email,
            "before_state": before_state,
            "after_state": after_state,
            "severity": severity,
            "book_id": book_id,
            "ip_address": ip_address
        }).execute())

        logger.info(
            "audit_event_logged",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id
        )
    except Exception as e:
        logger.error("audit_log_failed", error=str(e), action=action)


async def create_alert(
    title: str,
    message: str,
    severity: str = "info",
    source: str = "system",
    metadata: dict | None = None
):
    """Create an alert in the database."""
    try:
        supabase = get_supabase()
        supabase.table("alerts").insert({
            "title": title,
            "message": message,
            "severity": severity,
            "source": source,
            "metadata": metadata or {}
        }).execute()
        
        logger.info(
            "alert_created",
            title=title,
            severity=severity,
            source=source
        )
    except Exception as e:
        logger.error("alert_creation_failed", error=str(e), title=title)


# ============================================================================
# Kill Switch Implementation - Persisted to Supabase global_settings
# ============================================================================

def _get_global_settings_id() -> str | None:
    """Get the ID of the global_settings row."""
    try:
        supabase = get_supabase()
        result = supabase.table("global_settings").select("id").limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]["id"]
        return None
    except Exception as e:
        logger.error("get_global_settings_id_failed", error=str(e))
        return None


async def activate_kill_switch(reason: str, user_id: str = "system") -> bool:
    """
    Activate the kill switch to immediately stop all trading operations.
    State is persisted to global_settings for cluster safety.

    Args:
        reason: Reason for activation
        user_id: User ID activating the switch

    Returns:
        True if activated successfully
    """
    try:
        supabase = get_supabase()
        settings_id = _get_global_settings_id()
        
        if not settings_id:
            logger.error("kill_switch_activation_failed", error="No global_settings row found")
            return False
        
        # Update kill switch in database
        supabase.table("global_settings").update({
            "global_kill_switch": True,
            "updated_at": datetime.utcnow().isoformat(),
            "updated_by": user_id if user_id != "system" else None
        }).eq("id", settings_id).execute()

        # Log the activation
        await audit_log(
            action="kill_switch_activated",
            resource_type="system",
            user_id=user_id,
            severity="critical",
            before_state={"active": False},
            after_state={
                "active": True,
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
        )

        # Create alert
        await create_alert(
            title="KILL SWITCH ACTIVATED",
            message=f"Trading operations halted: {reason}",
            severity="critical",
            source="system",
            metadata={"reason": reason, "activated_by": user_id}
        )

        logger.critical("kill_switch_activated", reason=reason, user_id=user_id)
        return True

    except Exception as e:
        logger.error("kill_switch_activation_failed", error=str(e))
        return False


async def deactivate_kill_switch(user_id: str = "system") -> bool:
    """
    Deactivate the kill switch to resume trading operations.
    State is persisted to global_settings for cluster safety.

    Args:
        user_id: User ID deactivating the switch

    Returns:
        True if deactivated successfully
    """
    try:
        supabase = get_supabase()
        settings_id = _get_global_settings_id()
        
        if not settings_id:
            logger.error("kill_switch_deactivation_failed", error="No global_settings row found")
            return False
        
        # Update kill switch in database
        supabase.table("global_settings").update({
            "global_kill_switch": False,
            "updated_at": datetime.utcnow().isoformat(),
            "updated_by": user_id if user_id != "system" else None
        }).eq("id", settings_id).execute()

        # Log the deactivation
        await audit_log(
            action="kill_switch_deactivated",
            resource_type="system",
            user_id=user_id,
            severity="warning",
            before_state={"active": True},
            after_state={"active": False}
        )

        # Create alert
        await create_alert(
            title="KILL SWITCH DEACTIVATED",
            message="Trading operations resumed",
            severity="info",
            source="system"
        )

        logger.warning("kill_switch_deactivated", user_id=user_id)
        return True

    except Exception as e:
        logger.error("kill_switch_deactivation_failed", error=str(e))
        return False


async def is_kill_switch_active() -> bool:
    """
    Check if the kill switch is currently active.
    Reads from global_settings for cluster-safe state.

    Returns:
        True if kill switch is active
    """
    try:
        supabase = get_supabase()
        result = supabase.table("global_settings").select("global_kill_switch").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0].get("global_kill_switch", False)
        return False
        
    except Exception as e:
        logger.error("is_kill_switch_active_check_failed", error=str(e))
        # Fail safe: if we can't check, assume it's active
        return True


async def get_kill_switch_status() -> dict:
    """
    Get detailed kill switch status from database.

    Returns:
        Dictionary with kill switch status information
    """
    try:
        supabase = get_supabase()
        result = supabase.table("global_settings").select(
            "global_kill_switch, updated_at, updated_by"
        ).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            row = result.data[0]
            return {
                "active": row.get("global_kill_switch", False),
                "updated_at": row.get("updated_at"),
                "updated_by": row.get("updated_by"),
                "source": "database"
            }
        
        return {
            "active": False,
            "updated_at": None,
            "updated_by": None,
            "source": "default"
        }
        
    except Exception as e:
        logger.error("get_kill_switch_status_failed", error=str(e))
        return {
            "active": True,  # Fail safe
            "error": str(e),
            "source": "error"
        }


async def check_kill_switch_for_trading() -> tuple[bool, str]:
    """
    Check if trading is allowed (kill switch inactive).

    Returns:
        Tuple of (allowed: bool, reason: str)
    """
    is_active = await is_kill_switch_active()
    
    if is_active:
        return False, "Kill switch is active - trading halted"

    return True, ""


async def get_global_settings() -> dict:
    """
    Get all global settings from database.
    
    Returns:
        Dictionary with all global settings
    """
    try:
        supabase = get_supabase()
        result = supabase.table("global_settings").select("*").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        
        return {}
        
    except Exception as e:
        logger.error("get_global_settings_failed", error=str(e))
        return {}
