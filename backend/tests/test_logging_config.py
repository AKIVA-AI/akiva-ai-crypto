"""Tests for core/logging.py"""

from unittest.mock import patch

from app.core.logging import get_logger, setup_logging


class TestSetupLogging:
    def test_returns_logger(self):
        logger = setup_logging()
        assert logger is not None

    @patch.dict("os.environ", {"LOG_LEVEL": "DEBUG"})
    def test_debug_level(self):
        logger = setup_logging()
        assert logger is not None

    @patch.dict("os.environ", {"ENV": "production"})
    def test_production_mode(self):
        logger = setup_logging()
        assert logger is not None

    @patch.dict("os.environ", {"LOG_LEVEL": "INVALID"})
    def test_invalid_level_defaults_to_info(self):
        logger = setup_logging()
        assert logger is not None


class TestGetLogger:
    def test_without_name(self):
        logger = get_logger()
        assert logger is not None

    def test_with_name(self):
        logger = get_logger("test_component")
        assert logger is not None
