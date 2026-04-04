"""
Comprehensive tests for trading engine core modules.

Covers:
- portfolio_engine.py  (PortfolioEngine: position sizing, tier exposure, book isolation)
- oms_execution.py     (OMSExecutionService: reducing order detection, execution plan, DataQuality)
- order_gateway.py     (OrderGateway: submit, execute, kill switch, book check, position updates)
"""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from app.models.domain import (
    Book,
    BookType,
    Order,
    OrderSide,
    OrderStatus,
    Position,
    RiskCheckResult,
    RiskDecision,
    TradeIntent,
    VenueHealth,
    VenueStatus,
)
from app.services.oms_execution import DataQuality, OMSExecutionService
from app.services.order_gateway import (
    OrderGateway,
    OrderRequest,
    OrderResult,
    OrderType,
)
from app.services.order_gateway import (
    OrderSide as GatewayOrderSide,
)
from app.services.order_gateway import (
    OrderStatus as GatewayOrderStatus,
)
from app.services.portfolio_engine import PortfolioEngine

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def _make_book(
    book_type=BookType.PROP,
    capital=1_000_000,
    exposure=200_000,
    risk_tier=1,
    status="active",
    **overrides,
):
    defaults = dict(
        id=uuid4(),
        name=f"Test-{book_type.value}",
        type=book_type,
        capital_allocated=capital,
        current_exposure=exposure,
        max_drawdown_limit=10,
        risk_tier=risk_tier,
        status=status,
    )
    defaults.update(overrides)
    return Book(**defaults)


def _make_intent(book_id=None, target_exposure=50_000, direction=OrderSide.BUY, **kw):
    defaults = dict(
        id=uuid4(),
        book_id=book_id or uuid4(),
        strategy_id=uuid4(),
        instrument="BTC-USD",
        direction=direction,
        target_exposure_usd=target_exposure,
        max_loss_usd=2_500,
        confidence=0.8,
    )
    defaults.update(kw)
    return TradeIntent(**defaults)


def _make_position(
    book_id=None,
    instrument="BTC-USD",
    side=OrderSide.BUY,
    size=1.0,
    entry_price=50_000,
    mark_price=51_000,
    is_open=True,
    **kw,
):
    defaults = dict(
        id=uuid4(),
        book_id=book_id or uuid4(),
        instrument=instrument,
        side=side,
        size=size,
        entry_price=entry_price,
        mark_price=mark_price,
        is_open=is_open,
    )
    defaults.update(kw)
    return Position(**defaults)


# =========================================================================
# PortfolioEngine tests
# =========================================================================


