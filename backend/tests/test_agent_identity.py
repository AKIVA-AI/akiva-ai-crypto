"""
Tests for per-agent identity and inter-agent request signing (Zero Trust D18).
"""

import time

import pytest
from app.core.agent_identity import (
    SIGNATURE_MAX_AGE_SECONDS,
    _get_signing_key,
    create_agent_identity,
    sign_agent_message,
    verify_agent_signature,
)


@pytest.fixture(autouse=True)
def _reset_signing_key(monkeypatch):
    """Reset the cached signing key between tests."""
    import app.core.agent_identity as mod

    mod._AGENT_SIGNING_KEY = None
    monkeypatch.setenv("AGENT_SIGNING_KEY", "test-master-key-for-ci")
    yield
    mod._AGENT_SIGNING_KEY = None


class TestAgentIdentityCreation:
    def test_create_identity(self):
        identity = create_agent_identity("risk-agent", "risk")
        assert identity.agent_id == "risk-agent"
        assert identity.agent_type == "risk"
        assert identity._secret  # non-empty derived secret

    def test_different_agents_get_different_secrets(self):
        id1 = create_agent_identity("risk-agent", "risk")
        id2 = create_agent_identity("execution-agent", "execution")
        assert id1._secret != id2._secret

    def test_same_agent_gets_same_secret(self):
        id1 = create_agent_identity("risk-agent", "risk")
        id2 = create_agent_identity("risk-agent", "risk")
        assert id1._secret == id2._secret


class TestMessageSigning:
    def test_sign_and_verify(self):
        identity = create_agent_identity("signal-agent", "signal")
        payload = '{"action": "buy", "symbol": "BTC"}'

        signature = identity.sign_message(payload)
        assert signature  # non-empty
        assert ":" in signature  # format is "timestamp:hmac_hex"

        valid = verify_agent_signature("signal-agent", payload, signature)
        assert valid is True

    def test_tampered_payload_rejected(self):
        identity = create_agent_identity("signal-agent", "signal")
        payload = '{"action": "buy", "symbol": "BTC"}'
        signature = identity.sign_message(payload)

        tampered = '{"action": "buy", "symbol": "ETH"}'
        assert verify_agent_signature("signal-agent", tampered, signature) is False

    def test_wrong_agent_id_rejected(self):
        identity = create_agent_identity("signal-agent", "signal")
        payload = '{"action": "buy"}'
        signature = identity.sign_message(payload)

        assert verify_agent_signature("evil-agent", payload, signature) is False

    def test_corrupted_signature_rejected(self):
        assert verify_agent_signature("any", "payload", "not-a-valid-sig") is False

    def test_empty_signature_rejected(self):
        assert verify_agent_signature("any", "payload", "") is False

    def test_expired_signature_rejected(self, monkeypatch):
        identity = create_agent_identity("risk-agent", "risk")
        payload = "test"
        signature = identity.sign_message(payload)

        # Advance time beyond max age
        future = time.time() + SIGNATURE_MAX_AGE_SECONDS + 60
        monkeypatch.setattr(time, "time", lambda: future)
        assert verify_agent_signature("risk-agent", payload, signature) is False


class TestModuleLevelSigning:
    def test_sign_agent_message_roundtrip(self):
        payload = '{"order_id": "123"}'
        sig = sign_agent_message("exec-agent", payload)
        assert verify_agent_signature("exec-agent", payload, sig) is True

    def test_cross_agent_verification(self):
        """Any node can verify any agent's signature (deterministic derivation)."""
        payload = "cross-check"
        sig = sign_agent_message("agent-a", payload)
        # A different agent can verify agent-a's message
        id_b = create_agent_identity("agent-b", "observer")
        assert id_b.verify_signature("agent-a", payload, sig) is True


class TestSigningKeyDerivation:
    def test_explicit_key(self, monkeypatch):
        import app.core.agent_identity as mod

        mod._AGENT_SIGNING_KEY = None
        monkeypatch.setenv("AGENT_SIGNING_KEY", "my-explicit-key")
        key = _get_signing_key()
        assert key == b"my-explicit-key"

    def test_fallback_to_service_role_key(self, monkeypatch):
        import app.core.agent_identity as mod

        mod._AGENT_SIGNING_KEY = None
        monkeypatch.delenv("AGENT_SIGNING_KEY", raising=False)
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-srk")
        key = _get_signing_key()
        assert key  # derived from SRK, non-empty
        assert key != b"test-srk"  # should be SHA256 derived, not raw
