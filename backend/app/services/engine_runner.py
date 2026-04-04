"""
Engine Runner - Orchestrates the trading engine cycle.

This service coordinates:
1. Market data collection
2. Strategy intent generation
3. Risk checks
4. Order execution (paper or live)
5. Position/order snapshot writes
6. Venue health monitoring

IMPORTANT: Order writes are handled ONLY by OMS to prevent duplicates.
"""

import asyncio
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

import structlog

from app.config import settings
from app.database import audit_log, create_alert, get_supabase
from app.models.domain import Book, Order, OrderSide, RiskDecision, TradeIntent
from app.services.basis_opportunity_scanner import basis_opportunity_scanner
from app.services.capital_allocator import capital_allocator_service
from app.services.freqtrade_integration import FreqTradeIntegrationHub
from app.services.market_data import market_data_service
from app.services.oms_execution import oms_service
from app.services.opportunity_scanner import opportunity_scanner
from app.services.reconciliation import recon_service
from app.services.risk_engine import risk_engine
from app.services.spot_arb_scanner import spot_arb_scanner

logger = structlog.get_logger()


class EngineRunner:
    """
    Main trading engine orchestrator.

    Runs continuous cycles of:
    data -> signals -> risk -> execution -> reconciliation
    """

    def __init__(self):
        self._running = False
        self._paused_books: set = set()
        self._cycle_count = 0
        self._last_cycle_time: Optional[datetime] = None
        self._cycle_interval_seconds = 60  # 1 minute cycles
        self._freqtrade_hub: Optional[FreqTradeIntegrationHub] = None

    async def start(self):
        """Start the engine loop."""
        self._running = True
        logger.info("engine_starting", paper_mode=settings.is_paper_mode)

        # Initialize FreqTrade integration hub
        self._freqtrade_hub = FreqTradeIntegrationHub()
        await self._freqtrade_hub.initialize()
        await self._freqtrade_hub.start()
        logger.info("freqtrade_hub_initialized")

        # Initialize market data service (fallback)
        await market_data_service.initialize()

        # Start the main loop
        while self._running:
            try:
                await self.run_cycle()
                await asyncio.sleep(self._cycle_interval_seconds)
            except Exception as e:
                logger.error("engine_cycle_error", error=str(e))
                await asyncio.sleep(5)  # Short pause on error

    async def stop(self):
        """Stop the engine loop gracefully."""
        self._running = False
        logger.info("engine_stopping")

        # Shutdown FreqTrade hub
        if self._freqtrade_hub:
            await self._freqtrade_hub.shutdown()
            logger.info("freqtrade_hub_shutdown")

    async def run_cycle(self) -> Dict:
        """Execute one complete trading cycle."""
        cycle_start = datetime.utcnow()
        self._cycle_count += 1

        stats = {
            "cycle": self._cycle_count,
            "opportunities_scanned": 0,
            "intents_generated": 0,
            "intents_approved": 0,
            "intents_rejected": 0,
            "orders_placed": 0,
            "errors": [],
        }

        try:
            # 1. Update venue health
            await self._update_venue_health()

            # 2. Load books
            books = await self._load_books()

            # 3. Generate strategy intents using Opportunity Scanner
            scanner_intents = await opportunity_scanner.generate_intents(books)
            stats["opportunities_scanned"] = len(scanner_intents)
            # 4. Generate strategy intents using FreqTrade (optional)
            freqtrade_intents = await self._generate_freqtrade_intents(books)
            # 5. Generate basis intents (cash-and-carry)
            basis_intents = await basis_opportunity_scanner.generate_intents(books)
            # 6. Generate spot arbitrage intents
            spot_arb_intents = await spot_arb_scanner.generate_intents(books)
            intents = (
                scanner_intents + freqtrade_intents + basis_intents + spot_arb_intents
            )
            stats["intents_generated"] = len(intents)

            # 6. Run capital allocator and apply allocations
            total_capital = sum(book.capital_allocated for book in books)
            await capital_allocator_service.run_allocation(books, total_capital)
            intents = capital_allocator_service.apply_allocations(intents)

            # 4. Risk check each intent
            for intent in intents:
                # Skip paused books
                if intent.book_id in self._paused_books:
                    continue

                book = next((b for b in books if b.id == intent.book_id), None)
                if not book:
                    continue

                # Skip meme monitoring intents (they're just for logging)
                if intent.metadata.get("monitoring_only"):
                    continue

                # Run risk check
                result = await risk_engine.check_intent(intent, book)

                if result.decision == RiskDecision.APPROVE:
                    stats["intents_approved"] += 1

                    # Get venue for execution
                    venue_id, venue_name = await self._get_execution_venue(intent)
                    if not venue_id or not venue_name:
                        logger.warning("no_venue_for_intent", intent_id=str(intent.id))
                        continue

                    # Execute the intent via OMS (OMS handles order writes)
                    order = await oms_service.execute_intent(
                        intent, venue_id, venue_name
                    )
                    if order:
                        stats["orders_placed"] += 1
                        # Note: OMS handles all order writes, no duplicate write here

                elif result.decision == RiskDecision.REJECT:
                    stats["intents_rejected"] += 1
                    logger.info(
                        "intent_rejected",
                        intent_id=str(intent.id),
                        reasons=result.reasons,
                    )

            # 5. Reconciliation
            await recon_service.run_reconciliation()

            # 6. Write position snapshots
            await self._write_position_snapshots()

        except Exception as e:
            stats["errors"].append(str(e))
            logger.error("cycle_error", error=str(e))

        # Record cycle stats
        self._last_cycle_time = datetime.utcnow()
        cycle_duration = (self._last_cycle_time - cycle_start).total_seconds()

        logger.info(
            "cycle_complete",
            cycle=self._cycle_count,
            duration_sec=cycle_duration,
            stats=stats,
        )

        return stats

    async def _generate_freqtrade_intents(self, books: List[Book]) -> List[TradeIntent]:
        """Generate trade intents using FreqTrade strategies."""
        intents = []

        if not self._freqtrade_hub or not self._freqtrade_hub.is_running:
            logger.warning("freqtrade_hub_not_available")
            return intents

        try:
            # For each active book, generate signals for its instruments
            for book in books:
                # Get instruments for this book (simplified - would come from book config)
                instruments = [
                    "BTC-USD",
                    "ETH-USD",
                    "SOL-USD",
                ]  # TODO: Get from book config

                for instrument in instruments:
                    try:
                        # Get historical market data
                        market_data = await market_data_service.get_historical_data(
                            instrument=instrument, timeframe="1h", limit=100
                        )

                        if not market_data:
                            continue

                        # Generate signals using FreqTrade
                        signals = await self._freqtrade_hub.generate_signals(
                            market_data=market_data, pair=instrument
                        )

                        if signals and not signals.get("error"):
                            # Convert FreqTrade signals to TradeIntent
                            intent = self._convert_signal_to_intent(
                                signals, book, instrument
                            )
                            if intent:
                                intents.append(intent)

                    except Exception as e:
                        logger.error(
                            "signal_generation_failed",
                            instrument=instrument,
                            book_id=str(book.id),
                            error=str(e),
                        )
                        continue

        except Exception as e:
            logger.error("freqtrade_intent_generation_failed", error=str(e))

        return intents

    def _convert_signal_to_intent(
        self, signals: Dict, book: Book, instrument: str
    ) -> Optional[TradeIntent]:
        """Convert FreqTrade signal to TradeIntent."""
        try:
            # Extract signal data
            direction = signals.get("direction", "neutral")
            confidence = signals.get("confidence", 0)
            predicted_return = signals.get("predicted_return", 0)

            # Skip neutral or low confidence signals
            if direction == "neutral" or confidence < 0.6:
                return None

            # Map direction to OrderSide
            side = OrderSide.BUY if direction == "long" else OrderSide.SELL

            # Calculate target exposure (simplified)
            target_exposure = min(
                book.capital_allocated * 0.1,  # Max 10% per trade
                confidence * 10000,  # Scale by confidence
            )

            # Create TradeIntent
            from uuid import uuid4

            intent = TradeIntent(
                id=uuid4(),
                book_id=book.id,
                instrument=instrument,
                direction=side,
                target_exposure_usd=target_exposure,
                max_loss_usd=target_exposure * 0.02,  # 2% stop loss
                confidence=confidence,
                metadata={
                    "source": "freqtrade",
                    "predicted_return": predicted_return,
                    "model_type": signals.get("model_type", "freqai"),
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )

            return intent

        except Exception as e:
            logger.error("signal_conversion_failed", error=str(e))
            return None

    async def _load_books(self) -> List[Book]:
        """Load active books from database."""
        try:
            supabase = get_supabase()
            result = (
                supabase.table("books").select("*").eq("status", "active").execute()
            )

            return [
                Book(
                    id=UUID(b["id"]),
                    name=b["name"],
                    type=b["type"],
                    capital_allocated=b["capital_allocated"],
                    current_exposure=b["current_exposure"],
                    max_drawdown_limit=b["max_drawdown_limit"],
                    risk_tier=b["risk_tier"],
                    status=b["status"],
                )
                for b in result.data
            ]
        except Exception as e:
            logger.error("books_load_failed", error=str(e))
            return []

    async def _update_venue_health(self):
        """Update venue health status in database."""
        try:
            for venue_name, adapter in oms_service._adapters.items():
                health = await adapter.health_check()

                supabase = get_supabase()

                # Find venue ID
                venue_result = (
                    supabase.table("venues")
                    .select("id")
                    .ilike("name", f"%{venue_name}%")
                    .limit(1)
                    .execute()
                )

                if venue_result.data:
                    venue_id = venue_result.data[0]["id"]

                    # Upsert venue health
                    supabase.table("venue_health").upsert(
                        {
                            "venue_id": venue_id,
                            "status": health.status.value,
                            "latency_ms": health.latency_ms,
                            "error_rate": health.error_rate,
                            "last_heartbeat": datetime.utcnow().isoformat(),
                            "order_success_rate": 100.0 - health.error_rate,
                            "metadata": {"paper_mode": settings.is_paper_mode},
                        },
                        on_conflict="venue_id",
                    ).execute()

                    # Also update venues table status
                    supabase.table("venues").update(
                        {
                            "status": health.status.value,
                            "latency_ms": health.latency_ms,
                            "error_rate": health.error_rate,
                            "last_heartbeat": datetime.utcnow().isoformat(),
                        }
                    ).eq("id", venue_id).execute()

        except Exception as e:
            logger.error("venue_health_update_failed", error=str(e))

    async def _get_execution_venue(self, intent: TradeIntent) -> tuple:
        """Get venue ID and name for executing an intent."""
        try:
            supabase = get_supabase()

            # Get first healthy, enabled venue
            result = (
                supabase.table("venues")
                .select("id, name")
                .eq("is_enabled", True)
                .eq("status", "healthy")
                .limit(1)
                .execute()
            )

            if result.data:
                return UUID(result.data[0]["id"]), result.data[0]["name"]

            # Fallback to any enabled venue
            result = (
                supabase.table("venues")
                .select("id, name")
                .eq("is_enabled", True)
                .limit(1)
                .execute()
            )

            if result.data:
                return UUID(result.data[0]["id"]), result.data[0]["name"]

            return None, None

        except Exception as e:
            logger.error("venue_lookup_failed", error=str(e))
            return None, None

    async def _update_book_exposure(self, book: Book, order: Order):
        """Update book exposure after order fill."""
        try:
            supabase = get_supabase()

            # CRITICAL: Require valid fill price - never use 0
            if order.filled_price is None or order.filled_price <= 0:
                logger.error(
                    "invalid_fill_price_for_exposure",
                    order_id=str(order.id),
                    filled_price=order.filled_price,
                )
                # Log reconciliation issue instead of proceeding with bad data
                await create_alert(
                    title="Invalid Fill Price",
                    message=f"Order {order.id} has invalid fill price: {order.filled_price}. Cannot update exposure.",
                    severity="warning",
                    source="engine_runner",
                )
                return

            # Calculate new exposure with validated price
            fill_value = order.filled_size * order.filled_price

            if order.side == OrderSide.BUY:
                new_exposure = book.current_exposure + fill_value
            else:
                new_exposure = book.current_exposure - fill_value

            supabase.table("books").update(
                {
                    "current_exposure": max(0, new_exposure),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).eq("id", str(book.id)).execute()

        except Exception as e:
            logger.error("book_exposure_update_failed", error=str(e))

    async def _write_position_snapshots(self):
        """Write current positions to database."""
        try:
            # Get positions from all adapters
            for venue_name, adapter in oms_service._adapters.items():
                positions = await adapter.get_positions()

                # In paper mode, we maintain positions in memory
                # For now, just log
                logger.debug(
                    "position_snapshot", venue=venue_name, count=len(positions)
                )

        except Exception as e:
            logger.error("position_snapshot_failed", error=str(e))

    async def pause_book(
        self, book_id: UUID, reason: str, user_id: Optional[str] = None
    ):
        """Pause trading for a specific book."""
        self._paused_books.add(book_id)

        supabase = get_supabase()
        supabase.table("books").update({"status": "frozen"}).eq(
            "id", str(book_id)
        ).execute()

        await audit_log(
            action="book_paused",
            resource_type="book",
            resource_id=str(book_id),
            user_id=user_id,
            after_state={"status": "frozen", "reason": reason},
        )

        logger.info("book_paused", book_id=str(book_id), reason=reason)

    async def resume_book(self, book_id: UUID, user_id: Optional[str] = None):
        """Resume trading for a specific book."""
        self._paused_books.discard(book_id)

        supabase = get_supabase()
        supabase.table("books").update({"status": "active"}).eq(
            "id", str(book_id)
        ).execute()

        await audit_log(
            action="book_resumed",
            resource_type="book",
            resource_id=str(book_id),
            user_id=user_id,
            after_state={"status": "active"},
        )

        logger.info("book_resumed", book_id=str(book_id))

    def get_status(self) -> Dict:
        """Get engine status."""
        return {
            "running": self._running,
            "paper_mode": settings.is_paper_mode,
            "cycle_count": self._cycle_count,
            "last_cycle": self._last_cycle_time.isoformat()
            if self._last_cycle_time
            else None,
            "paused_books": [str(b) for b in self._paused_books],
            "adapters": list(oms_service._adapters.keys()),
        }


# Singleton instance
engine_runner = EngineRunner()
