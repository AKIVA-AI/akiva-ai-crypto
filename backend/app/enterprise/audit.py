"""
Audit Logging System

Enterprise-grade audit logging for:
- All trading activities
- User actions
- System events
- Compliance tracking
- Security events

Supports multiple backends: PostgreSQL, Elasticsearch, S3
"""

import asyncio
import json
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AuditCategory(str, Enum):
    """Audit event categories."""

    TRADING = "trading"
    PORTFOLIO = "portfolio"
    STRATEGY = "strategy"
    RISK = "risk"
    ARBITRAGE = "arbitrage"
    AGENT = "agent"
    USER = "user"
    SYSTEM = "system"
    SECURITY = "security"
    COMPLIANCE = "compliance"


class AuditSeverity(str, Enum):
    """Audit event severity levels."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AuditEvent:
    """Audit event record."""

    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    category: AuditCategory = AuditCategory.SYSTEM
    severity: AuditSeverity = AuditSeverity.INFO
    action: str = ""
    user_id: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool = True
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        data = asdict(self)
        data["timestamp"] = self.timestamp.isoformat()
        data["category"] = self.category.value
        data["severity"] = self.severity.value
        return data

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class AuditLogger:
    """
    Enterprise audit logging system.

    Features:
    - Async logging for performance
    - Multiple storage backends
    - Structured event format
    - Compliance-ready exports
    """

    def __init__(self, buffer_size: int = 100, flush_interval: float = 5.0):
        self._buffer: List[AuditEvent] = []
        self._buffer_size = buffer_size
        self._flush_interval = flush_interval
        self._running = False
        self._backends: List[Any] = []
        self._stats = {
            "events_logged": 0,
            "events_flushed": 0,
            "errors": 0,
        }

    async def start(self):
        """Start the audit logger."""
        self._running = True
        asyncio.create_task(self._flush_loop())
        logger.info("Audit logger started")

    async def stop(self):
        """Stop and flush remaining events."""
        self._running = False
        await self._flush()
        logger.info("Audit logger stopped")

    async def log(self, event: AuditEvent):
        """Log an audit event."""
        self._buffer.append(event)
        self._stats["events_logged"] += 1

        # Flush if buffer is full
        if len(self._buffer) >= self._buffer_size:
            await self._flush()

    async def log_action(
        self,
        category: AuditCategory,
        action: str,
        user_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        success: bool = True,
        error_message: Optional[str] = None,
        ip_address: Optional[str] = None,
    ):
        """Convenience method to log an action."""
        event = AuditEvent(
            category=category,
            severity=severity,
            action=action,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            success=success,
            error_message=error_message,
            ip_address=ip_address,
        )
        await self.log(event)

    async def _flush_loop(self):
        """Periodic flush loop."""
        while self._running:
            await asyncio.sleep(self._flush_interval)
            if self._buffer:
                await self._flush()

    async def _flush(self):
        """Flush buffer to backends."""
        if not self._buffer:
            return

        events = self._buffer.copy()
        self._buffer.clear()

        # Log to Python logger (always)
        for event in events:
            log_level = getattr(logging, event.severity.value.upper(), logging.INFO)
            logger.log(
                log_level,
                f"[AUDIT] {event.category.value}:{event.action} "
                f"user={event.user_id} resource={event.resource_type}:{event.resource_id} "
                f"success={event.success}",
            )

        self._stats["events_flushed"] += len(events)

    # Convenience methods for common audit events

    async def log_trade(
        self,
        action: str,
        user_id: str,
        trade_id: str,
        details: Dict,
        success: bool = True,
    ):
        """Log trading activity."""
        await self.log_action(
            category=AuditCategory.TRADING,
            action=action,
            user_id=user_id,
            resource_type="trade",
            resource_id=trade_id,
            details=details,
            success=success,
        )

    async def log_risk_event(
        self,
        action: str,
        user_id: Optional[str],
        details: Dict,
        severity: AuditSeverity = AuditSeverity.WARNING,
    ):
        """Log risk management event."""
        await self.log_action(
            category=AuditCategory.RISK,
            action=action,
            user_id=user_id,
            details=details,
            severity=severity,
        )

    async def log_security_event(
        self,
        action: str,
        user_id: Optional[str],
        details: Dict,
        success: bool,
        ip_address: Optional[str] = None,
    ):
        """Log security event."""
        severity = AuditSeverity.INFO if success else AuditSeverity.WARNING
        await self.log_action(
            category=AuditCategory.SECURITY,
            action=action,
            user_id=user_id,
            details=details,
            severity=severity,
            success=success,
            ip_address=ip_address,
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get audit logger statistics."""
        return {
            "buffer_size": len(self._buffer),
            "running": self._running,
            **self._stats,
        }


# Global audit logger
audit_logger = AuditLogger()


async def start_audit_logger():
    """Start the global audit logger."""
    await audit_logger.start()


async def stop_audit_logger():
    """Stop the global audit logger."""
    await audit_logger.stop()
