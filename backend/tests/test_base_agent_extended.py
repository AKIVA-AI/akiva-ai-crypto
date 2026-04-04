"""Extended tests for base_agent.py uncovered paths."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from app.agents.base_agent import (
    AGENT_BEHAVIOR_VERSION,
    AgentBehaviorVersion,
    AgentChannel,
    AgentDriftMetrics,
    AgentMessage,
    BaseAgent,
)


class _StubAgent(BaseAgent):
    def __init__(self, **kw):
        super().__init__(
            agent_id=kw.get("agent_id", "stub-01"),
            agent_type=kw.get("agent_type", "stub"),
            redis_url=kw.get("redis_url", "redis://localhost:6379"),
            subscribed_channels=kw.get("subscribed_channels"),
            capabilities=kw.get("capabilities", ["cap_a", "cap_b"]),
        )
        self.handled = []

    async def handle_message(self, msg):
        self.handled.append(msg)

    async def cycle(self):
        pass


class TestAgentMessage:
    def test_create_roundtrip(self):
        msg = AgentMessage.create(
            source="a", channel=AgentChannel.SIGNALS, payload={"sig": "buy"}, target="b"
        )
        assert msg.source_agent == "a" and msg.target_agent == "b"
        restored = AgentMessage.from_json(msg.to_json())
        assert restored.id == msg.id and restored.payload == msg.payload

    def test_create_no_target(self):
        msg = AgentMessage.create(
            source="a", channel=AgentChannel.MARKET_DATA, payload={}
        )
        assert msg.target_agent is None and msg.correlation_id is not None

    def test_signature_roundtrip(self):
        msg = AgentMessage.create(source="a", channel=AgentChannel.ALERTS, payload={})
        msg.signature = "sig123"
        assert AgentMessage.from_json(msg.to_json()).signature == "sig123"


class TestBehaviorVersion:
    def test_fields(self):
        bv = AgentBehaviorVersion(
            version="1.0",
            prompt_hash="abc",
            tools=["t1"],
            model="rule",
            changed_at="now",
        )
        assert bv.version == "1.0"


class TestDriftMetrics:
    def test_defaults(self):
        assert AgentDriftMetrics().override_rate == 0.0

    def test_rates(self):
        d = AgentDriftMetrics(
            override_count=2, fallback_count=1, approval_count=7, total_decisions=10
        )
        assert d.override_rate == pytest.approx(
            0.2
        ) and d.approval_rate == pytest.approx(0.7)

    def test_to_dict(self):
        d = AgentDriftMetrics(total_decisions=4, approval_count=3, override_count=1)
        assert d.to_dict()["override_rate"] == 0.25


class TestBaseAgentDrift:
    def test_record_decision_approved(self):
        a = _StubAgent()
        a.record_decision(True)
        assert a._drift.approval_count == 1

    def test_record_decision_rejected(self):
        a = _StubAgent()
        a.record_decision(False)
        assert a._drift.rejection_count == 1

    def test_record_override(self):
        a = _StubAgent()
        a.record_override()
        assert a._drift.override_count == 1

    def test_record_fallback(self):
        a = _StubAgent()
        a.record_fallback()
        assert a._drift.fallback_count == 1

    def test_get_behavior_info(self):
        info = _StubAgent().get_behavior_info()
        assert info["behavior_version"]["version"] == AGENT_BEHAVIOR_VERSION
        assert info["behavior_version"]["tools"] == ["cap_a", "cap_b"]


class TestSignedChannels:
    async def test_valid_sig(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="stub-01", channel=AgentChannel.EXECUTION, payload={"x": 1}
        )
        unsigned = AgentMessage(
            id=msg.id,
            timestamp=msg.timestamp,
            source_agent=msg.source_agent,
            target_agent=msg.target_agent,
            channel=msg.channel,
            payload=msg.payload,
            correlation_id=msg.correlation_id,
            signature=None,
        )
        msg.signature = a._identity.sign_message(unsigned.to_json())
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.EXECUTION.value,
                "data": msg.to_json(),
            }
        )
        assert len(a.handled) == 1

    async def test_invalid_sig(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="evil", channel=AgentChannel.EXECUTION, payload={}
        )
        msg.signature = "0:badsig"
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.EXECUTION.value,
                "data": msg.to_json(),
            }
        )
        assert a._metrics["signature_failures"] == 1 and len(a.handled) == 0

    async def test_non_signed_channel(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="x", channel=AgentChannel.MARKET_DATA, payload={}
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.MARKET_DATA.value,
                "data": msg.to_json(),
            }
        )
        assert len(a.handled) == 1

    async def test_non_message_type(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        await a._process_message({"type": "subscribe", "channel": "test", "data": "{}"})
        assert a._metrics["messages_received"] == 0

    async def test_bytes_decoded(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="x", channel=AgentChannel.MARKET_DATA, payload={}
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.MARKET_DATA.value.encode(),
                "data": msg.to_json().encode(),
            }
        )
        assert a._metrics["messages_received"] == 1

    async def test_malformed_data(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.MARKET_DATA.value,
                "data": "bad{json",
            }
        )
        assert a._metrics["errors"] == 1


class TestControlMessages:
    async def test_shutdown(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="ctrl", channel=AgentChannel.CONTROL, payload={"command": "shutdown"}
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.CONTROL.value,
                "data": msg.to_json(),
            }
        )
        assert a._running is False

    async def test_pause(self):
        a = _StubAgent()
        a._running = True
        a._paused = False
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="ctrl", channel=AgentChannel.CONTROL, payload={"command": "pause"}
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.CONTROL.value,
                "data": msg.to_json(),
            }
        )
        assert a._paused is True

    async def test_resume(self):
        a = _StubAgent()
        a._running = True
        a._paused = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="ctrl", channel=AgentChannel.CONTROL, payload={"command": "resume"}
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.CONTROL.value,
                "data": msg.to_json(),
            }
        )
        assert a._paused is False

    async def test_control_other_target(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        msg = AgentMessage.create(
            source="ctrl",
            channel=AgentChannel.CONTROL,
            payload={"command": "shutdown", "target": "other"},
        )
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.CONTROL.value,
                "data": msg.to_json(),
            }
        )
        assert a._running is True


class TestMessageQueue:
    async def test_queue_no_redis(self):
        a = _StubAgent()
        a._redis = None
        await a.publish(AgentChannel.SIGNALS, {"x": 1})
        assert len(a._message_queue) == 1

    async def test_queue_overflow(self):
        a = _StubAgent()
        a._redis = None
        a._message_queue = [("ch", {}, None)] * 1000
        await a.publish(AgentChannel.SIGNALS, {"x": 1})
        assert len(a._message_queue) == 1000

    async def test_flush_empty(self):
        await _StubAgent()._flush_message_queue()

    async def test_flush_messages(self):
        a = _StubAgent()
        a._redis = AsyncMock()
        a._message_queue = [(AgentChannel.SIGNALS, {"s": 1}, "c1")]
        await a._flush_message_queue()
        assert len(a._message_queue) == 0


class TestSendAlert:
    async def test_publishes(self):
        a = _StubAgent()
        a._redis = AsyncMock()
        a._supabase_url = "https://test.supabase.co"
        a._supabase_key = "key"
        a._http_client = AsyncMock()
        await a.send_alert("critical", "Title", "Body")
        assert a._redis.publish.called and a._http_client.post.called

    async def test_no_supabase(self):
        a = _StubAgent()
        a._redis = AsyncMock()
        a._supabase_url = ""
        a._supabase_key = ""
        a._http_client = None
        await a.send_alert("warning", "T", "B")

    async def test_supabase_error(self):
        a = _StubAgent()
        a._redis = AsyncMock()
        a._supabase_url = "https://x"
        a._supabase_key = "k"
        a._http_client = AsyncMock()
        a._http_client.post.side_effect = Exception("fail")
        await a.send_alert("critical", "T", "B")


class TestMarkStopped:
    async def test_sends_patch(self):
        a = _StubAgent()
        a._supabase_url = "https://x"
        a._supabase_key = "k"
        a._http_client = AsyncMock()
        await a._mark_stopped()
        assert a._http_client.patch.called

    async def test_no_supabase(self):
        a = _StubAgent()
        a._supabase_url = ""
        a._supabase_key = ""
        a._http_client = None
        await a._mark_stopped()

    async def test_error(self):
        a = _StubAgent()
        a._supabase_url = "https://x"
        a._supabase_key = "k"
        a._http_client = AsyncMock()
        a._http_client.patch.side_effect = Exception("f")
        await a._mark_stopped()


class TestHeartbeatLoop:
    async def test_sends(self):
        a = _StubAgent()
        a._running = True
        a._redis = AsyncMock()
        a._supabase_url = ""
        a._supabase_key = ""
        call_count = 0
        _real_sleep = asyncio.sleep

        async def fake_sleep(s):
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                a._running = False
            await _real_sleep(0)

        with patch("asyncio.sleep", side_effect=fake_sleep):
            await a._heartbeat_loop()
        assert a._redis.publish.called


class TestPublishResilience:
    async def test_queues_on_error(self):
        import redis.asyncio as aioredis

        a = _StubAgent()
        mock_r = AsyncMock()
        mock_r.publish.side_effect = aioredis.ConnectionError("lost")
        a._redis = mock_r
        a._attempt_reconnect = AsyncMock()
        await a.publish(AgentChannel.SIGNALS, {"t": 1})
        assert len(a._message_queue) == 1


class TestRegisteredHandler:
    async def test_handler_called(self):
        a = _StubAgent()
        a._running = True
        a._message_handlers = {}
        called = []

        async def handler(m):
            called.append(m)

        a.register_handler(AgentChannel.SIGNALS, handler)
        msg = AgentMessage.create(source="x", channel=AgentChannel.SIGNALS, payload={})
        await a._process_message(
            {
                "type": "message",
                "channel": AgentChannel.SIGNALS.value,
                "data": msg.to_json(),
            }
        )
        assert len(called) == 1 and len(a.handled) == 0
