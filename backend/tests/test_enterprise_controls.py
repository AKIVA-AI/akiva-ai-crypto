from datetime import UTC, datetime, timedelta

from app.enterprise.compliance import (
    ComplianceManager,
    ComplianceRule,
    ComplianceRuleType,
)
from app.enterprise.rbac import Permission, RBACManager
from app.enterprise.risk_limits import (
    LimitPeriod,
    LimitType,
    RiskLimit,
    RiskLimitsManager,
)


def test_rbac_role_assignment_permissions_and_limits():
    manager = RBACManager()

    assert manager.get_user_role("missing").name == "viewer"
    assert manager.assign_role("u1", "not-a-role") is False
    assert manager.assign_role("u1", "trader") is True
    assert manager.has_permission("u1", Permission.TRADE_CREATE) is True
    assert manager.has_permission("u1", Permission.KILL_SWITCH) is False

    allowed, message = manager.check_trade_limits(
        "u1", trade_size=5000, daily_volume=1000
    )
    assert allowed is True
    assert message == "OK"

    allowed, message = manager.check_trade_limits(
        "u1", trade_size=20000, daily_volume=1000
    )
    assert allowed is False
    assert "exceeds limit" in message


def test_rbac_custom_permissions_and_revoke():
    manager = RBACManager()
    manager.assign_role("u2", "viewer")

    assert manager.has_permission("u2", Permission.KILL_SWITCH) is False

    manager.grant_permission("u2", Permission.KILL_SWITCH)
    assert manager.has_permission("u2", Permission.KILL_SWITCH) is True
    assert Permission.KILL_SWITCH in manager.get_all_permissions("u2")

    manager.revoke_permission("u2", Permission.KILL_SWITCH)
    assert manager.has_permission("u2", Permission.KILL_SWITCH) is False


def test_risk_limits_record_blocking_and_warning_breaches():
    manager = RiskLimitsManager()

    within_limit, message = manager.check_limit("daily_loss", 1000)
    assert within_limit is True
    assert message == "OK"

    within_limit, message = manager.check_limit(
        "daily_loss", 60000, user_id="risk-user"
    )
    assert within_limit is False
    assert "daily_loss" in message

    manager.add_limit(
        RiskLimit(
            limit_id="warn_limit",
            limit_type=LimitType.VELOCITY,
            period=LimitPeriod.ROLLING,
            max_value=1,
            breach_action="warn",
        )
    )
    within_limit, message = manager.check_limit("warn_limit", 2)
    assert within_limit is True
    assert "warn_limit" in message

    breaches = manager.get_recent_breaches()
    assert len(breaches) == 2
    assert breaches[0]["user_id"] == "risk-user"


def test_risk_limits_status_update_and_recent_breach_filter():
    manager = RiskLimitsManager()
    manager.update_limit("max_position", 250000)
    status = manager.get_limit_status()
    assert status["max_position"]["max"] == 250000

    manager._breaches.append(
        {
            "limit_id": "old_limit",
            "limit_type": "loss",
            "max_value": 10,
            "actual_value": 20,
            "user_id": None,
            "timestamp": (datetime.now(UTC) - timedelta(hours=48)).isoformat(),
            "action": "block",
        }
    )
    assert manager.get_recent_breaches(hours=1) == []


def test_compliance_manager_blocks_restricted_assets_and_position_limits():
    manager = ComplianceManager()
    manager.restrict_asset("btc", "manual freeze")
    allowed, violations = manager.check_trade(
        "BTC", "buy", 1, 50000, portfolio_value=200000
    )
    assert allowed is False
    assert "restricted" in violations[0]

    manager.unrestrict_asset("BTC")
    manager.set_position_limit("ETH", 1000)
    allowed, violations = manager.check_trade(
        "ETH",
        "buy",
        quantity=1,
        price=2000,
        current_position=0,
        portfolio_value=100000,
    )
    assert allowed is False
    assert "Position limit exceeded" in violations[0]


def test_compliance_manager_concentration_warning_and_block_modes():
    manager = ComplianceManager()
    allowed, violations = manager.check_trade(
        "SOL",
        "buy",
        quantity=100,
        price=400,
        portfolio_value=100000,
    )
    assert allowed is True
    assert violations == ["Concentration limit: 40.0% > 30.0%"]

    manager.remove_rule("concentration_limit")
    manager.add_rule(
        ComplianceRule(
            rule_id="concentration_limit",
            rule_type=ComplianceRuleType.CONCENTRATION,
            name="Portfolio Concentration Limit",
            description="Block concentrated positions",
            parameters={"max_pct": 10.0},
            severity="block",
        )
    )
    allowed, violations = manager.check_trade(
        "SOL",
        "buy",
        quantity=100,
        price=200,
        portfolio_value=100000,
    )
    assert allowed is False
    assert "Concentration limit" in violations[0]
