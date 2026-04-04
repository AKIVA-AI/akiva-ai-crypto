"""
Per-agent identity and inter-agent request signing.

Zero Trust: Each agent gets a unique identity token (HMAC-based) rather than
sharing the service role key. Messages between agents are HMAC-signed to
prevent spoofing.
"""

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Optional

import structlog

logger = structlog.get_logger()

# Master signing key — loaded from env, never hardcoded
_AGENT_SIGNING_KEY: Optional[bytes] = None

SIGNATURE_MAX_AGE_SECONDS = 300  # 5 minutes max message age


def _get_signing_key() -> bytes:
    """Get the master agent signing key (cached)."""
    global _AGENT_SIGNING_KEY
    if _AGENT_SIGNING_KEY is None:
        raw = os.getenv("AGENT_SIGNING_KEY", "")
        if not raw:
            # Fall back to deriving from service role key for backward compat
            srk = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "default-dev-key")
            raw = hashlib.sha256(f"agent-signing:{srk}".encode()).hexdigest()
        _AGENT_SIGNING_KEY = raw.encode()
    return _AGENT_SIGNING_KEY


@dataclass
class AgentIdentity:
    """Represents a unique agent identity with signing capability."""

    agent_id: str
    agent_type: str
    _secret: bytes  # Per-agent derived secret

    def sign_message(self, payload: str) -> str:
        """Sign a message payload with this agent's identity. Returns hex digest."""
        ts = str(int(time.time()))
        message = f"{self.agent_id}:{ts}:{payload}"
        sig = hmac.new(self._secret, message.encode(), hashlib.sha256).hexdigest()
        return f"{ts}:{sig}"

    def verify_signature(
        self, sender_agent_id: str, payload: str, signature: str
    ) -> bool:
        """Verify a signed message from another agent (delegates to module function)."""
        return verify_agent_signature(sender_agent_id, payload, signature)


def create_agent_identity(agent_id: str, agent_type: str) -> AgentIdentity:
    """Create a unique identity for an agent, derived from the master key."""
    master = _get_signing_key()
    per_agent_secret = hmac.new(
        master, f"agent-identity:{agent_id}".encode(), hashlib.sha256
    ).digest()
    return AgentIdentity(
        agent_id=agent_id, agent_type=agent_type, _secret=per_agent_secret
    )


def sign_agent_message(agent_id: str, payload: str) -> str:
    """Sign a message on behalf of an agent. Returns 'timestamp:hmac_hex'."""
    master = _get_signing_key()
    per_agent_secret = hmac.new(
        master, f"agent-identity:{agent_id}".encode(), hashlib.sha256
    ).digest()
    ts = str(int(time.time()))
    message = f"{agent_id}:{ts}:{payload}"
    sig = hmac.new(per_agent_secret, message.encode(), hashlib.sha256).hexdigest()
    return f"{ts}:{sig}"


def verify_agent_signature(claimed_agent_id: str, payload: str, signature: str) -> bool:
    """
    Verify that a message was signed by the claimed agent.
    Uses deterministic key derivation so any node can verify any agent's signature.
    """
    try:
        parts = signature.split(":", 1)
        if len(parts) != 2:
            return False
        ts_str, sig_hex = parts
        ts = int(ts_str)

        # Reject stale messages
        age = abs(time.time() - ts)
        if age > SIGNATURE_MAX_AGE_SECONDS:
            logger.warning(
                "agent_signature_expired",
                claimed_agent=claimed_agent_id,
                message_age_seconds=round(age, 1),
            )
            return False

        # Recompute the expected signature
        master = _get_signing_key()
        per_agent_secret = hmac.new(
            master, f"agent-identity:{claimed_agent_id}".encode(), hashlib.sha256
        ).digest()
        expected_message = f"{claimed_agent_id}:{ts_str}:{payload}"
        expected_sig = hmac.new(
            per_agent_secret, expected_message.encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(sig_hex, expected_sig)

    except (ValueError, TypeError) as e:
        logger.error("agent_signature_verification_error", error=str(e))
        return False