class TestPortfolioEngine:
    """Tests for PortfolioEngine.calculate_position_size and helpers."""

    @pytest.fixture
    def engine(self):
        return PortfolioEngine()

    # -- calculate_position_size -----------------------------------------

    def test_hedge_book_volatility_targeting(self, engine):
        """HEDGE book applies vol scaling: target_vol / realized_vol, capped at 1.5x."""
        book = _make_book(BookType.HEDGE, capital=1_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        # target_vol = 0.10, realized = 0.20 -> scalar = 0.5
        size = engine.calculate_position_size(intent, book, [], volatility=0.20)
        assert size == pytest.approx(25_000)  # 50k * 0.5

    def test_prop_book_basic_sizing_no_vol_targeting(self, engine):
        """PROP book uses target_vol=0.25 but if no volatility arg, no scaling."""
        book = _make_book(BookType.PROP, capital=1_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        size = engine.calculate_position_size(intent, book, [], volatility=None)
        assert size == 50_000  # No scaling applied

    def test_meme_book_constraints(self, engine):
        """MEME book: max_leverage=1.0, max_single_position=10% of capital."""
        book = _make_book(BookType.MEME, capital=500_000, risk_tier=1)
        # target_exposure larger than 10% of 500k = 50k
        intent = _make_intent(book_id=book.id, target_exposure=100_000)

        size = engine.calculate_position_size(intent, book, [])
        assert size == 50_000  # capped at max_single_position (500k * 0.10)

    def test_position_size_capped_by_max_position_constraint(self, engine):
        """Position size must not exceed book capital * max_single_position."""
        book = _make_book(BookType.PROP, capital=1_000_000, risk_tier=1)
        # max_single_position for PROP = 0.20 -> 200k
        intent = _make_intent(book_id=book.id, target_exposure=300_000)

        size = engine.calculate_position_size(intent, book, [])
        assert size <= 200_000

    def test_position_size_capped_by_available_capital(self, engine):
        """Position size limited by (tier_capital - tier_exposure)."""
        book = _make_book(BookType.PROP, capital=1_000_000, risk_tier=1)
        # tier 1 weight = 0.60, tier_capital = 600k
        # Create positions that consume 590k of tier exposure
        positions = [
            _make_position(book_id=book.id, size=11.8, mark_price=50_000, is_open=True),
        ]
        # tier_exposure = 11.8 * 50000 = 590000, available = 600k - 590k = 10k
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        size = engine.calculate_position_size(intent, book, positions)
        assert size == pytest.approx(10_000)

    @patch("app.services.portfolio_engine.settings")
    def test_position_size_capped_by_settings_max(self, mock_settings, engine):
        """Position size capped by settings.risk.max_position_size_usd."""
        mock_settings.risk.max_position_size_usd = 30_000
        book = _make_book(BookType.PROP, capital=10_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=100_000)

        size = engine.calculate_position_size(intent, book, [])
        assert size == 30_000

    def test_position_size_never_goes_negative(self, engine):
        """When tier exposure exceeds tier capital, result must be 0 (not negative)."""
        book = _make_book(BookType.PROP, capital=100_000, risk_tier=1)
        # tier_capital = 100k * 0.60 = 60k, exposure = 70k -> available = -10k
        positions = [
            _make_position(book_id=book.id, size=1.4, mark_price=50_000, is_open=True),
        ]
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        size = engine.calculate_position_size(intent, book, positions)
        assert size == 0

    def test_tier_weight_selection(self, engine):
        """Verify tier weights: tier1=0.60, tier2=0.30, tier3=0.10."""
        assert engine.TIER_WEIGHTS[1] == 0.60
        assert engine.TIER_WEIGHTS[2] == 0.30
        assert engine.TIER_WEIGHTS[3] == 0.10

        # Tier 2 book with small request
        book = _make_book(BookType.PROP, capital=1_000_000, risk_tier=2)
        intent = _make_intent(book_id=book.id, target_exposure=10_000)
        size = engine.calculate_position_size(intent, book, [])
        # tier_capital = 1M * 0.30 = 300k, available = 300k -> intent fits
        assert size == 10_000

    def test_unknown_book_type_falls_back_to_prop(self, engine):
        """Unrecognised book type falls back to PROP constraints via .get() default."""
        book = _make_book(BookType.PROP, capital=1_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        # Patch BookType() conversion to return a sentinel that isn't in
        # BOOK_CONSTRAINTS, triggering the .get() fallback to PROP defaults.
        with patch("app.services.portfolio_engine.BookType") as mock_bt:
            sentinel = "unknown_type"
            mock_bt.side_effect = lambda v: sentinel
            mock_bt.PROP = BookType.PROP  # fallback key must still resolve
            size = engine.calculate_position_size(intent, book, [])
            # Should succeed using PROP constraints (max_single_position=0.20 -> 200k)
            assert size == 50_000

    def test_volatility_scalar_capped_at_1_5x(self, engine):
        """Vol scalar = target_vol / realized_vol, but never exceeds 1.5."""
        book = _make_book(BookType.HEDGE, capital=1_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=50_000)

        # target_vol = 0.10, realized = 0.01 -> raw scalar = 10.0, capped to 1.5
        size = engine.calculate_position_size(intent, book, [], volatility=0.01)
        assert size == pytest.approx(75_000)  # 50k * 1.5

    def test_hedge_vol_scalar_below_one(self, engine):
        """Vol scalar below 1.0 reduces the position size."""
        book = _make_book(BookType.HEDGE, capital=1_000_000, risk_tier=1)
        intent = _make_intent(book_id=book.id, target_exposure=100_000)
        # target_vol=0.10, vol=0.40 -> scalar=0.25
        size = engine.calculate_position_size(intent, book, [], volatility=0.40)
        assert size == pytest.approx(25_000)  # 100k * 0.25

    # -- _get_tier_exposure -----------------------------------------------

    def test_get_tier_exposure_sums_open_positions(self, engine):
        """Sums size*mark_price for open positions only."""
        bid = uuid4()
        positions = [
            _make_position(book_id=bid, size=1.0, mark_price=50_000, is_open=True),
            _make_position(book_id=bid, size=0.5, mark_price=60_000, is_open=True),
        ]
        exposure = engine._get_tier_exposure(positions, tier=1)
        assert exposure == pytest.approx(80_000)  # 50k + 30k

    def test_get_tier_exposure_empty_positions(self, engine):
        """Empty list returns 0."""
        assert engine._get_tier_exposure([], tier=1) == 0

    def test_get_tier_exposure_excludes_closed(self, engine):
        """Closed positions (is_open=False) are excluded."""
        bid = uuid4()
        positions = [
            _make_position(book_id=bid, size=1.0, mark_price=50_000, is_open=True),
            _make_position(book_id=bid, size=2.0, mark_price=50_000, is_open=False),
        ]
        exposure = engine._get_tier_exposure(positions, tier=1)
        assert exposure == pytest.approx(50_000)

    # -- validate_book_isolation ------------------------------------------

    def test_meme_to_prop_blocked(self, engine):
        """MEME -> PROP cross-book transfer is blocked."""
        meme_book = _make_book(BookType.MEME)
        prop_book = _make_book(BookType.PROP)
        assert engine.validate_book_isolation(meme_book, prop_book) is False

    def test_prop_to_meme_blocked(self, engine):
        """PROP -> MEME cross-book transfer is blocked."""
        prop_book = _make_book(BookType.PROP)
        meme_book = _make_book(BookType.MEME)
        assert engine.validate_book_isolation(prop_book, meme_book) is False

    def test_meme_to_meme_same_book_allowed(self, engine):
        """Same MEME book (same id) is allowed."""
        meme_book = _make_book(BookType.MEME)
        assert engine.validate_book_isolation(meme_book, meme_book) is True

    def test_prop_to_hedge_allowed(self, engine):
        """PROP -> HEDGE (neither is MEME) is allowed."""
        prop_book = _make_book(BookType.PROP)
        hedge_book = _make_book(BookType.HEDGE)
        assert engine.validate_book_isolation(prop_book, hedge_book) is True


# =========================================================================
# OMS Execution Service tests
# =========================================================================


class TestOMSReducingOrder:
    """Tests for OMSExecutionService._is_reducing_order."""

    @pytest.fixture
    def oms(self):
        with (
            patch("app.services.oms_execution.EdgeCostModel"),
            patch("app.services.oms_execution.ExecutionPlanner"),
        ):
            return OMSExecutionService()

    def test_buy_position_sell_intent_is_reducing(self, oms):
        """Selling against an existing BUY position is reducing."""
        positions = [
            _make_position(instrument="BTC-USD", side=OrderSide.BUY),
        ]
        intent = _make_intent(direction=OrderSide.SELL, instrument="BTC-USD")
        assert oms._is_reducing_order(intent, positions) is True

    def test_buy_position_buy_intent_not_reducing(self, oms):
        """Buying more of an existing BUY position is NOT reducing."""
        positions = [
            _make_position(instrument="BTC-USD", side=OrderSide.BUY),
        ]
        intent = _make_intent(direction=OrderSide.BUY, instrument="BTC-USD")
        assert oms._is_reducing_order(intent, positions) is False

    def test_no_matching_position_not_reducing(self, oms):
        """No position for the instrument -> not reducing."""
        positions = [
            _make_position(instrument="ETH-USD", side=OrderSide.BUY),
        ]
        intent = _make_intent(direction=OrderSide.SELL, instrument="BTC-USD")
        assert oms._is_reducing_order(intent, positions) is False

    def test_sell_position_buy_intent_is_reducing(self, oms):
        """Buying against an existing SELL position is reducing."""
        positions = [
            _make_position(instrument="BTC-USD", side=OrderSide.SELL),
        ]
        intent = _make_intent(direction=OrderSide.BUY, instrument="BTC-USD")
        assert oms._is_reducing_order(intent, positions) is True

    def test_empty_positions_not_reducing(self, oms):
        """Empty position list is never reducing."""
        intent = _make_intent(direction=OrderSide.SELL, instrument="BTC-USD")
        assert oms._is_reducing_order(intent, []) is False


class TestOMSResolveExecutionPlan:
    """Tests for OMSExecutionService._resolve_execution_plan."""

    @pytest.fixture
    def oms(self):
        with (
            patch("app.services.oms_execution.EdgeCostModel"),
            patch("app.services.oms_execution.ExecutionPlanner"),
        ):
            return OMSExecutionService()

    def test_returns_none_when_no_execution_plan(self, oms):
        """No 'execution_plan' key in metadata -> returns None."""
        intent = _make_intent(metadata={})
        assert oms._resolve_execution_plan(intent) is None

    def test_returns_none_with_none_metadata(self, oms):
        """None metadata -> returns None."""
        intent = _make_intent()
        intent.metadata = None
        assert oms._resolve_execution_plan(intent) is None

    def test_returns_execution_plan_when_valid(self, oms):
        """Valid execution_plan dict in metadata -> returns ExecutionPlan."""
        plan_data = {
            "legs": [
                {
                    "venue": "coinbase",
                    "instrument": "BTC-USD",
                    "side": "buy",
                    "size": 1.0,
                }
            ],
            "mode": "legged",
        }
        intent = _make_intent(metadata={"execution_plan": plan_data})
        result = oms._resolve_execution_plan(intent)
        assert result is not None
        assert len(result.legs) == 1
        assert result.legs[0].venue == "coinbase"

    def test_returns_none_on_invalid_plan_data(self, oms):
        """Malformed execution_plan dict -> logs warning, returns None."""
        intent = _make_intent(metadata={"execution_plan": {"invalid": True}})
        result = oms._resolve_execution_plan(intent)
        assert result is None


class TestDataQuality:
    """Tests for DataQuality enum values."""

    def test_realtime_value(self):
        assert DataQuality.REALTIME == "realtime"

    def test_delayed_value(self):
        assert DataQuality.DELAYED == "delayed"

    def test_derived_value(self):
        assert DataQuality.DERIVED == "derived"

    def test_simulated_value(self):
        assert DataQuality.SIMULATED == "simulated"

    def test_unavailable_value(self):
        assert DataQuality.UNAVAILABLE == "unavailable"


# =========================================================================
# OrderGateway tests
# =========================================================================


class TestOrderGateway:
    """Tests for OrderGateway submit/execute/position flows."""

    @pytest.fixture
    def gateway(self):
        gw = OrderGateway()
        gw._initialized = True
        gw._http_client = AsyncMock(spec=["get", "post", "patch", "aclose"])
        gw._supabase_url = "http://test-supabase"
        gw._supabase_key = "test-key"
        return gw

    @pytest.fixture
    def sample_order(self):
        return OrderRequest(
            book_id=uuid4(),
            strategy_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.BUY,
            size=Decimal("0.5"),
            price=Decimal("50000"),
            order_type=OrderType.MARKET,
        )

    # -- submit_order: kill switch ----------------------------------------

    @pytest.mark.asyncio
    async def test_submit_order_rejects_when_kill_switch_active(
        self, gateway, sample_order
    ):
        """Kill switch active -> order rejected."""

        async def _kill_switch_active():
            return True

        gateway._check_kill_switch = _kill_switch_active

        result = await gateway.submit_order(sample_order)
        assert result.success is False
        assert result.status == GatewayOrderStatus.REJECTED
        assert "kill switch" in result.error.lower()

    # -- submit_order: book not active ------------------------------------

    @pytest.mark.asyncio
    async def test_submit_order_rejects_when_book_not_active(
        self, gateway, sample_order
    ):
        """Inactive book -> order rejected."""

        async def _no_kill():
            return False

        async def _book_not_active(book_id):
            return False

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_not_active

        result = await gateway.submit_order(sample_order)
        assert result.success is False
        assert result.status == GatewayOrderStatus.REJECTED
        assert "book" in result.error.lower()

    # -- submit_order: happy path (pending) --------------------------------

    @pytest.mark.asyncio
    async def test_submit_order_happy_path(self, gateway, sample_order):
        """Happy path produces PENDING order."""

        async def _no_kill():
            return False

        async def _book_active(book_id):
            return True

        async def _write_order(order, result):
            return True

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_active
        gateway._write_order = _write_order
        gateway._log_audit_event = AsyncMock()

        result = await gateway.submit_order(sample_order)
        assert result.success is True
        assert result.status == GatewayOrderStatus.PENDING
        assert result.order_id is not None

    # -- submit_order: database write failure ------------------------------

    @pytest.mark.asyncio
    async def test_submit_order_db_write_failure(self, gateway, sample_order):
        """Database write failure -> rejected."""

        async def _no_kill():
            return False

        async def _book_active(book_id):
            return True

        async def _write_fails(order, result):
            return False

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_active
        gateway._write_order = _write_fails

        result = await gateway.submit_order(sample_order)
        assert result.success is False
        assert "database" in result.error.lower()

    # -- submit_and_execute: successful execution -------------------------

    @pytest.mark.asyncio
    async def test_submit_and_execute_success(self, gateway, sample_order):
        """Successful venue execution returns filled order."""

        async def _no_kill():
            return False

        async def _book_active(book_id):
            return True

        async def _execute_fn(order):
            return (order.size, Decimal("50100"), "venue-123")

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_active
        gateway._write_order = AsyncMock(return_value=True)
        gateway._update_position = AsyncMock()
        gateway._log_audit_event = AsyncMock()

        result = await gateway.submit_and_execute(sample_order, _execute_fn)
        assert result.success is True
        assert result.status == GatewayOrderStatus.FILLED
        assert result.filled_price == Decimal("50100")
        assert result.venue_order_id == "venue-123"

    # -- submit_and_execute: partial fill ---------------------------------

    @pytest.mark.asyncio
    async def test_submit_and_execute_partial_fill(self, gateway, sample_order):
        """Partial fill returns PARTIALLY_FILLED status."""

        async def _no_kill():
            return False

        async def _book_active(book_id):
            return True

        async def _execute_fn(order):
            return (Decimal("0.3"), Decimal("50050"), "venue-456")

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_active
        gateway._write_order = AsyncMock(return_value=True)
        gateway._update_position = AsyncMock()
        gateway._log_audit_event = AsyncMock()

        result = await gateway.submit_and_execute(sample_order, _execute_fn)
        assert result.success is True
        assert result.status == GatewayOrderStatus.PARTIALLY_FILLED
        assert result.filled_size == Decimal("0.3")

    # -- submit_and_execute: execution failure ----------------------------

    @pytest.mark.asyncio
    async def test_submit_and_execute_failure(self, gateway, sample_order):
        """Venue execution failure -> rejected with error message."""

        async def _no_kill():
            return False

        async def _book_active(book_id):
            return True

        async def _execute_fn(order):
            raise ConnectionError("Venue unreachable")

        gateway._check_kill_switch = _no_kill
        gateway._check_book_active = _book_active
        gateway._write_order = AsyncMock(return_value=True)
        gateway._update_position = AsyncMock()
        gateway._log_audit_event = AsyncMock()

        result = await gateway.submit_and_execute(sample_order, _execute_fn)
        assert result.success is False
        assert result.status == GatewayOrderStatus.REJECTED
        assert "Venue unreachable" in result.error

    # -- _check_kill_switch -----------------------------------------------

    @pytest.mark.asyncio
    async def test_check_kill_switch_returns_true_when_active(self, gateway):
        """Kill switch active in DB -> returns True."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"global_kill_switch": True}]
        gateway._http_client.get = AsyncMock(return_value=mock_response)

        result = await gateway._check_kill_switch()
        assert result is True

    @pytest.mark.asyncio
    async def test_check_kill_switch_returns_false_when_inactive(self, gateway):
        """Kill switch inactive in DB -> returns False."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"global_kill_switch": False}]
        gateway._http_client.get = AsyncMock(return_value=mock_response)

        result = await gateway._check_kill_switch()
        assert result is False

    @pytest.mark.asyncio
    async def test_check_kill_switch_fails_safe_on_error(self, gateway):
        """Network error -> fail safe (returns True = blocked)."""
        gateway._http_client.get = AsyncMock(side_effect=ConnectionError("timeout"))

        result = await gateway._check_kill_switch()
        assert result is True  # Fail safe

    @pytest.mark.asyncio
    async def test_check_kill_switch_no_client(self):
        """No http client -> fail safe (returns True)."""
        gw = OrderGateway()
        gw._http_client = None
        result = await gw._check_kill_switch()
        assert result is True

    # -- _check_book_active -----------------------------------------------

    @pytest.mark.asyncio
    async def test_check_book_active_returns_true(self, gateway):
        """Active book -> returns True."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"status": "active"}]
        gateway._http_client.get = AsyncMock(return_value=mock_response)

        result = await gateway._check_book_active(uuid4())
        assert result is True

    @pytest.mark.asyncio
    async def test_check_book_active_returns_false_when_frozen(self, gateway):
        """Frozen book -> returns False."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{"status": "frozen"}]
        gateway._http_client.get = AsyncMock(return_value=mock_response)

        result = await gateway._check_book_active(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_check_book_active_no_client(self):
        """No http client -> returns False."""
        gw = OrderGateway()
        gw._http_client = None
        result = await gw._check_book_active(uuid4())
        assert result is False

    # -- _update_position -------------------------------------------------

    @pytest.mark.asyncio
    async def test_update_position_creates_new_when_none_exists(self, gateway):
        """No existing position -> creates a new one via POST."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.BUY,
            size=Decimal("1.0"),
        )
        result = OrderResult(
            success=True,
            order_id=uuid4(),
            status=GatewayOrderStatus.FILLED,
            filled_size=Decimal("1.0"),
            filled_price=Decimal("50000"),
        )

        # GET returns no existing positions
        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = []

        # POST for new position
        post_response = MagicMock()
        post_response.status_code = 201

        gateway._http_client.get = AsyncMock(return_value=get_response)
        gateway._http_client.post = AsyncMock(return_value=post_response)

        await gateway._update_position(order, result)

        gateway._http_client.post.assert_called_once()
        call_json = gateway._http_client.post.call_args.kwargs["json"]
        assert call_json["instrument"] == "BTC-USD"
        assert call_json["side"] == "buy"
        assert call_json["size"] == 1.0
        assert call_json["is_open"] is True

    @pytest.mark.asyncio
    async def test_update_position_adds_to_existing_same_side(self, gateway):
        """Same side -> adds to existing position (weighted avg entry)."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.BUY,
            size=Decimal("0.5"),
        )
        result = OrderResult(
            success=True,
            order_id=uuid4(),
            status=GatewayOrderStatus.FILLED,
            filled_size=Decimal("0.5"),
            filled_price=Decimal("52000"),
        )

        existing_position = {
            "id": str(uuid4()),
            "size": "1.0",
            "side": "buy",
            "entry_price": "50000",
        }

        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = [existing_position]

        patch_response = MagicMock()
        patch_response.status_code = 200

        gateway._http_client.get = AsyncMock(return_value=get_response)
        gateway._http_client.patch = AsyncMock(return_value=patch_response)

        await gateway._update_position(order, result)

        gateway._http_client.patch.assert_called_once()
        call_json = gateway._http_client.patch.call_args.kwargs["json"]
        assert call_json["size"] == pytest.approx(1.5)  # 1.0 + 0.5
        # Weighted avg: (1.0*50000 + 0.5*52000) / 1.5 = 76000/1.5 ~ 50666.67
        assert call_json["entry_price"] == pytest.approx(50666.67, rel=0.01)

    @pytest.mark.asyncio
    async def test_update_position_reduces_existing_opposite_side(self, gateway):
        """Opposite side with smaller fill -> reduces position."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.SELL,
            size=Decimal("0.3"),
        )
        result = OrderResult(
            success=True,
            order_id=uuid4(),
            status=GatewayOrderStatus.FILLED,
            filled_size=Decimal("0.3"),
            filled_price=Decimal("51000"),
        )

        existing_position = {
            "id": str(uuid4()),
            "size": "1.0",
            "side": "buy",
            "entry_price": "50000",
        }

        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = [existing_position]

        patch_response = MagicMock()
        patch_response.status_code = 200

        gateway._http_client.get = AsyncMock(return_value=get_response)
        gateway._http_client.patch = AsyncMock(return_value=patch_response)

        await gateway._update_position(order, result)

        gateway._http_client.patch.assert_called_once()
        call_json = gateway._http_client.patch.call_args.kwargs["json"]
        assert call_json["size"] == pytest.approx(0.7)  # 1.0 - 0.3

    @pytest.mark.asyncio
    async def test_update_position_closes_when_reduced_to_zero(self, gateway):
        """Opposite side fill >= position size -> closes position."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.SELL,
            size=Decimal("1.0"),
        )
        result = OrderResult(
            success=True,
            order_id=uuid4(),
            status=GatewayOrderStatus.FILLED,
            filled_size=Decimal("1.0"),
            filled_price=Decimal("51000"),
        )

        existing_position = {
            "id": str(uuid4()),
            "size": "1.0",
            "side": "buy",
            "entry_price": "50000",
        }

        get_response = MagicMock()
        get_response.status_code = 200
        get_response.json.return_value = [existing_position]

        patch_response = MagicMock()
        patch_response.status_code = 200

        gateway._http_client.get = AsyncMock(return_value=get_response)
        gateway._http_client.patch = AsyncMock(return_value=patch_response)

        await gateway._update_position(order, result)

        gateway._http_client.patch.assert_called_once()
        call_json = gateway._http_client.patch.call_args.kwargs["json"]
        assert call_json["is_open"] is False
        assert call_json["size"] == 0

    @pytest.mark.asyncio
    async def test_update_position_skips_when_not_successful(self, gateway):
        """Failed order result -> no position update."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.BUY,
            size=Decimal("1.0"),
        )
        result = OrderResult(
            success=False,
            order_id=uuid4(),
            status=GatewayOrderStatus.REJECTED,
            error="rejected",
        )

        gateway._http_client.get = AsyncMock()
        gateway._http_client.post = AsyncMock()

        await gateway._update_position(order, result)

        # No HTTP calls should have been made
        gateway._http_client.get.assert_not_called()
        gateway._http_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_update_position_skips_when_zero_fill(self, gateway):
        """Zero filled_size -> no position update."""
        order = OrderRequest(
            book_id=uuid4(),
            instrument="BTC-USD",
            side=GatewayOrderSide.BUY,
            size=Decimal("1.0"),
        )
        result = OrderResult(
            success=True,
            order_id=uuid4(),
            status=GatewayOrderStatus.PENDING,
            filled_size=Decimal("0"),
        )

        gateway._http_client.get = AsyncMock()

        await gateway._update_position(order, result)

        gateway._http_client.get.assert_not_called()
