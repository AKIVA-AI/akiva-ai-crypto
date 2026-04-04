"""
Security utilities for authentication and authorization.
"""

import os

import structlog
from fastapi import HTTPException, Request

from supabase import Client, create_client

logger = structlog.get_logger()

# Get Supabase client
_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Get or create Supabase client for auth operations."""
    global _supabase_client

    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

        _supabase_client = create_client(url, key)
        logger.info("supabase_auth_client_initialized")

    return _supabase_client


async def verify_token(token: str) -> dict:
    """
    Verify a JWT token with Supabase.

    Args:
        token: JWT token from Authorization header

    Returns:
        User data from token

    Raises:
        HTTPException: If token is invalid
    """
    try:
        supabase = get_supabase_client()

        # Verify the JWT with Supabase
        result = supabase.auth.get_user(token)

        if not result or not result.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = result.user

        return {
            "id": user.id,
            "email": user.email,
            "role": user.user_metadata.get("role", "viewer")
            if user.user_metadata
            else "viewer",
            "email_verified": user.email_confirmed_at is not None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("token_verification_failed", error=str(e))
        raise HTTPException(status_code=401, detail="Token verification failed")


async def get_current_user(token: str) -> dict:
    """
    Get current user from JWT token.

    Args:
        token: JWT token from Authorization header

    Returns:
        User data including role from user_roles table
    """
    # First verify the token
    user = await verify_token(token)

    try:
        # Fetch role from user_roles table
        supabase = get_supabase_client()
        result = (
            supabase.table("user_roles")
            .select("role")
            .eq("user_id", user["id"])
            .execute()
        )

        if result.data and len(result.data) > 0:
            # Get the highest privilege role
            roles = [r["role"] for r in result.data]
            role_priority = [
                "admin",
                "cio",
                "trader",
                "ops",
                "research",
                "auditor",
                "viewer",
            ]
            for priority_role in role_priority:
                if priority_role in roles:
                    user["role"] = priority_role
                    break
        else:
            user["role"] = "viewer"

        logger.info("user_authenticated", user_id=user["id"], role=user["role"])
        return user

    except Exception as e:
        logger.error("role_fetch_failed", error=str(e), user_id=user["id"])
        # Still return user with default role
        user["role"] = "viewer"
        return user


def require_role(allowed_roles: list[str]):
    """
    Dependency to require specific roles.

    Usage:
        @app.get("/admin")
        async def admin_endpoint(user: dict = Depends(require_role(["admin", "cio"]))):
            pass
    """

    async def role_checker(request: Request) -> dict:
        user = getattr(request.state, "user", None)

        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user_role = user.get("role", "viewer")

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user_role}' not authorized. Required: {allowed_roles}",
            )

        return user

    return role_checker
