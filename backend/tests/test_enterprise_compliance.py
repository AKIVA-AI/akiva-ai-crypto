"""
Tests for enterprise compliance management (D19).
"""

from app.enterprise.compliance import (
    ComplianceManager,
    ComplianceRule,
    ComplianceRuleType,
)


class TestComplianceManagerInit:
    def test_initializes_default_rules(self):
        cm = ComplianceManager()
        assert "max_position_size" in cm._rules
        assert "concentration_limit" in cm._rules
        assert "trading_hours" in cm._rules

    def test_default_rule_types(self):
        cm = ComplianceManager()
        assert (
            cm._rules["max_position_size"].rule_type
            == ComplianceRuleType.POSITION_LIMIT
        )
        assert (
            cm._rules["concentration_limit"].rule_type
            == ComplianceRuleType.CONCENTRATION
        )
        assert (
            cm._rules["trading_hours"].rule_type == ComplianceRuleType.TIME_RESTRICTION
        )

    def test_trading_hours_disabled_by_default(self):
        cm = ComplianceManager()
        assert cm._rules["trading_hours"].enabled is False


class TestCheckTradeRestrictedAssets:
    def test_blocks_restricted_asset(self):
        cm = ComplianceManager()
        cm.restrict_asset("XRP", "regulatory concern")
        ok, violations = cm.check_trade("XRP", "buy", 100, 0.5)
        assert ok is False
        assert any("restricted" in v.lower() for v in violations)

    def test_case_insensitive_restriction(self):
        cm = ComplianceManager()
        cm.restrict_asset("xrp")
        ok, violations = cm.check_trade("XRP", "buy", 100, 0.5)
        assert ok is False

    def test_unrestricted_asset_allowed(self):
        cm = ComplianceManager()
        ok, violations = cm.check_trade("BTC", "buy", 1, 50_000)
        assert ok is True
        assert len(violations) == 0


class TestCheckTradePositionLimits:
    def test_blocks_when_position_limit_exceeded(self):
        cm = ComplianceManager()
        cm.set_position_limit("ETH", 100_000)
        ok, violations = cm.check_trade("ETH", "buy", 100, 2_000, current_position=0)
        # 100 * 2000 = $200k > $100k limit
        assert ok is False
        assert any("Position limit" in v for v in violations)

    def test_allows_within_position_limit(self):
        cm = ComplianceManager()
        cm.set_position_limit("ETH", 100_000)
        ok, violations = cm.check_trade("ETH", "buy", 10, 2_000, current_position=0)
        # 10 * 2000 = $20k < $100k limit
        assert ok is True

    def test_sell_side_reduces_position(self):
        cm = ComplianceManager()
        cm.set_position_limit("BTC", 100_000)
        # Current position is 3 BTC; selling 1 leaves 2 BTC
        ok, violations = cm.check_trade("BTC", "sell", 1, 40_000, current_position=3)
        # new_position = 3 - 1 = 2; abs(2 * 40000) = 80k < 100k
        assert ok is True


class TestCheckTradeConcentration:
    def test_warns_on_concentration(self):
        cm = ComplianceManager()
        ok, violations = cm.check_trade(
            "BTC", "buy", 1, 50_000, portfolio_value=100_000
        )
        # 50% > 30% default limit
        assert ok is True  # severity is "warning", not "block"
        assert len(violations) > 0
        assert any("Concentration" in v for v in violations)

    def test_no_warning_below_threshold(self):
        cm = ComplianceManager()
        ok, violations = cm.check_trade(
            "BTC", "buy", 1, 10_000, portfolio_value=100_000
        )
        # 10% < 30% default
        assert ok is True
        assert len(violations) == 0

    def test_blocks_when_concentration_severity_is_block(self):
        cm = ComplianceManager()
        cm.remove_rule("concentration_limit")
        cm.add_rule(
            ComplianceRule(
                rule_id="concentration_limit",
                rule_type=ComplianceRuleType.CONCENTRATION,
                name="Strict Concentration",
                description="Block concentrated positions",
                parameters={"max_pct": 10.0},
                severity="block",
            )
        )
        ok, violations = cm.check_trade(
            "BTC", "buy", 1, 20_000, portfolio_value=100_000
        )
        # 20% > 10% with block severity
        assert ok is False
        assert any("Concentration" in v for v in violations)

    def test_no_check_when_portfolio_value_zero(self):
        cm = ComplianceManager()
        ok, violations = cm.check_trade("BTC", "buy", 1, 50_000, portfolio_value=0)
        assert ok is True
        assert len(violations) == 0


class TestRestrictAndUnrestrictAsset:
    def test_restrict_then_unrestrict(self):
        cm = ComplianceManager()
        cm.restrict_asset("DOGE")
        ok, _ = cm.check_trade("DOGE", "buy", 100, 0.1)
        assert ok is False

        cm.unrestrict_asset("DOGE")
        ok, _ = cm.check_trade("DOGE", "buy", 100, 0.1)
        assert ok is True

    def test_unrestrict_nonexistent_is_safe(self):
        cm = ComplianceManager()
        # Should not raise
        cm.unrestrict_asset("NEVER_RESTRICTED")

    def test_restrict_stores_uppercase(self):
        cm = ComplianceManager()
        cm.restrict_asset("sol")
        assert "SOL" in cm._restricted_assets


class TestSetPositionLimit:
    def test_enforcement(self):
        cm = ComplianceManager()
        cm.set_position_limit("BTC", 500_000)
        ok, violations = cm.check_trade("BTC", "buy", 20, 30_000, current_position=0)
        # 20 * 30000 = $600k > $500k
        assert ok is False

    def test_stores_uppercase(self):
        cm = ComplianceManager()
        cm.set_position_limit("btc", 100_000)
        assert "BTC" in cm._position_limits


class TestAddAndRemoveRule:
    def test_add_rule(self):
        cm = ComplianceManager()
        custom = ComplianceRule(
            rule_id="custom_rule",
            rule_type=ComplianceRuleType.JURISDICTION,
            name="Jurisdiction Block",
            description="Block certain jurisdictions",
            parameters={"blocked": ["CN"]},
            severity="block",
        )
        cm.add_rule(custom)
        assert "custom_rule" in cm._rules
        assert cm._rules["custom_rule"].name == "Jurisdiction Block"

    def test_remove_rule(self):
        cm = ComplianceManager()
        assert "max_position_size" in cm._rules
        cm.remove_rule("max_position_size")
        assert "max_position_size" not in cm._rules

    def test_remove_nonexistent_rule_is_safe(self):
        cm = ComplianceManager()
        # Should not raise
        cm.remove_rule("does_not_exist")

    def test_add_rule_overwrites_existing(self):
        cm = ComplianceManager()
        replacement = ComplianceRule(
            rule_id="concentration_limit",
            rule_type=ComplianceRuleType.CONCENTRATION,
            name="Replaced",
            description="Replaced concentration rule",
            parameters={"max_pct": 50.0},
        )
        cm.add_rule(replacement)
        assert cm._rules["concentration_limit"].name == "Replaced"
        assert cm._rules["concentration_limit"].parameters["max_pct"] == 50.0


class TestMultipleViolations:
    def test_restricted_and_position_limit_combined(self):
        cm = ComplianceManager()
        cm.restrict_asset("ETH")
        cm.set_position_limit("ETH", 1_000)
        ok, violations = cm.check_trade("ETH", "buy", 100, 50, current_position=0)
        # 100 * 50 = $5000 > $1000 limit AND asset is restricted
        assert ok is False
        assert len(violations) == 2
