"""
Tests for WebSocket authentication.

Sprint 0 - Dim 8 (Security) hardening: WebSocket auth validation.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.api.websocket import _authenticate_websocket


class TestWebSocketAuthentication:
    """WebSocket connections must be authenticated before data is streamed."""

    def test_no_token_returns_none(self):
        """WebSocket without token should return None (unauthenticated)."""
        import asyncio

        ws = MagicMock()
        ws.query_params = {}
        ws.headers = {}

        result = asyncio.get_event_loop().run_until_complete(
            _authenticate_websocket(ws)
        )
        assert result is None

    @patch("app.core.security.verify_token", new_callable=AsyncMock)
    def test_valid_query_token_authenticates(self, mock_verify):
        """WebSocket with valid query token should authenticate."""
        import asyncio

        mock_verify.return_value = {"id": "user-123", "email": "test@test.com", "role": "trader"}
        ws = MagicMock()
        ws.query_params = {"token": "valid-jwt-token"}
        ws.headers = {}

        result = asyncio.get_event_loop().run_until_complete(
            _authenticate_websocket(ws)
        )
        assert result == "user-123"
        mock_verify.assert_awaited_once_with("valid-jwt-token")

    @patch("app.core.security.verify_token", new_callable=AsyncMock)
    def test_valid_header_token_authenticates(self, mock_verify):
        """WebSocket with valid Authorization header should authenticate."""
        import asyncio

        mock_verify.return_value = {"id": "user-456", "email": "test@test.com", "role": "admin"}
        ws = MagicMock()
        ws.query_params = {}
        ws.headers = {"authorization": "Bearer valid-jwt-header"}

        result = asyncio.get_event_loop().run_until_complete(
            _authenticate_websocket(ws)
        )
        assert result == "user-456"
        mock_verify.assert_awaited_once_with("valid-jwt-header")

    @patch("app.core.security.verify_token", new_callable=AsyncMock)
    def test_invalid_token_returns_none(self, mock_verify):
        """WebSocket with invalid token should return None."""
        import asyncio

        mock_verify.side_effect = Exception("Invalid token")
        ws = MagicMock()
        ws.query_params = {"token": "invalid-token"}
        ws.headers = {}

        result = asyncio.get_event_loop().run_until_complete(
            _authenticate_websocket(ws)
        )
        assert result is None

    @patch("app.core.security.verify_token", new_callable=AsyncMock)
    def test_query_param_takes_precedence(self, mock_verify):
        """Query param token takes precedence over header."""
        import asyncio

        mock_verify.return_value = {"id": "user-789", "email": "t@t.com", "role": "viewer"}
        ws = MagicMock()
        ws.query_params = {"token": "query-token"}
        ws.headers = {"authorization": "Bearer header-token"}

        result = asyncio.get_event_loop().run_until_complete(
            _authenticate_websocket(ws)
        )
        assert result == "user-789"
        mock_verify.assert_awaited_once_with("query-token")
