"""
Reconciliation Service - Balance and position verification.
"""

from datetime import datetime
from typing import Any, Dict, List
from uuid import UUID

import structlog

from app.config import settings
from app.database import audit_log, create_alert, get_supabase
from app.services.risk_engine import risk_engine

logger = structlog.get_logger()


class ReconciliationService:
    """
    Reconciles internal state against venue state.

    Responsibilities:
    - Periodic balance verification
    - Position reconciliation
    - Mismatch detection and alerting
    - Protective actions (reduce-only, halt)
    """

    # Tolerance thresholds
    BALANCE_TOLERANCE_PCT = 1.0  # 1% tolerance for balance differences
    POSITION_SIZE_TOLERANCE_PCT = 2.0  # 2% tolerance for position size

    def __init__(self):
        self._adapters: Dict[str, Any] = {}
        self._last_recon_time: Dict[str, datetime] = {}
        self._mismatch_counts: Dict[str, int] = {}

    def register_adapter(self, venue_name: str, adapter):
        """Register a venue adapter for reconciliation."""
        self._adapters[venue_name.lower()] = adapter
        self._mismatch_counts[venue_name.lower()] = 0

    async def run_reconciliation(self) -> Dict[str, Dict]:
        """Compatibility wrapper for engine runner."""
        results = await self.reconcile_all()
        await self._check_basis_hedge_ratio()
        await self._check_spot_inventory_drift()
        return results

    async def reconcile_all(self) -> Dict[str, Dict]:
        """
        Run reconciliation for all registered venues.
        Returns summary of results.
        """
        results = {}

        for venue_name, adapter in self._adapters.items():
            try:
                result = await self.reconcile_venue(venue_name)
                results[venue_name] = result
            except Exception as e:
                logger.error("recon_venue_failed", venue=venue_name, error=str(e))
                results[venue_name] = {"status": "error", "error": str(e)}

        return results

    async def reconcile_venue(self, venue_name: str) -> Dict:
        """
        Reconcile a single venue.

        Returns:
            Dict with status, mismatches, and actions taken
        """
        adapter = self._adapters.get(venue_name.lower())
        if not adapter:
            return {"status": "error", "error": "Adapter not found"}

        result = {
            "status": "ok",
            "venue": venue_name,
            "timestamp": datetime.utcnow().isoformat(),
            "balance_mismatches": [],
            "position_mismatches": [],
            "actions_taken": [],
        }

        try:
            # Reconcile balances
            balance_mismatches = await self._reconcile_balances(venue_name, adapter)
            result["balance_mismatches"] = balance_mismatches

            # Reconcile positions
            position_mismatches = await self._reconcile_positions(venue_name, adapter)
            result["position_mismatches"] = position_mismatches

            # Take protective actions if needed
            if balance_mismatches or position_mismatches:
                actions = await self._handle_mismatches(
                    venue_name, balance_mismatches, position_mismatches
                )
                result["actions_taken"] = actions
                result["status"] = "mismatch"

            # Update last recon time
            self._last_recon_time[venue_name] = datetime.utcnow()

            logger.info(
                "recon_complete",
                venue=venue_name,
                status=result["status"],
                balance_mismatches=len(balance_mismatches),
                position_mismatches=len(position_mismatches),
            )

        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            logger.error("recon_failed", venue=venue_name, error=str(e))

        return result

    async def _reconcile_balances(self, venue_name: str, adapter) -> List[Dict]:
        """Compare internal balance records against venue."""
        mismatches = []

        try:
            # Get venue balances
            venue_balances = await adapter.get_balance()

            # Get our recorded balances (from last known state)
            # In a full implementation, we'd track expected balances
            # For now, we just log the venue balances

            logger.debug("balance_check", venue=venue_name, balances=venue_balances)

            # Example mismatch detection
            # This would compare against expected values in production

        except Exception as e:
            logger.error("balance_recon_failed", venue=venue_name, error=str(e))
            mismatches.append({"type": "fetch_error", "error": str(e)})

        return mismatches

    async def _reconcile_positions(self, venue_name: str, adapter) -> List[Dict]:
        """Compare internal positions against venue."""
        mismatches = []

        try:
            # Get venue positions
            venue_positions = await adapter.get_positions()

            # Get our recorded positions
            supabase = get_supabase()
            venue_id_result = (
                supabase.table("venues")
                .select("id")
                .ilike("name", venue_name)
                .single()
                .execute()
            )

            if not venue_id_result.data:
                return mismatches

            venue_id = venue_id_result.data["id"]

            db_positions = (
                supabase.table("positions")
                .select("*")
                .eq("venue_id", venue_id)
                .eq("is_open", True)
                .execute()
            )

            # Build lookup maps
            venue_pos_map = {p.get("instrument"): p for p in venue_positions}
            db_pos_map = {p["instrument"]: p for p in db_positions.data}

            # Check for mismatches
            all_instruments = set(venue_pos_map.keys()) | set(db_pos_map.keys())

            for instrument in all_instruments:
                venue_pos = venue_pos_map.get(instrument)
                db_pos = db_pos_map.get(instrument)

                if venue_pos and not db_pos:
                    mismatches.append(
                        {
                            "type": "missing_internal",
                            "instrument": instrument,
                            "venue_size": venue_pos.get("size"),
                            "details": "Position exists on venue but not in DB",
                        }
                    )
                elif db_pos and not venue_pos:
                    mismatches.append(
                        {
                            "type": "missing_venue",
                            "instrument": instrument,
                            "db_size": db_pos["size"],
                            "details": "Position exists in DB but not on venue",
                        }
                    )
                elif venue_pos and db_pos:
                    # Check size difference
                    venue_size = float(venue_pos.get("size", 0))
                    db_size = float(db_pos["size"])

                    if db_size > 0:
                        size_diff_pct = abs(venue_size - db_size) / db_size * 100

                        if size_diff_pct > self.POSITION_SIZE_TOLERANCE_PCT:
                            mismatches.append(
                                {
                                    "type": "size_mismatch",
                                    "instrument": instrument,
                                    "venue_size": venue_size,
                                    "db_size": db_size,
                                    "diff_pct": size_diff_pct,
                                }
                            )

        except Exception as e:
            logger.error("position_recon_failed", venue=venue_name, error=str(e))
            mismatches.append({"type": "fetch_error", "error": str(e)})

        return mismatches

    async def _handle_mismatches(
        self,
        venue_name: str,
        balance_mismatches: List[Dict],
        position_mismatches: List[Dict],
    ) -> List[str]:
        """Handle detected mismatches with appropriate actions."""
        actions = []

        # Increment mismatch counter
        self._mismatch_counts[venue_name] = self._mismatch_counts.get(venue_name, 0) + 1
        mismatch_count = self._mismatch_counts[venue_name]

        # Create alert
        severity = "warning"
        if mismatch_count >= 3:
            severity = "critical"

        await create_alert(
            title=f"Reconciliation Mismatch: {venue_name}",
            message=f"Found {len(balance_mismatches)} balance and {len(position_mismatches)} position mismatches",
            severity=severity,
            source="reconciliation",
            metadata={
                "venue": venue_name,
                "balance_mismatches": balance_mismatches,
                "position_mismatches": position_mismatches,
                "consecutive_count": mismatch_count,
            },
        )
        actions.append("alert_created")

        # Audit log
        await audit_log(
            action="reconciliation_mismatch",
            resource_type="venue",
            resource_id=venue_name,
            severity=severity,
            after_state={
                "balance_mismatches": balance_mismatches,
                "position_mismatches": position_mismatches,
            },
        )
        actions.append("audit_logged")

        # Protective actions based on severity
        if mismatch_count >= 3:
            await risk_engine.activate_circuit_breaker(
                "recon_mismatch",
                f"Consecutive reconciliation failures on {venue_name}",
            )
            actions.append("circuit_breaker_activated")

            affected_books = await self._resolve_affected_books(
                venue_name, position_mismatches
            )
            if affected_books:
                await self._set_books_reduce_only(affected_books, venue_name)
                actions.append("books_reduce_only")

        if mismatch_count >= 5:
            affected_books = await self._resolve_affected_books(
                venue_name, position_mismatches
            )
            for book_id in affected_books:
                await risk_engine.activate_kill_switch(
                    book_id=book_id,
                    reason=f"Reconciliation mismatches exceeded threshold for {venue_name}",
                )
            if affected_books:
                actions.append("kill_switch_activated")

        return actions

    async def _resolve_affected_books(
        self, venue_name: str, position_mismatches: List[Dict]
    ) -> List[UUID]:
        """Resolve affected book IDs from mismatched positions."""
        try:
            supabase = get_supabase()
            venue_id_result = (
                supabase.table("venues")
                .select("id")
                .ilike("name", venue_name)
                .single()
                .execute()
            )
            if not venue_id_result.data:
                return []
            venue_id = venue_id_result.data["id"]

            instruments = {
                m.get("instrument") for m in position_mismatches if m.get("instrument")
            }
            if not instruments:
                return []

            result = (
                supabase.table("positions")
                .select("book_id")
                .eq("venue_id", venue_id)
                .in_("instrument", list(instruments))
                .execute()
            )

            return [UUID(row["book_id"]) for row in result.data if row.get("book_id")]
        except Exception as e:
            logger.error("affected_books_lookup_failed", error=str(e))
            return []

    async def _set_books_reduce_only(self, book_ids: List[UUID], venue_name: str):
        """Set affected books to reduce-only and audit."""
        from app.services.oms_execution import oms_service

        for book_id in book_ids:
            await oms_service.set_reduce_only(
                book_id, f"Reconciliation mismatches on {venue_name}"
            )

    async def _check_basis_hedge_ratio(self):
        """Verify hedged ratio for basis strategy positions."""
        tenant_id = settings.tenant_id
        if not tenant_id:
            return
        try:
            supabase = get_supabase()
            result = (
                supabase.table("strategy_positions")
                .select("id, strategy_id, instrument_id, hedged_ratio")
                .eq("tenant_id", tenant_id)
                .execute()
            )

            out_of_bounds = [
                row
                for row in result.data
                if row.get("hedged_ratio", 0) < 0.98
                or row.get("hedged_ratio", 0) > 1.02
            ]
            if not out_of_bounds:
                return

            from app.services.oms_execution import oms_service

            for row in out_of_bounds:
                strategy_id = row.get("strategy_id")
                strategy = (
                    supabase.table("strategies")
                    .select("book_id")
                    .eq("id", strategy_id)
                    .single()
                    .execute()
                )
                book_id = strategy.data.get("book_id") if strategy.data else None
                if not book_id:
                    continue

                await create_alert(
                    title="Basis Hedge Ratio Mismatch",
                    message=f"Hedged ratio out of bounds for strategy {strategy_id}",
                    severity="warning",
                    source="reconciliation",
                    metadata={
                        "strategy_id": strategy_id,
                        "hedged_ratio": row.get("hedged_ratio"),
                    },
                )
                await audit_log(
                    action="basis_hedge_ratio_mismatch",
                    resource_type="strategy",
                    resource_id=strategy_id,
                    severity="warning",
                    after_state={"hedged_ratio": row.get("hedged_ratio")},
                    book_id=book_id,
                )
                await oms_service.set_reduce_only(
                    UUID(book_id), "Basis hedged ratio out of bounds"
                )

        except Exception as e:
            logger.error("basis_hedge_ratio_check_failed", error=str(e))

    async def _check_spot_inventory_drift(self):
        """Verify venue inventory against adapter balances."""
        tenant_id = settings.tenant_id
        if not tenant_id:
            return
        try:
            supabase = get_supabase()
            venues = supabase.table("venues").select("id, name").execute()
            for venue in venues.data:
                venue_id = venue["id"]
                venue_name = venue["name"]
                adapter = self._adapters.get(venue_name.lower())
                if not adapter:
                    continue
                balances = await adapter.get_balance()
                inventory_rows = (
                    supabase.table("venue_inventory")
                    .select("id, instrument_id, available_qty")
                    .eq("tenant_id", tenant_id)
                    .eq("venue_id", venue_id)
                    .execute()
                )
                if not inventory_rows.data:
                    continue
                instrument_rows = (
                    supabase.table("instruments")
                    .select("id, common_symbol")
                    .eq("tenant_id", tenant_id)
                    .eq("venue_id", venue_id)
                    .execute()
                )
                symbol_map = {
                    row["id"]: row["common_symbol"] for row in instrument_rows.data
                }

                for row in inventory_rows.data:
                    symbol = symbol_map.get(row["instrument_id"])
                    if not symbol:
                        continue
                    base = symbol.split("-")[0]
                    balance = float(balances.get(base, 0))
                    recorded = float(row.get("available_qty", 0))
                    if recorded <= 0:
                        continue
                    diff_pct = abs(balance - recorded) / recorded * 100
                    if diff_pct > 2.0:
                        await create_alert(
                            title="Spot Inventory Drift",
                            message=f"{venue_name} {symbol} drift {diff_pct:.2f}%",
                            severity="warning",
                            source="reconciliation",
                            metadata={
                                "venue": venue_name,
                                "symbol": symbol,
                                "diff_pct": diff_pct,
                            },
                        )
                        await audit_log(
                            action="spot_inventory_drift",
                            resource_type="venue",
                            resource_id=str(venue_id),
                            severity="warning",
                            after_state={"symbol": symbol, "diff_pct": diff_pct},
                        )
                        await self._set_all_books_reduce_only(
                            f"Inventory drift on {venue_name}"
                        )
        except Exception as e:
            logger.error("spot_inventory_drift_check_failed", error=str(e))

    async def _set_all_books_reduce_only(self, reason: str):
        from app.services.oms_execution import oms_service

        supabase = get_supabase()
        books = supabase.table("books").select("id").execute()
        for row in books.data:
            await oms_service.set_reduce_only(UUID(row["id"]), reason)

    def reset_mismatch_count(self, venue_name: str):
        """Reset mismatch counter after successful recon."""
        self._mismatch_counts[venue_name] = 0


# Singleton instance
recon_service = ReconciliationService()
