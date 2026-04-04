"""
Structured logging configuration for the application.
"""

import logging
import os
import sys
from datetime import datetime

import structlog


def setup_logging():
    """
    Configure structured logging for the application.

    Returns:
        structlog logger instance
    """
    # Determine log level from environment
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    # Configure standard logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # Processors for structlog
    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    # Use different formatting for development vs production
    is_production = os.getenv("ENV", "development") == "production"

    if is_production:
        # JSON output for production (better for log aggregation)
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Pretty console output for development
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logger = structlog.get_logger()

    logger.info(
        "logging_configured",
        level=log_level_str,
        environment=os.getenv("ENV", "development"),
        timestamp=datetime.utcnow().isoformat(),
    )

    return logger


def get_logger(name: str = None):
    """
    Get a logger instance with optional name binding.

    Args:
        name: Optional module/component name to bind

    Returns:
        structlog logger instance
    """
    logger = structlog.get_logger()

    if name:
        logger = logger.bind(component=name)

    return logger
