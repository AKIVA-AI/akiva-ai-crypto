"""
Database connection and utilities for Supabase.
"""
import structlog
from supabase import create_client, Client
from app.config import settings

logger = structlog.get_logger()

_supabase_client: Client | None = None


def get_supabase() -> Client:
    """Get or create Supabase client."""
    global _supabase_client
    
    if _supabase_client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise ValueError("Supabase URL and service key are required")
        
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key
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
    """Log an audit event to the database."""
    try:
        supabase = get_supabase()
        supabase.table("audit_events").insert({
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
        }).execute()
        
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
