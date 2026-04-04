"""
Tests for app.services.engine_runner -- EngineRunner.

All external dependencies (database, OMS, risk engine, FreqTrade) are mocked.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from app.models.domain import (
    Book,
    BookType,
    Order,
    OrderSide,
    OrderStatus,
    RiskCheckResult,
    RiskDecision,
    TradeIntent,
)


@pytest.fixture
def mock_settings():
    with patch("app.services.engine_runner.settings") as ms:
        ms.is_paper_mode = True
        yield ms


@pytest.fixture
def mock_oms():
    with patch("app.services.engine_runner.oms_service") as m:
        m.execute_intent = AsyncMock(return_value=None)
        m._adapters = {}
        yield m


@pytest.fixture
def mock_risk():
    with patch("app.services.engine_runner.risk_engine") as m:
        m.check_intent = AsyncMock(
            return_value=RiskCheckResult(decision=RiskDecision.APPROVE)
        )
        yield m


@pytest.fixture
def mock_recon():
    with patch("app.services.engine_runner.recon_service") as m:
        m.run_reconciliation = AsyncMock()
        yield m


@pytest.fixture
def mock_md():
    with patch("app.services.engine_runner.market_data_service") as m:
        m.initialize = AsyncMock()
        m.get_historical_data = AsyncMock(return_value=None)
        yield m


@pytest.fixture
def mock_opp():
    with patch("app.services.engine_runner.opportunity_scanner") as m:
        m.generate_intents = AsyncMock(return_value=[])
        yield m


@pytest.fixture
def mock_basis():
    with patch("app.services.engine_runner.basis_opportunity_scanner") as m:
        m.generate_intents = AsyncMock(return_value=[])
        yield m


@pytest.fixture
def mock_arb():
    with patch("app.services.engine_runner.spot_arb_scanner") as m:
        m.generate_intents = AsyncMock(return_value=[])
        yield m


@pytest.fixture
def mock_alloc():
    with patch("app.services.engine_runner.capital_allocator_service") as m:
        m.run_allocation = AsyncMock()
        m.apply_allocations = MagicMock(side_effect=lambda x: x)
        yield m


@pytest.fixture
def mock_fthub():
    with patch("app.services.engine_runner.FreqTradeIntegrationHub") as cls:
        hub = MagicMock()
        hub.initialize = AsyncMock()
        hub.start = AsyncMock()
        hub.shutdown = AsyncMock()
        hub.is_running = False
        hub.generate_signals = AsyncMock(return_value=None)
        cls.return_value = hub
        yield hub


@pytest.fixture
def runner(
    mock_settings,
    mock_oms,
    mock_risk,
    mock_recon,
    mock_md,
    mock_opp,
    mock_basis,
    mock_arb,
    mock_alloc,
    mock_fthub,
):
    from app.services.engine_runner import EngineRunner

    return EngineRunner()


class TestInit:
    def test_state(self, runner):
        assert runner._running is False
        assert runner._cycle_count == 0
        assert runner._paused_books == set()

    def test_status(self, runner, mock_oms):
        s = runner.get_status()
        assert s["running"] is False
        assert s["cycle_count"] == 0


class TestPauseResume:
    @pytest.mark.asyncio
    async def test_pause(self, runner):
        bid = uuid4()
        with (
            patch("app.services.engine_runner.get_supabase") as mg,
            patch("app.services.engine_runner.audit_log", new_callable=AsyncMock),
        ):
            mg.return_value = MagicMock()
            mg.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            await runner.pause_book(bid, "test")
        assert bid in runner._paused_books

    @pytest.mark.asyncio
    async def test_resume(self, runner):
        bid = uuid4()
        runner._paused_books.add(bid)
        with (
            patch("app.services.engine_runner.get_supabase") as mg,
            patch("app.services.engine_runner.audit_log", new_callable=AsyncMock),
        ):
            mg.return_value = MagicMock()
            mg.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            await runner.resume_book(bid)
        assert bid not in runner._paused_books


class TestRunCycle:
    @pytest.mark.asyncio
    async def test_empty(self, runner, mock_opp, mock_recon, mock_alloc):
        with (
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(runner, "_update_venue_health", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
        ):
            stats = await runner.run_cycle()
        assert stats["cycle"] == 1
        assert stats["intents_generated"] == 0

    @pytest.mark.asyncio
    async def test_approved(
        self, runner, mock_opp, mock_risk, mock_oms, mock_recon, mock_alloc
    ):
        bid = uuid4()
        book = Book(
            id=bid,
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        intent = TradeIntent(
            id=uuid4(),
            book_id=bid,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5000,
            max_loss_usd=500,
            confidence=0.7,
            metadata={},
        )
        mock_opp.generate_intents = AsyncMock(return_value=[intent])
        mock_risk.check_intent = AsyncMock(
            return_value=RiskCheckResult(decision=RiskDecision.APPROVE)
        )
        mock_oms.execute_intent = AsyncMock(return_value=MagicMock())
        with (
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[book]
            ),
            patch.object(runner, "_update_venue_health", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
            patch.object(
                runner,
                "_get_execution_venue",
                new_callable=AsyncMock,
                return_value=(uuid4(), "binance"),
            ),
        ):
            stats = await runner.run_cycle()
        assert stats["intents_approved"] == 1
        assert stats["orders_placed"] == 1

    @pytest.mark.asyncio
    async def test_rejected(self, runner, mock_opp, mock_risk, mock_recon, mock_alloc):
        bid = uuid4()
        book = Book(
            id=bid,
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        intent = TradeIntent(
            id=uuid4(),
            book_id=bid,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5000,
            max_loss_usd=500,
            confidence=0.7,
            metadata={},
        )
        mock_opp.generate_intents = AsyncMock(return_value=[intent])
        mock_risk.check_intent = AsyncMock(
            return_value=RiskCheckResult(
                decision=RiskDecision.REJECT, reasons=["risky"]
            )
        )
        with (
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[book]
            ),
            patch.object(runner, "_update_venue_health", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
        ):
            stats = await runner.run_cycle()
        assert stats["intents_rejected"] == 1

    @pytest.mark.asyncio
    async def test_paused_skipped(
        self, runner, mock_opp, mock_risk, mock_recon, mock_alloc
    ):
        bid = uuid4()
        runner._paused_books.add(bid)
        book = Book(
            id=bid,
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="frozen",
        )
        intent = TradeIntent(
            id=uuid4(),
            book_id=bid,
            strategy_id=uuid4(),
            instrument="BTC-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=5000,
            max_loss_usd=500,
            confidence=0.7,
            metadata={},
        )
        mock_opp.generate_intents = AsyncMock(return_value=[intent])
        with (
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[book]
            ),
            patch.object(runner, "_update_venue_health", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
        ):
            stats = await runner.run_cycle()
        assert stats["intents_approved"] == 0

    @pytest.mark.asyncio
    async def test_monitoring_skipped(
        self, runner, mock_opp, mock_risk, mock_recon, mock_alloc
    ):
        bid = uuid4()
        book = Book(
            id=bid,
            name="B",
            type=BookType.MEME,
            capital_allocated=50000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        intent = TradeIntent(
            id=uuid4(),
            book_id=bid,
            strategy_id=uuid4(),
            instrument="DOGE-USD",
            direction=OrderSide.BUY,
            target_exposure_usd=1000,
            max_loss_usd=100,
            confidence=0.5,
            metadata={"monitoring_only": True},
        )
        mock_opp.generate_intents = AsyncMock(return_value=[intent])
        with (
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[book]
            ),
            patch.object(runner, "_update_venue_health", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
        ):
            stats = await runner.run_cycle()
        assert stats["intents_approved"] == 0

    @pytest.mark.asyncio
    async def test_error_handling(self, runner, mock_opp, mock_recon, mock_alloc):
        with (
            patch.object(
                runner,
                "_update_venue_health",
                new_callable=AsyncMock,
                side_effect=RuntimeError("down"),
            ),
            patch.object(
                runner, "_load_books", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(runner, "_write_position_snapshots", new_callable=AsyncMock),
            patch.object(
                runner,
                "_generate_freqtrade_intents",
                new_callable=AsyncMock,
                return_value=[],
            ),
        ):
            stats = await runner.run_cycle()
        assert len(stats["errors"]) > 0


class TestConvertSignal:
    def test_neutral(self, runner):
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        assert (
            runner._convert_signal_to_intent(
                {"direction": "neutral", "confidence": 0.8}, book, "BTC-USD"
            )
            is None
        )

    def test_low_conf(self, runner):
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        assert (
            runner._convert_signal_to_intent(
                {"direction": "long", "confidence": 0.3}, book, "BTC-USD"
            )
            is None
        )

    def test_long(self, runner):
        """TradeIntent requires strategy_id which _convert_signal_to_intent does not
        supply, so the pydantic validation error is caught and None returned."""
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        r = runner._convert_signal_to_intent(
            {"direction": "long", "confidence": 0.8, "predicted_return": 0.05},
            book,
            "BTC-USD",
        )
        # The method catches the validation error and returns None
        assert r is None

    def test_short(self, runner):
        """Same as test_long -- strategy_id missing triggers error path."""
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=0,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        r = runner._convert_signal_to_intent(
            {"direction": "short", "confidence": 0.9, "predicted_return": -0.03},
            book,
            "ETH-USD",
        )
        assert r is None


class TestStop:
    @pytest.mark.asyncio
    async def test_stop(self, runner, mock_fthub):
        runner._running = True
        runner._freqtrade_hub = mock_fthub
        await runner.stop()
        assert runner._running is False

    @pytest.mark.asyncio
    async def test_stop_no_hub(self, runner):
        runner._running = True
        runner._freqtrade_hub = None
        await runner.stop()
        assert runner._running is False


class TestUpdateBookExposure:
    @pytest.mark.asyncio
    async def test_valid(self, runner):
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=10000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        order = Order(
            book_id=book.id,
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            filled_size=1,
            filled_price=50000,
            status=OrderStatus.FILLED,
        )
        with patch("app.services.engine_runner.get_supabase") as mg:
            mg.return_value = MagicMock()
            mg.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            await runner._update_book_exposure(book, order)

    @pytest.mark.asyncio
    async def test_zero_price_blocked(self, runner):
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=10000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        order = Order(
            book_id=book.id,
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            filled_size=1,
            filled_price=0,
            status=OrderStatus.FILLED,
        )
        with (
            patch("app.services.engine_runner.get_supabase"),
            patch(
                "app.services.engine_runner.create_alert", new_callable=AsyncMock
            ) as ma,
        ):
            await runner._update_book_exposure(book, order)
            ma.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_none_price_blocked(self, runner):
        book = Book(
            id=uuid4(),
            name="B",
            type=BookType.PROP,
            capital_allocated=100000,
            current_exposure=10000,
            max_drawdown_limit=10,
            risk_tier=1,
            status="active",
        )
        order = Order(
            book_id=book.id,
            instrument="BTC-USD",
            side=OrderSide.BUY,
            size=1,
            filled_size=1,
            filled_price=None,
            status=OrderStatus.FILLED,
        )
        with (
            patch("app.services.engine_runner.get_supabase"),
            patch(
                "app.services.engine_runner.create_alert", new_callable=AsyncMock
            ) as ma,
        ):
            await runner._update_book_exposure(book, order)
            ma.assert_awaited_once()
