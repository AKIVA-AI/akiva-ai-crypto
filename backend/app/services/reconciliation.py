"""
Reconciliation Service - Balance and position verification.
"""
import structlog
from typing import Dict, List, Optional
from uuid import UUID
from datetime import datetime
import asyncio

from app.models.domain import Position, VenueHealth
from app.config import settings
from app.database import get_supabase, audit_log, create_alert
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
        self._adapters: Dict[str, 'VenueAdapter'] = {}
        self._last_recon_time: Dict[str, datetime] = {}
        self._mismatch_counts: Dict[str, int] = {}
    
    def register_adapter(self, venue_name: str, adapter):
        """Register a venue adapter for reconciliation."""
        self._adapters[venue_name.lower()] = adapter
        self._mismatch_counts[venue_name.lower()] = 0
    
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
            "actions_taken": []
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
                    venue_name, 
                    balance_mismatches, 
                    position_mismatches
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
                position_mismatches=len(position_mismatches)
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
            
            logger.debug(
                "balance_check",
                venue=venue_name,
                balances=venue_balances
            )
            
            # Example mismatch detection
            # This would compare against expected values in production
            
        except Exception as e:
            logger.error("balance_recon_failed", venue=venue_name, error=str(e))
            mismatches.append({
                "type": "fetch_error",
                "error": str(e)
            })
        
        return mismatches
    
    async def _reconcile_positions(self, venue_name: str, adapter) -> List[Dict]:
        """Compare internal positions against venue."""
        mismatches = []
        
        try:
            # Get venue positions
            venue_positions = await adapter.get_positions()
            
            # Get our recorded positions
            supabase = get_supabase()
            venue_id_result = supabase.table("venues").select("id").ilike("name", venue_name).single().execute()
            
            if not venue_id_result.data:
                return mismatches
            
            venue_id = venue_id_result.data["id"]
            
            db_positions = supabase.table("positions").select("*").eq(
                "venue_id", venue_id
            ).eq("is_open", True).execute()
            
            # Build lookup maps
            venue_pos_map = {p.get("instrument"): p for p in venue_positions}
            db_pos_map = {p["instrument"]: p for p in db_positions.data}
            
            # Check for mismatches
            all_instruments = set(venue_pos_map.keys()) | set(db_pos_map.keys())
            
            for instrument in all_instruments:
                venue_pos = venue_pos_map.get(instrument)
                db_pos = db_pos_map.get(instrument)
                
                if venue_pos and not db_pos:
                    mismatches.append({
                        "type": "missing_internal",
                        "instrument": instrument,
                        "venue_size": venue_pos.get("size"),
                        "details": "Position exists on venue but not in DB"
                    })
                elif db_pos and not venue_pos:
                    mismatches.append({
                        "type": "missing_venue",
                        "instrument": instrument,
                        "db_size": db_pos["size"],
                        "details": "Position exists in DB but not on venue"
                    })
                elif venue_pos and db_pos:
                    # Check size difference
                    venue_size = float(venue_pos.get("size", 0))
                    db_size = float(db_pos["size"])
                    
                    if db_size > 0:
                        size_diff_pct = abs(venue_size - db_size) / db_size * 100
                        
                        if size_diff_pct > self.POSITION_SIZE_TOLERANCE_PCT:
                            mismatches.append({
                                "type": "size_mismatch",
                                "instrument": instrument,
                                "venue_size": venue_size,
                                "db_size": db_size,
                                "diff_pct": size_diff_pct
                            })
            
        except Exception as e:
            logger.error("position_recon_failed", venue=venue_name, error=str(e))
            mismatches.append({
                "type": "fetch_error",
                "error": str(e)
            })
        
        return mismatches
    
    async def _handle_mismatches(
        self,
        venue_name: str,
        balance_mismatches: List[Dict],
        position_mismatches: List[Dict]
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
                "consecutive_count": mismatch_count
            }
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
                "position_mismatches": position_mismatches
            }
        )
        actions.append("audit_logged")
        
        # If critical (3+ consecutive mismatches), trigger circuit breaker
        if mismatch_count >= 3:
            await risk_engine.activate_circuit_breaker(
                "recon_mismatch",
                f"Consecutive reconciliation failures on {venue_name}",
            )
            actions.append("circuit_breaker_activated")
            
            # TODO: Consider setting affected books to reduce-only
        
        return actions
    
    def reset_mismatch_count(self, venue_name: str):
        """Reset mismatch counter after successful recon."""
        self._mismatch_counts[venue_name] = 0


# Singleton instance
recon_service = ReconciliationService()
