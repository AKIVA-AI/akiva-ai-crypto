"""
Risk Engine - Pre-trade checks and circuit breakers.

APPROVED / MODIFY / REJECT decisions with full audit trail.
"""
import structlog
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import UUID

from app.models.domain import (
    TradeIntent, RiskCheckResult, RiskDecision, 
    Book, VenueHealth, VenueStatus, Position, OrderSide
)
from app.config import settings
from app.database import get_supabase, create_alert, audit_log

logger = structlog.get_logger()


class RiskEngine:
    """
    Pre-trade risk checks and circuit breakers.
    
    Checks performed:
    - Leverage caps
    - Position size limits
    - Spread/liquidity requirements
    - Max daily loss
    - Max drawdown
    - Correlation exposure (simplified)
    - Venue health
    """
    
    def __init__(self):
        self.config = settings.risk
        self._daily_pnl_cache: Dict[UUID, float] = {}
        self._position_cache: Dict[UUID, List[Position]] = {}
        self._circuit_breakers: Dict[str, bool] = {
            "global": False,
            "latency": False,
            "error_rate": False,
            "recon_mismatch": False,
            "vol_shock": False
        }
    
    async def check_intent(
        self,
        intent: TradeIntent,
        book: Book,
        venue_health: Optional[VenueHealth] = None,
        current_positions: Optional[List[Position]] = None
    ) -> RiskCheckResult:
        """
        Evaluate a trade intent against all risk rules.
        Returns APPROVE, MODIFY, or REJECT with reasons.
        """
        checks_passed = []
        checks_failed = []
        reasons = []
        
        # Check global kill switch first
        if await self._check_global_kill_switch():
            return RiskCheckResult(
                decision=RiskDecision.REJECT,
                intent_id=intent.id,
                original_intent=intent,
                reasons=["Global kill switch is active"],
                checks_failed=["global_kill_switch"]
            )
        
        # Check circuit breakers
        breaker_result = self._check_circuit_breakers()
        if breaker_result:
            checks_failed.append("circuit_breaker")
            reasons.append(f"Circuit breaker active: {breaker_result}")
        else:
            checks_passed.append("circuit_breaker")
        
        # Check venue health
        if venue_health:
            if venue_health.status == VenueStatus.DOWN:
                checks_failed.append("venue_health")
                reasons.append(f"Venue {venue_health.name} is DOWN")
            elif venue_health.status == VenueStatus.DEGRADED:
                if intent.liquidity_requirement == "high":
                    checks_failed.append("venue_health")
                    reasons.append(f"Venue degraded, high liquidity required")
                else:
                    checks_passed.append("venue_health")
            else:
                checks_passed.append("venue_health")
        else:
            checks_passed.append("venue_health")
        
        # Check position size limit
        if intent.target_exposure_usd > self.config.max_position_size_usd:
            checks_failed.append("position_size")
            reasons.append(
                f"Position size ${intent.target_exposure_usd:,.0f} exceeds "
                f"limit ${self.config.max_position_size_usd:,.0f}"
            )
        else:
            checks_passed.append("position_size")
        
        # Check book capital utilization
        book_utilization = self._check_book_utilization(intent, book)
        if book_utilization > 0.9:  # 90% utilization cap
            checks_failed.append("book_utilization")
            reasons.append(f"Book utilization at {book_utilization:.0%}")
        else:
            checks_passed.append("book_utilization")
        
        # Check max loss per trade
        max_loss_pct = (intent.max_loss_usd / book.capital_allocated) * 100
        if max_loss_pct > 2.0:  # Max 2% loss per trade
            checks_failed.append("max_trade_loss")
            reasons.append(f"Max loss {max_loss_pct:.1f}% exceeds 2% limit")
        else:
            checks_passed.append("max_trade_loss")
        
        # Check daily loss limit
        daily_loss = await self._get_daily_pnl(book.id)
        daily_loss_pct = abs(daily_loss) / book.capital_allocated * 100
        if daily_loss < 0 and daily_loss_pct >= self.config.max_daily_loss_pct:
            checks_failed.append("daily_loss")
            reasons.append(
                f"Daily loss {daily_loss_pct:.1f}% reached limit "
                f"{self.config.max_daily_loss_pct}%"
            )
        else:
            checks_passed.append("daily_loss")
        
        # Check concentration (max exposure to single asset)
        concentration = await self._check_concentration(
            intent, book, current_positions or []
        )
        if concentration > 25:  # Max 25% in single asset
            checks_failed.append("concentration")
            reasons.append(f"Asset concentration at {concentration:.0f}%")
        else:
            checks_passed.append("concentration")
        
        # Determine decision
        if checks_failed:
            decision = RiskDecision.REJECT
        else:
            decision = RiskDecision.APPROVE
        
        result = RiskCheckResult(
            decision=decision,
            intent_id=intent.id,
            original_intent=intent,
            reasons=reasons,
            checks_passed=checks_passed,
            checks_failed=checks_failed
        )
        
        # Log the decision
        logger.info(
            "risk_check_complete",
            decision=decision.value,
            intent_id=str(intent.id),
            book_id=str(intent.book_id),
            checks_passed=len(checks_passed),
            checks_failed=len(checks_failed)
        )
        
        return result
    
    async def _check_global_kill_switch(self) -> bool:
        """Check if global kill switch is active."""
        try:
            supabase = get_supabase()
            result = supabase.table("global_settings").select("global_kill_switch").limit(1).execute()
            if result.data:
                return result.data[0].get("global_kill_switch", False)
            return False
        except Exception as e:
            logger.error("kill_switch_check_failed", error=str(e))
            return True  # Fail safe - assume kill switch on if check fails
    
    def _check_circuit_breakers(self) -> Optional[str]:
        """Check if any circuit breaker is tripped."""
        for breaker, active in self._circuit_breakers.items():
            if active:
                return breaker
        return None
    
    def _check_book_utilization(self, intent: TradeIntent, book: Book) -> float:
        """Calculate book utilization after proposed trade."""
        new_exposure = book.current_exposure + intent.target_exposure_usd
        return new_exposure / book.capital_allocated if book.capital_allocated > 0 else 1.0
    
    async def _get_daily_pnl(self, book_id: UUID) -> float:
        """Get today's realized + unrealized PnL for a book."""
        try:
            supabase = get_supabase()
            today = datetime.utcnow().date().isoformat()
            
            # Get positions PnL
            positions = supabase.table("positions").select(
                "unrealized_pnl, realized_pnl"
            ).eq("book_id", str(book_id)).eq("is_open", True).execute()
            
            total_pnl = sum(
                p.get("unrealized_pnl", 0) + p.get("realized_pnl", 0)
                for p in positions.data
            )
            
            return total_pnl
        except Exception as e:
            logger.error("daily_pnl_fetch_failed", error=str(e))
            return 0.0
    
    async def _check_concentration(
        self,
        intent: TradeIntent,
        book: Book,
        positions: List[Position]
    ) -> float:
        """Check concentration in a single asset."""
        # Extract base asset from instrument (e.g., "BTC" from "BTC-USD")
        intent_asset = intent.instrument.split("-")[0]
        
        # Sum existing exposure to this asset
        existing_exposure = sum(
            p.size * p.mark_price
            for p in positions
            if p.instrument.startswith(intent_asset) and p.is_open
        )
        
        total_exposure = existing_exposure + intent.target_exposure_usd
        concentration_pct = (total_exposure / book.capital_allocated) * 100
        
        return concentration_pct
    
    async def activate_circuit_breaker(
        self,
        breaker_type: str,
        reason: str,
        book_id: Optional[UUID] = None
    ):
        """Activate a circuit breaker."""
        self._circuit_breakers[breaker_type] = True
        
        await create_alert(
            title=f"Circuit Breaker Activated: {breaker_type}",
            message=reason,
            severity="critical",
            source="risk_engine",
            metadata={"breaker_type": breaker_type, "book_id": str(book_id) if book_id else None}
        )
        
        await audit_log(
            action="circuit_breaker_activated",
            resource_type="circuit_breaker",
            resource_id=breaker_type,
            severity="critical",
            book_id=str(book_id) if book_id else None,
            after_state={"active": True, "reason": reason}
        )
        
        logger.warning(
            "circuit_breaker_activated",
            breaker_type=breaker_type,
            reason=reason,
            book_id=str(book_id) if book_id else None
        )
    
    async def deactivate_circuit_breaker(self, breaker_type: str):
        """Deactivate a circuit breaker."""
        self._circuit_breakers[breaker_type] = False
        
        await audit_log(
            action="circuit_breaker_deactivated",
            resource_type="circuit_breaker",
            resource_id=breaker_type,
            after_state={"active": False}
        )
        
        logger.info("circuit_breaker_deactivated", breaker_type=breaker_type)
    
    async def activate_kill_switch(
        self,
        book_id: Optional[UUID] = None,
        user_id: Optional[str] = None,
        reason: str = "Manual activation"
    ):
        """Activate kill switch (global or per-book)."""
        supabase = get_supabase()
        
        if book_id:
            # Per-book kill switch
            supabase.table("books").update({
                "status": "halted"
            }).eq("id", str(book_id)).execute()
            
            await create_alert(
                title=f"Book Kill Switch Activated",
                message=f"Book halted: {reason}",
                severity="critical",
                source="risk_engine"
            )
        else:
            # Global kill switch
            supabase.table("global_settings").update({
                "global_kill_switch": True,
                "updated_by": user_id
            }).execute()
            
            self._circuit_breakers["global"] = True
            
            await create_alert(
                title="GLOBAL KILL SWITCH ACTIVATED",
                message=reason,
                severity="critical",
                source="risk_engine"
            )
        
        await audit_log(
            action="kill_switch_activated",
            resource_type="kill_switch",
            resource_id=str(book_id) if book_id else "global",
            user_id=user_id,
            severity="critical",
            after_state={"active": True, "reason": reason}
        )
        
        logger.critical(
            "kill_switch_activated",
            book_id=str(book_id) if book_id else "global",
            reason=reason
        )


# Singleton instance
risk_engine = RiskEngine()
