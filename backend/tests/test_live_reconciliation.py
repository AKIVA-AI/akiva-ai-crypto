"""
Tests for app.services.live_reconciliation -- LiveReconciliationService.

All database and exchange adapter dependencies are mocked.
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.live_reconciliation import (
    LiveReconciliationService,
    OrderReconciliation,
    PositionReconciliation,
    ReconciliationReport,
)


@pytest.fixture
def service():
    return LiveReconciliationService()


@pytest.fixture
def mock_adapter():
    a = MagicMock()
    a.get_open_orders = AsyncMock(return_value=[])
    a.get_recent_fills = AsyncMock(return_value=[])
    a.get_positions = AsyncMock(return_value=[])
    return a


class TestDataclasses:
    def test_order_recon(self):
        r = OrderReconciliation(
            order_id="o1",
            venue_order_id="v1",
            status_match=True,
            size_match=True,
            price_match=True,
            discrepancies=[],
        )
        assert r.venue_status is None

    def test_pos_recon(self):
        r = PositionReconciliation(
            instrument="BTC-USD",
            venue_size=1,
            internal_size=1,
            size_difference=0,
            pct_difference=0,
            is_matched=True,
            discrepancies=[],
        )
        assert r.is_matched

    def test_report(self):
        r = ReconciliationReport(
            venue="binance",
            timestamp=datetime.utcnow(),
            orders_checked=10,
            orders_matched=9,
            positions_checked=5,
            positions_matched=5,
            total_discrepancies=1,
            critical_issues=[],
            order_details=[],
            position_details=[],
            pnl_verified=True,
            recommended_actions=[],
        )
        assert r.total_discrepancies == 1


class TestRegister:
    def test_register(self, service, mock_adapter):
        service.register_adapter("Binance", mock_adapter)
        assert "binance" in service._adapters

    def test_normalizes(self, service, mock_adapter):
        service.register_adapter("COINBASE", mock_adapter)
        assert "coinbase" in service._adapters


class TestCompareStatus:
    def test_same(self, service):
        assert service._compare_status("filled", "filled") is True

    def test_pending_open(self, service):
        assert service._compare_status("pending", "open") is True

    def test_filled_done(self, service):
        assert service._compare_status("filled", "done") is True

    def test_partial(self, service):
        assert service._compare_status("partial", "partially_filled") is True

    def test_cancelled_expired(self, service):
        assert service._compare_status("cancelled", "expired") is True

    def test_mismatch(self, service):
        assert service._compare_status("filled", "pending") is False

    def test_case(self, service):
        assert service._compare_status("FILLED", "DONE") is True

    def test_unknown_same(self, service):
        assert service._compare_status("x", "x") is True

    def test_unknown_diff(self, service):
        assert service._compare_status("a", "b") is False


class TestReconcileSingleOrder:
    @pytest.mark.asyncio
    async def test_match(self, service):
        io = {"id": "o1", "status": "filled", "filled_size": 1, "filled_price": 50000}
        vo = {
            "o1": {
                "id": "o1",
                "status": "filled",
                "filled_quantity": 1,
                "average_fill_price": 50000,
            }
        }
        r = await service._reconcile_single_order(io, vo, [], "binance")
        assert r.status_match and r.size_match and r.price_match

    @pytest.mark.asyncio
    async def test_not_found(self, service):
        io = {"id": "o1", "status": "open", "filled_size": 0, "filled_price": None}
        r = await service._reconcile_single_order(io, {}, [], "binance")
        assert r.venue_status == "not_found"

    @pytest.mark.asyncio
    async def test_status_mismatch(self, service):
        io = {"id": "o1", "status": "open", "filled_size": 0, "filled_price": None}
        vo = {
            "o1": {
                "id": "o1",
                "status": "filled",
                "filled_quantity": 1,
                "average_fill_price": 50000,
            }
        }
        r = await service._reconcile_single_order(io, vo, [], "binance")
        assert not r.status_match

    @pytest.mark.asyncio
    async def test_size_mismatch(self, service):
        io = {"id": "o1", "status": "filled", "filled_size": 1, "filled_price": 50000}
        vo = {
            "o1": {
                "id": "o1",
                "status": "filled",
                "filled_quantity": 0.8,
                "average_fill_price": 50000,
            }
        }
        r = await service._reconcile_single_order(io, vo, [], "binance")
        assert not r.size_match

    @pytest.mark.asyncio
    async def test_price_mismatch(self, service):
        io = {"id": "o1", "status": "filled", "filled_size": 1, "filled_price": 50000}
        vo = {
            "o1": {
                "id": "o1",
                "status": "filled",
                "filled_quantity": 1,
                "average_fill_price": 50500,
            }
        }
        r = await service._reconcile_single_order(io, vo, [], "binance")
        assert not r.price_match


class TestReconcileOrders:
    @pytest.mark.asyncio
    async def test_no_adapter(self, service):
        assert await service.reconcile_orders("unknown") == []

    @pytest.mark.asyncio
    async def test_no_orders(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            q = MagicMock()
            mc.table.return_value.select.return_value.not_.return_value.not_.return_value = q
            q.gte.return_value.execute.return_value = MagicMock(data=[])
            assert await service.reconcile_orders("binance") == []

    @pytest.mark.asyncio
    async def test_exception(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        with patch(
            "app.services.live_reconciliation.get_supabase",
            side_effect=RuntimeError("err"),
        ):
            assert await service.reconcile_orders("binance") == []
        assert service._consecutive_failures["binance"] == 1


class TestReconcilePositions:
    @pytest.mark.asyncio
    async def test_no_adapter(self, service):
        assert await service.reconcile_positions("unknown") == []

    @pytest.mark.asyncio
    async def test_matched(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        mock_adapter.get_positions = AsyncMock(
            return_value=[{"instrument": "BTC-USD", "size": 1}]
        )
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.select.return_value.ilike.return_value.single.return_value.execute.return_value = MagicMock(
                data={"id": "v1"}
            )
            mc.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "instrument": "BTC-USD",
                        "size": 1,
                        "entry_price": 50000,
                        "side": "buy",
                        "unrealized_pnl": 0,
                    }
                ]
            )
            results = await service.reconcile_positions("binance")
        assert len(results) == 1
        assert results[0].is_matched

    @pytest.mark.asyncio
    async def test_mismatch(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        mock_adapter.get_positions = AsyncMock(
            return_value=[{"instrument": "BTC-USD", "size": 2}]
        )
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.select.return_value.ilike.return_value.single.return_value.execute.return_value = MagicMock(
                data={"id": "v1"}
            )
            mc.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "instrument": "BTC-USD",
                        "size": 1,
                        "entry_price": 50000,
                        "side": "buy",
                        "unrealized_pnl": 0,
                    }
                ]
            )
            results = await service.reconcile_positions("binance")
        assert not results[0].is_matched

    @pytest.mark.asyncio
    async def test_venue_only(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        mock_adapter.get_positions = AsyncMock(
            return_value=[{"instrument": "ETH-USD", "size": 5}]
        )
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.select.return_value.ilike.return_value.single.return_value.execute.return_value = MagicMock(
                data={"id": "v1"}
            )
            mc.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )
            results = await service.reconcile_positions("binance")
        assert any("exists on venue" in d for d in results[0].discrepancies)

    @pytest.mark.asyncio
    async def test_internal_only(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        mock_adapter.get_positions = AsyncMock(return_value=[])
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.select.return_value.ilike.return_value.single.return_value.execute.return_value = MagicMock(
                data={"id": "v1"}
            )
            mc.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "instrument": "BTC-USD",
                        "size": 1,
                        "entry_price": 50000,
                        "side": "buy",
                        "unrealized_pnl": 0,
                    }
                ]
            )
            results = await service.reconcile_positions("binance")
        assert any("exists internally" in d for d in results[0].discrepancies)

    @pytest.mark.asyncio
    async def test_no_venue(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        with patch("app.services.live_reconciliation.get_supabase") as mg:
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.select.return_value.ilike.return_value.single.return_value.execute.return_value = MagicMock(
                data=None
            )
            assert await service.reconcile_positions("binance") == []


class TestFullReconciliation:
    @pytest.mark.asyncio
    async def test_clean(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        with (
            patch.object(
                service, "reconcile_orders", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "reconcile_positions", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "_store_reconciliation_report", new_callable=AsyncMock
            ),
            patch.object(service, "_alert_critical_issues", new_callable=AsyncMock),
        ):
            report = await service.full_reconciliation("binance")
        assert report.total_discrepancies == 0

    @pytest.mark.asyncio
    async def test_high_order_discrepancy(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        ords = [
            OrderReconciliation(
                order_id=f"o{i}",
                venue_order_id=None,
                status_match=i >= 3,
                size_match=True,
                price_match=True,
                discrepancies=["x"] if i < 3 else [],
            )
            for i in range(10)
        ]
        with (
            patch.object(
                service, "reconcile_orders", new_callable=AsyncMock, return_value=ords
            ),
            patch.object(
                service, "reconcile_positions", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "_store_reconciliation_report", new_callable=AsyncMock
            ),
            patch.object(
                service, "_alert_critical_issues", new_callable=AsyncMock
            ) as ma,
        ):
            report = await service.full_reconciliation("binance")
        assert len(report.critical_issues) > 0
        ma.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_major_pos_discrepancy(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        pos = [
            PositionReconciliation(
                instrument="BTC-USD",
                venue_size=1,
                internal_size=0.5,
                size_difference=0.5,
                pct_difference=100,
                is_matched=False,
                discrepancies=["x"],
            )
        ]
        with (
            patch.object(
                service, "reconcile_orders", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "reconcile_positions", new_callable=AsyncMock, return_value=pos
            ),
            patch.object(
                service, "_store_reconciliation_report", new_callable=AsyncMock
            ),
            patch.object(
                service, "_alert_critical_issues", new_callable=AsyncMock
            ) as ma,
        ):
            report = await service.full_reconciliation("binance")
        assert "BTC-USD" in report.critical_issues[0]

    @pytest.mark.asyncio
    async def test_resets_failures(self, service, mock_adapter):
        service.register_adapter("binance", mock_adapter)
        service._consecutive_failures["binance"] = 5
        with (
            patch.object(
                service, "reconcile_orders", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "reconcile_positions", new_callable=AsyncMock, return_value=[]
            ),
            patch.object(
                service, "_store_reconciliation_report", new_callable=AsyncMock
            ),
            patch.object(service, "_alert_critical_issues", new_callable=AsyncMock),
        ):
            await service.full_reconciliation("binance")
        assert service._consecutive_failures["binance"] == 0


class TestHandleDiscrepancy:
    @pytest.mark.asyncio
    async def test_auto_correct(self, service):
        io = {"id": "o1", "status": "pending"}
        recon = OrderReconciliation(
            order_id="o1",
            venue_order_id="v1",
            status_match=False,
            size_match=True,
            price_match=True,
            discrepancies=["x"],
            venue_status="filled",
            internal_status="pending",
        )
        with (
            patch("app.services.live_reconciliation.get_supabase") as mg,
            patch("app.services.live_reconciliation.audit_log", new_callable=AsyncMock),
        ):
            mc = MagicMock()
            mg.return_value = mc
            mc.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
            await service._handle_order_discrepancy(io, recon, "binance")
            mc.table.return_value.update.assert_called()

    @pytest.mark.asyncio
    async def test_no_auto_correct(self, service):
        io = {"id": "o1", "status": "open"}
        recon = OrderReconciliation(
            order_id="o1",
            venue_order_id="v1",
            status_match=True,
            size_match=False,
            price_match=True,
            discrepancies=["x"],
            venue_status="open",
            internal_status="open",
        )
        with (
            patch("app.services.live_reconciliation.get_supabase") as mg,
            patch("app.services.live_reconciliation.audit_log", new_callable=AsyncMock),
        ):
            mc = MagicMock()
            mg.return_value = mc
            await service._handle_order_discrepancy(io, recon, "binance")
            mc.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_exception(self, service):
        io = {"id": "o1", "status": "pending"}
        recon = OrderReconciliation(
            order_id="o1",
            venue_order_id="v1",
            status_match=False,
            size_match=True,
            price_match=True,
            discrepancies=[],
            venue_status="filled",
            internal_status="pending",
        )
        with (
            patch(
                "app.services.live_reconciliation.get_supabase",
                side_effect=RuntimeError("fail"),
            ),
            patch("app.services.live_reconciliation.audit_log", new_callable=AsyncMock),
        ):
            await service._handle_order_discrepancy(io, recon, "binance")


class TestStoreReport:
    @pytest.mark.asyncio
    async def test_ok(self, service):
        rpt = ReconciliationReport(
            venue="binance",
            timestamp=datetime.utcnow(),
            orders_checked=5,
            orders_matched=5,
            positions_checked=3,
            positions_matched=3,
            total_discrepancies=0,
            critical_issues=[],
            order_details=[],
            position_details=[],
            pnl_verified=True,
            recommended_actions=[],
        )
        with (
            patch("app.services.live_reconciliation.get_supabase"),
            patch("app.services.live_reconciliation.audit_log", new_callable=AsyncMock),
        ):
            await service._store_reconciliation_report(rpt)

    @pytest.mark.asyncio
    async def test_exception(self, service):
        rpt = ReconciliationReport(
            venue="binance",
            timestamp=datetime.utcnow(),
            orders_checked=0,
            orders_matched=0,
            positions_checked=0,
            positions_matched=0,
            total_discrepancies=0,
            critical_issues=[],
            order_details=[],
            position_details=[],
            pnl_verified=True,
            recommended_actions=[],
        )
        with (
            patch(
                "app.services.live_reconciliation.get_supabase",
                side_effect=RuntimeError("fail"),
            ),
            patch("app.services.live_reconciliation.audit_log", new_callable=AsyncMock),
        ):
            await service._store_reconciliation_report(rpt)


class TestAlert:
    @pytest.mark.asyncio
    async def test_alert(self, service):
        rpt = ReconciliationReport(
            venue="binance",
            timestamp=datetime.utcnow(),
            orders_checked=10,
            orders_matched=5,
            positions_checked=5,
            positions_matched=3,
            total_discrepancies=7,
            critical_issues=["Issue 1"],
            order_details=[],
            position_details=[],
            pnl_verified=False,
            recommended_actions=["Fix"],
        )
        with patch(
            "app.services.live_reconciliation.create_alert", new_callable=AsyncMock
        ) as ma:
            await service._alert_critical_issues(rpt)
            ma.assert_awaited_once()


class TestTolerances:
    def test_defaults(self, service):
        assert service.SIZE_TOLERANCE_PCT == 0.5
        assert service.PRICE_TOLERANCE_PCT == 0.1
        assert service.MAX_SYNC_AGE_SECONDS == 60


class TestSingleton:
    def test_exists(self):
        from app.services.live_reconciliation import live_recon_service

        assert isinstance(live_recon_service, LiveReconciliationService)
