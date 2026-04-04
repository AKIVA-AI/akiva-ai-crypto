"""
Tests for the control_plane adapters.

TDD: tests written before implementation.
Covers:
  - authority_adapter: agent-type → AuthorityBoundary mapping
  - risk_policy: VaR, position-limit, daily-loss PolicyAdapter checks
  - evidence_adapter: trading fill → EvidenceRecord conversion
"""

import pytest
import pytest_asyncio

pytest.importorskip("akiva_execution_contracts")
pytest.importorskip("akiva_policy_runtime")


# ---------------------------------------------------------------------------
# authority_adapter
# ---------------------------------------------------------------------------

class TestAuthorityAdapter:
    """AuthorityAdapter maps agent roles to AuthorityBoundary contracts."""

    def test_import(self):
        from app.control_plane.authority_adapter import AuthorityAdapter  # noqa: F401
        assert AuthorityAdapter is not None

    def test_signal_agent_gets_read_only(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope, ApprovalPolicy

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("signal-agent-01")
        assert boundary.scope == PermissionScope.READ_ONLY
        assert boundary.approval == ApprovalPolicy.AUTO

    def test_execution_agent_gets_workspace_write(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("execution-agent-01")
        assert boundary.scope == PermissionScope.WORKSPACE_WRITE

    def test_meta_decision_agent_gets_full_access_with_approval(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope, ApprovalPolicy

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("meta-decision-agent-01")
        assert boundary.scope == PermissionScope.FULL_ACCESS
        assert boundary.approval == ApprovalPolicy.REQUIRE_APPROVAL

    def test_risk_agent_gets_workspace_write(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("risk-agent-01")
        assert boundary.scope == PermissionScope.WORKSPACE_WRITE

    def test_capital_allocation_agent_gets_workspace_write(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("capital-allocation-agent-01")
        assert boundary.scope == PermissionScope.WORKSPACE_WRITE

    def test_freqtrade_signal_agent_gets_read_only(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("freqtrade-signal-agent-01")
        assert boundary.scope == PermissionScope.READ_ONLY

    def test_unknown_agent_defaults_to_read_only_deny(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope, ApprovalPolicy

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("unknown-agent-xyz")
        assert boundary.scope == PermissionScope.READ_ONLY
        assert boundary.approval == ApprovalPolicy.DENY

    def test_meta_decision_is_denied_returns_false(self):
        """META-DECISION requires approval — is_denied() must be False."""
        from app.control_plane.authority_adapter import AuthorityAdapter

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("meta-decision-agent-01")
        assert not boundary.is_denied()
        assert boundary.needs_approval()

    def test_execution_agent_position_limit_bounded(self):
        """Execution agent boundary carries position limit metadata."""
        from app.control_plane.authority_adapter import AuthorityAdapter

        adapter = AuthorityAdapter()
        meta = adapter.get_agent_metadata("execution-agent-01")
        assert "position_limit_usd" in meta
        assert meta["position_limit_usd"] > 0

    def test_scope_allows_read_on_workspace_write(self):
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary("execution-agent-01")
        assert boundary.scope_allows(PermissionScope.READ_ONLY)
        assert boundary.scope_allows(PermissionScope.WORKSPACE_WRITE)
        assert not boundary.scope_allows(PermissionScope.FULL_ACCESS)

    def test_resolve_by_agent_type(self):
        """get_boundary_for_type resolves by type string, not agent id."""
        from app.control_plane.authority_adapter import AuthorityAdapter
        from akiva_execution_contracts import PermissionScope

        adapter = AuthorityAdapter()
        boundary = adapter.get_boundary_for_type("signal")
        assert boundary.scope == PermissionScope.READ_ONLY


# ---------------------------------------------------------------------------
# risk_policy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestVaRPolicy:
    """VaRPolicy: deny when VaR exceeds limit."""

    async def test_import(self):
        from app.control_plane.risk_policy import VaRPolicy  # noqa: F401
        assert VaRPolicy is not None

    async def test_allow_when_var_within_limit(self):
        from app.control_plane.risk_policy import VaRPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = VaRPolicy(max_var_usd=50_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"var_usd": 10_000},
            caller_id="execution-agent-01",
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW

    async def test_deny_when_var_exceeds_limit(self):
        from app.control_plane.risk_policy import VaRPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = VaRPolicy(max_var_usd=50_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"var_usd": 60_000},
            caller_id="execution-agent-01",
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.DENY
        assert "VaR" in decision.reason

    async def test_deny_when_var_exactly_at_limit(self):
        """Boundary: equal to limit → deny (not strictly less)."""
        from app.control_plane.risk_policy import VaRPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = VaRPolicy(max_var_usd=50_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"var_usd": 50_000},
            caller_id="execution-agent-01",
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.DENY

    async def test_allow_when_no_var_provided(self):
        """Missing VaR key in input → allow (no data = no breach)."""
        from app.control_plane.risk_policy import VaRPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = VaRPolicy(max_var_usd=50_000)
        ctx = PolicyContext(capability_name="read_market_data", input_data={})
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW


@pytest.mark.asyncio
class TestPositionLimitPolicy:
    """PositionLimitPolicy: deny when proposed size > per-agent limit."""

    async def test_allow_within_limit(self):
        from app.control_plane.risk_policy import PositionLimitPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = PositionLimitPolicy(max_position_usd=100_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"order_size_usd": 50_000},
            caller_id="execution-agent-01",
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW

    async def test_deny_when_over_limit(self):
        from app.control_plane.risk_policy import PositionLimitPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = PositionLimitPolicy(max_position_usd=100_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"order_size_usd": 150_000},
            caller_id="execution-agent-01",
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.DENY
        assert "position" in decision.reason.lower()

    async def test_allow_when_no_size(self):
        from app.control_plane.risk_policy import PositionLimitPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = PositionLimitPolicy(max_position_usd=100_000)
        ctx = PolicyContext(capability_name="read_positions", input_data=None)
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW


@pytest.mark.asyncio
class TestDailyLossPolicy:
    """DailyLossPolicy: deny when daily_loss_usd exceeds the limit."""

    async def test_allow_when_loss_within_limit(self):
        from app.control_plane.risk_policy import DailyLossPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = DailyLossPolicy(max_daily_loss_usd=10_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"daily_loss_usd": 5_000},
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW

    async def test_deny_when_loss_exceeds_limit(self):
        from app.control_plane.risk_policy import DailyLossPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = DailyLossPolicy(max_daily_loss_usd=10_000)
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"daily_loss_usd": 15_000},
        )
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.DENY
        assert "daily loss" in decision.reason.lower()

    async def test_allow_when_no_loss_key(self):
        from app.control_plane.risk_policy import DailyLossPolicy
        from akiva_policy_runtime import PolicyContext, PolicyAction

        policy = DailyLossPolicy(max_daily_loss_usd=10_000)
        ctx = PolicyContext(capability_name="read_pnl", input_data={})
        decision = await policy.evaluate(ctx)
        assert decision.action == PolicyAction.ALLOW


@pytest.mark.asyncio
class TestPolicyEngineIntegration:
    """Verify PolicyEngine composed with risk policies works end-to-end."""

    async def test_all_pass_gives_allow(self):
        from app.control_plane.risk_policy import VaRPolicy, PositionLimitPolicy, DailyLossPolicy
        from akiva_policy_runtime import PolicyEngine, PolicyContext, PolicyAction

        engine = PolicyEngine([
            VaRPolicy(max_var_usd=50_000),
            PositionLimitPolicy(max_position_usd=100_000),
            DailyLossPolicy(max_daily_loss_usd=10_000),
        ])
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"var_usd": 20_000, "order_size_usd": 30_000, "daily_loss_usd": 2_000},
        )
        result = await engine.evaluate(ctx)
        assert result.is_allowed()

    async def test_one_fail_gives_deny(self):
        from app.control_plane.risk_policy import VaRPolicy, PositionLimitPolicy, DailyLossPolicy
        from akiva_policy_runtime import PolicyEngine, PolicyContext

        engine = PolicyEngine([
            VaRPolicy(max_var_usd=50_000),
            PositionLimitPolicy(max_position_usd=100_000),
            DailyLossPolicy(max_daily_loss_usd=10_000),
        ])
        ctx = PolicyContext(
            capability_name="execute_order",
            input_data={"var_usd": 80_000, "order_size_usd": 30_000, "daily_loss_usd": 2_000},
        )
        result = await engine.evaluate(ctx)
        assert result.is_denied()

    async def test_build_default_engine_factory(self):
        """build_risk_engine() returns a configured PolicyEngine."""
        from app.control_plane.risk_policy import build_risk_engine
        from akiva_policy_runtime import PolicyEngine

        engine = build_risk_engine()
        assert isinstance(engine, PolicyEngine)


# ---------------------------------------------------------------------------
# evidence_adapter
# ---------------------------------------------------------------------------

class TestEvidenceAdapter:
    """EvidenceAdapter converts trading execution results to EvidenceRecord."""

    def test_import(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter  # noqa: F401
        assert EvidenceAdapter is not None

    def test_successful_fill_creates_success_record(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter
        from akiva_execution_contracts import EvidenceRecord

        adapter = EvidenceAdapter()
        fill = {
            "order_id": "ord-001",
            "instrument": "BTC-USD",
            "side": "buy",
            "size_usd": 50_000,
            "filled_price": 65_000.0,
            "slippage": 0.001,
            "fee": 50.0,
            "venue": "coinbase",
            "latency_ms": 45.2,
        }
        record = adapter.from_fill(fill, success=True)
        assert isinstance(record, EvidenceRecord)
        assert record.outcome == "success"
        assert record.capability_name == "execute_order"

    def test_failed_fill_creates_failure_record(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        fill = {"order_id": "ord-002", "error": "venue timeout"}
        record = adapter.from_fill(fill, success=False, error="venue timeout")
        assert record.outcome == "failure"
        assert record.error_detail == "venue timeout"

    def test_record_is_frozen(self):
        """EvidenceRecord is frozen — no mutation after creation."""
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        record = adapter.from_fill({"order_id": "ord-003"}, success=True)
        with pytest.raises(Exception):
            # Pydantic frozen model raises ValidationError or TypeError
            record.outcome = "failure"  # type: ignore[misc]

    def test_input_summary_contains_key_fields(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        fill = {
            "order_id": "ord-004",
            "instrument": "ETH-USD",
            "size_usd": 10_000,
            "venue": "kraken",
        }
        record = adapter.from_fill(fill, success=True)
        assert record.input_summary is not None
        assert record.input_summary.get("order_id") == "ord-004"

    def test_output_summary_contains_fill_metrics(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        fill = {
            "order_id": "ord-005",
            "filled_price": 3_000.0,
            "slippage": 0.002,
            "fee": 10.0,
            "latency_ms": 55.0,
        }
        record = adapter.from_fill(fill, success=True)
        assert record.output_summary is not None
        assert "filled_price" in record.output_summary

    def test_duration_ms_populated_when_latency_present(self):
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        fill = {"order_id": "ord-006", "latency_ms": 78.3}
        record = adapter.from_fill(fill, success=True)
        assert record.duration_ms == pytest.approx(78.3)

    def test_from_meta_decision_denied_creates_denied_record(self):
        """Vetoed trade intent → 'denied' outcome."""
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        decision = {
            "global_state": "halted",
            "reason_codes": ["volatility_crisis"],
            "strategy": "trend_following",
        }
        record = adapter.from_meta_decision_veto(decision)
        assert record.outcome == "denied"
        assert record.capability_name == "meta_decision_veto"

    def test_authority_evidence_field_populated(self):
        """authority_evidence carries agent_id and scope."""
        from app.control_plane.evidence_adapter import EvidenceAdapter

        adapter = EvidenceAdapter()
        fill = {"order_id": "ord-007"}
        record = adapter.from_fill(fill, success=True, agent_id="execution-agent-01")
        assert record.authority_evidence is not None
        assert record.authority_evidence.get("agent_id") == "execution-agent-01"


# ---------------------------------------------------------------------------
# control_plane module guard (ImportError path)
# ---------------------------------------------------------------------------

class TestImportGuard:
    """Verify the __init__ guard works when packages are missing."""

    def test_module_has_has_control_plane_flag(self):
        import app.control_plane as cp
        assert hasattr(cp, "_HAS_CONTROL_PLANE")

    def test_flag_is_true_when_packages_present(self):
        import app.control_plane as cp
        assert cp._HAS_CONTROL_PLANE is True
