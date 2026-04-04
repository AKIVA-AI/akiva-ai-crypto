"""
Execution Planner - builds and executes multi-leg plans with safety guards.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog

from app.database import audit_log, create_alert
from app.models.domain import Order, OrderSide, OrderStatus, TradeIntent
from app.models.opportunity import ExecutionLeg, ExecutionMode, ExecutionPlan

logger = structlog.get_logger()


class ExecutionPlanner:
    """Plan and execute orders with legging and unwind protections."""

    def build_single_leg_plan(
        self,
        intent: TradeIntent,
        venue_name: str,
        size: float,
        order_type: str = "market",
    ) -> ExecutionPlan:
        leg = ExecutionLeg(
            venue=venue_name,
            instrument=intent.instrument,
            side=intent.direction,
            size=size,
            order_type=order_type,
        )
        return ExecutionPlan(
            mode=ExecutionMode.LEGGED,
            legs=[leg],
            metadata={"intent_id": str(intent.id)},
        )

    async def execute_plan(
        self,
        intent: TradeIntent,
        plan: ExecutionPlan,
        adapters: Dict[str, Any],
        save_order_callback,
        event_recorder: Optional[Callable[[str, ExecutionLeg, Dict], None]] = None,
        venue_id_resolver: Optional[Callable[[str], Optional[str]]] = None,
    ) -> List[Order]:
        if plan.mode == ExecutionMode.ATOMIC and len(plan.legs) > 1:
            await self._record_action(
                intent,
                "atomic_not_supported",
                "Atomic execution not supported for multi-leg plans",
                severity="warning",
            )
            return []

        executed_orders: List[Tuple[Order, str]] = []
        last_leg_time: Optional[datetime] = None

        for leg in plan.legs:
            adapter = adapters.get(leg.venue.lower())
            if not adapter:
                await self._record_action(
                    intent,
                    "leg_missing_adapter",
                    f"Missing adapter for {leg.venue}",
                    severity="warning",
                )
                return await self._unwind_if_needed(
                    intent,
                    plan,
                    executed_orders,
                    adapters,
                    save_order_callback,
                    event_recorder,
                )

            now = datetime.now(timezone.utc)
            if last_leg_time:
                delta_ms = (now - last_leg_time).total_seconds() * 1000
                if delta_ms > plan.max_time_between_legs_ms:
                    await self._record_action(
                        intent,
                        "leg_time_exceeded",
                        f"Exceeded max leg interval ({delta_ms:.0f} ms)",
                        severity="warning",
                    )
                    return await self._unwind_if_needed(
                        intent,
                        plan,
                        executed_orders,
                        adapters,
                        save_order_callback,
                        event_recorder,
                    )

            order = Order(
                id=uuid4(),
                book_id=intent.book_id,
                strategy_id=intent.strategy_id,
                venue_id=None,
                instrument=leg.instrument,
                side=leg.side,
                size=leg.size,
                order_type=leg.order_type,
                price=leg.limit_price,
                status=OrderStatus.OPEN,
            )
            if venue_id_resolver:
                venue_id = venue_id_resolver(leg.venue)
                if venue_id:
                    order.venue_id = venue_id

            try:
                if event_recorder:
                    await event_recorder(
                        "leg_submitted", leg, {"intent_id": str(intent.id)}
                    )
                leg_start = datetime.now(timezone.utc)
                executed = await adapter.place_order(order)
                executed.latency_ms = int(
                    (datetime.now(timezone.utc) - leg_start).total_seconds() * 1000
                )
                await save_order_callback(executed)
                executed_orders.append((executed, leg.venue))
                last_leg_time = datetime.now(timezone.utc)
                if event_recorder:
                    await event_recorder(
                        "leg_executed",
                        leg,
                        {
                            "intent_id": str(intent.id),
                            "status": executed.status.value,
                            "filled_size": executed.filled_size,
                            "filled_price": executed.filled_price,
                        },
                    )
            except Exception as exc:
                logger.error("leg_execution_failed", error=str(exc), leg=leg.venue)
                if event_recorder:
                    await event_recorder(
                        "leg_failed",
                        leg,
                        {"intent_id": str(intent.id), "error": str(exc)},
                    )
                return await self._unwind_if_needed(
                    intent,
                    plan,
                    executed_orders,
                    adapters,
                    save_order_callback,
                    event_recorder,
                )

            if executed.status in (OrderStatus.REJECTED, OrderStatus.CANCELLED):
                if event_recorder:
                    await event_recorder(
                        "leg_rejected", leg, {"intent_id": str(intent.id)}
                    )
                return await self._unwind_if_needed(
                    intent,
                    plan,
                    executed_orders,
                    adapters,
                    save_order_callback,
                    event_recorder,
                )

        return [order for order, _ in executed_orders]

    async def _unwind_if_needed(
        self,
        intent: TradeIntent,
        plan: ExecutionPlan,
        executed_orders: List[Tuple[Order, str]],
        adapters: Dict[str, Any],
        save_order_callback,
        event_recorder: Optional[Callable[[str, ExecutionLeg, Dict], None]] = None,
    ) -> List[Order]:
        if not plan.unwind_on_fail or not executed_orders:
            return []

        await self._record_action(
            intent,
            "unwind_triggered",
            "Unwinding executed legs after failure",
            severity="critical",
        )

        for order, venue in executed_orders:
            adapter = adapters.get(venue.lower())

            if not adapter:
                continue

            unwind_order = Order(
                id=uuid4(),
                book_id=order.book_id,
                strategy_id=order.strategy_id,
                venue_id=order.venue_id,
                instrument=order.instrument,
                side=OrderSide.SELL if order.side == OrderSide.BUY else OrderSide.BUY,
                size=order.filled_size or order.size,
                order_type="market",
                status=OrderStatus.OPEN,
            )
            try:
                if event_recorder:
                    await event_recorder(
                        "unwind_submitted",
                        ExecutionLeg(
                            venue=venue,
                            instrument=order.instrument,
                            side=unwind_order.side,
                            size=unwind_order.size,
                            order_type="market",
                        ),
                        {"intent_id": str(intent.id)},
                    )
                executed_unwind = await adapter.place_order(unwind_order)
                await save_order_callback(executed_unwind)
            except Exception as exc:
                logger.error("unwind_failed", error=str(exc), order_id=str(order.id))

        return []

    async def _record_action(
        self, intent: TradeIntent, action: str, message: str, severity: str
    ) -> None:
        await create_alert(
            title=f"Execution Planner: {action}",
            message=message,
            severity=severity,
            source="execution_planner",
            metadata={"intent_id": str(intent.id)},
        )
        await audit_log(
            action=action,
            resource_type="trade_intent",
            resource_id=str(intent.id),
            severity=severity,
            after_state={"message": message},
        )
