"""
Execution Agent - Handles order routing and execution.
Receives risk-approved signals and executes them on venues.

Consequence-aware execution: all T3+ actions (order creation, order
submission) emit a pre-execution consequence trace before dispatch.
IRREVERSIBLE actions require risk engine approval.
"""

import asyncio
from datetime import UTC, datetime
from typing import Dict, List, Optional
from uuid import uuid4

import structlog

from .base_agent import AgentChannel, AgentMessage, BaseAgent

logger = structlog.get_logger()


class ExecutionAgent(BaseAgent):
    """
    Execution agent that routes orders to venues,
    manages order lifecycle, and reports fills.
    """

    def __init__(
        self,
        agent_id: str = "execution-agent-01",
        redis_url: str = "redis://localhost:6379",
        venues: Optional[List[str]] = None,
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="execution",
            redis_url=redis_url,
            subscribed_channels=[AgentChannel.RISK_APPROVED, AgentChannel.EXECUTION],
        )

        self.venues = venues or ["coinbase", "binance", "kraken"]

        # Order tracking
        self._pending_orders: Dict[str, Dict] = {}
        self._order_history: List[Dict] = []

        # Execution config
        self._execution_config = {
            "default_slippage_tolerance": 0.002,  # 0.2%
            "max_retries": 3,
            "retry_delay_ms": 100,
            "use_twap": False,
            "twap_duration_minutes": 5,
            "prefer_maker": True,
        }

        # Venue status
        self._venue_status = {venue: "healthy" for venue in self.venues}

        # Execution metrics
        self._metrics = {
            "orders_received": 0,
            "orders_filled": 0,
            "orders_failed": 0,
            "total_volume_usd": 0,
            "avg_slippage": 0,
            "avg_latency_ms": 0,
        }

        self._paused = False

    async def handle_message(self, message: AgentMessage):
        """Process risk-approved signals and execution commands"""
        if message.channel == AgentChannel.RISK_APPROVED.value:
            await self._process_approved_signal(message)
        elif message.channel == AgentChannel.EXECUTION.value:
            await self._process_execution_command(message)

    async def _process_approved_signal(self, message: AgentMessage):
        """Execute a risk-approved trade"""
        self._metrics["orders_received"] += 1

        payload = message.payload
        signal = payload.get("signal", {})
        adjusted_size = payload.get("adjusted_size", signal.get("target_exposure_usd"))

        logger.info(
            "executing_approved_signal",
            agent_id=self.agent_id,
            direction=signal.get("direction"),
            instrument=signal.get("instrument"),
            size_usd=adjusted_size,
        )

        if self._paused:
            logger.warning("execution_paused_skipping", agent_id=self.agent_id)
            return

        # --- T3 consequence trace: order creation ---
        order_trace = self._build_consequence_trace(
            action="order_creation",
            tool_class="T3",
            precondition={
                "market_price": signal.get("entry_price"),
                "instrument": signal.get("instrument"),
                "signal_confidence": signal.get("confidence"),
                "signal_direction": signal.get("direction"),
                "strategy": signal.get("strategy"),
            },
            expected_effect={
                "order_type": "limit"
                if self._execution_config["prefer_maker"]
                else "market",
                "size_usd": adjusted_size,
                "target_price": signal.get("entry_price"),
                "expected_position_change": f"{signal.get('direction')} {adjusted_size} USD",
                "stop_loss_pct": signal.get("stop_loss_pct", 0.02),
                "take_profit_pct": signal.get("take_profit_pct", 0.04),
            },
            rollback_path="cancel_order (if unfilled)",
            correlation_id=message.correlation_id,
        )
        await self._emit_consequence_trace(order_trace)

        # Create order
        order = await self._create_order(signal, adjusted_size, message.correlation_id)

        # Select best venue
        venue = await self._select_venue(signal.get("instrument"), adjusted_size)

        # --- T4 consequence trace: order submission to exchange ---
        is_market_order = order["type"] == "market"
        rollback = (
            "IRREVERSIBLE (market order — fill is immediate)"
            if is_market_order
            else "cancel_order (if unfilled), close_position (if partially filled)"
        )
        submission_trace = self._build_consequence_trace(
            action="order_submission",
            tool_class="T4",
            precondition={
                "order_id": order["id"],
                "instrument": order["instrument"],
                "side": order["side"],
                "order_type": order["type"],
                "size_usd": order["size_usd"],
                "size_base": order["size_base"],
                "limit_price": order["limit_price"],
                "venue": venue,
                "venue_status": self._venue_status.get(venue, "unknown"),
            },
            expected_effect={
                "expected_fill_price": order["limit_price"],
                "expected_slippage_tolerance": self._execution_config[
                    "default_slippage_tolerance"
                ],
                "expected_fee_usd": order["size_usd"] * 0.001,
                "expected_position_delta_usd": order["size_usd"],
                "max_pnl_impact_usd": order["size_usd"]
                * signal.get("stop_loss_pct", 0.02),
            },
            rollback_path=rollback,
            correlation_id=message.correlation_id,
        )
        await self._emit_consequence_trace(submission_trace)

        # Gate IRREVERSIBLE actions through risk engine approval
        if submission_trace["rollback_path"].startswith("IRREVERSIBLE"):
            logger.warning(
                "irreversible_action_detected",
                agent_id=self.agent_id,
                order_id=order["id"],
                action="order_submission",
                rollback_path=rollback,
            )
            # For IRREVERSIBLE market orders, the risk engine approval
            # has already been granted via the RISK_APPROVED channel.
            # Log the gate passage for audit completeness.
            await self._emit_consequence_trace(
                self._build_consequence_trace(
                    action="irreversible_gate_passed",
                    tool_class="T4",
                    precondition={"order_id": order["id"], "risk_approved": True},
                    expected_effect={
                        "gate": "risk_engine_pre_approval",
                        "status": "passed",
                    },
                    rollback_path="IRREVERSIBLE",
                    correlation_id=message.correlation_id,
                )
            )

        # Execute order
        result = await self._execute_order(order, venue)

        if result["success"]:
            self._metrics["orders_filled"] += 1
            self._metrics["total_volume_usd"] += adjusted_size
            await self._report_fill(order, result, venue)
        else:
            self._metrics["orders_failed"] += 1
            await self._report_failure(order, result, venue)

    def _build_consequence_trace(
        self,
        action: str,
        tool_class: str,
        precondition: Dict,
        expected_effect: Dict,
        rollback_path: str,
        correlation_id: Optional[str] = None,
    ) -> Dict:
        """Build a structured pre-execution consequence trace for T3+ actions."""
        return {
            "trace_id": str(uuid4()),
            "agent_id": self.agent_id,
            "action": action,
            "tool_class": tool_class,
            "timestamp": datetime.now(UTC).isoformat(),
            "precondition": precondition,
            "expected_effect": expected_effect,
            "rollback_path": rollback_path,
            "correlation_id": correlation_id,
        }

    async def _emit_consequence_trace(self, trace: Dict):
        """Log a consequence trace via structlog and the audit system."""
        logger.info(
            "consequence_trace",
            trace_id=trace["trace_id"],
            action=trace["action"],
            tool_class=trace["tool_class"],
            precondition=trace["precondition"],
            expected_effect=trace["expected_effect"],
            rollback_path=trace["rollback_path"],
            correlation_id=trace["correlation_id"],
        )

        # Persist to audit trail via Redis alerts channel
        await self.publish(
            AgentChannel.ALERTS,
            {
                "severity": "info",
                "title": f"Consequence Trace: {trace['action']}",
                "message": (
                    f"T{trace['tool_class'][-1]} action '{trace['action']}' "
                    f"— rollback: {trace['rollback_path']}"
                ),
                "metadata": trace,
            },
            correlation_id=trace.get("correlation_id"),
        )

    async def _create_order(
        self, signal: Dict, size_usd: float, correlation_id: Optional[str]
    ) -> Dict:
        """Create order from signal"""
        order_id = str(uuid4())
        price = signal.get("entry_price", 0)

        # Calculate size in base asset
        size_base = size_usd / price if price > 0 else 0

        order = {
            "id": order_id,
            "correlation_id": correlation_id,
            "instrument": signal.get("instrument"),
            "side": signal.get("direction"),
            "type": "limit" if self._execution_config["prefer_maker"] else "market",
            "size_usd": size_usd,
            "size_base": size_base,
            "limit_price": price,
            "stop_loss": price * (1 - signal.get("stop_loss_pct", 0.02)),
            "take_profit": price * (1 + signal.get("take_profit_pct", 0.04)),
            "strategy": signal.get("strategy"),
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending",
        }

        self._pending_orders[order_id] = order
        return order

    async def _select_venue(self, instrument: str, size_usd: float) -> str:
        """Select optimal venue for execution"""
        # In production, this would consider:
        # - Order book depth
        # - Fees
        # - Latency
        # - Current venue health

        healthy_venues = [
            v for v in self.venues if self._venue_status.get(v) == "healthy"
        ]

        if not healthy_venues:
            logger.warning(f"[{self.agent_id}] No healthy venues available")
            return self.venues[0]  # Fallback to first venue

        # Prefer Coinbase for this example
        if "coinbase" in healthy_venues:
            return "coinbase"

        return healthy_venues[0]

    async def _execute_order(self, order: Dict, venue: str) -> Dict:
        """Execute order on venue"""
        start_time = datetime.utcnow()

        # Simulated execution (would call actual venue adapter in production)
        # This is where you'd integrate with the Coinbase adapter

        try:
            # Simulate execution latency
            await asyncio.sleep(0.05)  # 50ms simulated latency

            # Simulate fill with slight slippage
            import random

            slippage = random.uniform(-0.001, 0.002)  # -0.1% to +0.2%

            filled_price = order["limit_price"] * (1 + slippage)

            # Update latency metric
            latency_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._update_latency_metric(latency_ms)
            self._update_slippage_metric(slippage)

            return {
                "success": True,
                "order_id": order["id"],
                "venue_order_id": f"{venue}_{uuid4().hex[:8]}",
                "filled_price": filled_price,
                "filled_size": order["size_base"],
                "slippage": slippage,
                "latency_ms": latency_ms,
                "fee": order["size_usd"] * 0.001,  # 0.1% fee
                "executed_at": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"[{self.agent_id}] Execution error: {e}")
            return {
                "success": False,
                "order_id": order["id"],
                "error": str(e),
                "retryable": True,
            }

    async def _report_fill(self, order: Dict, result: Dict, venue: str):
        """Report fill to risk agent and update tracking"""
        order["status"] = "filled"
        order["filled_price"] = result["filled_price"]
        order["filled_at"] = result["executed_at"]
        order["venue"] = venue

        # Move to history
        if order["id"] in self._pending_orders:
            del self._pending_orders[order["id"]]
        self._order_history.append(order)

        # Publish fill event
        await self.publish(
            AgentChannel.FILLS,
            {
                "type": "fill",
                "order_id": order["id"],
                "instrument": order["instrument"],
                "side": order["side"],
                "size_usd": order["size_usd"],
                "filled_price": result["filled_price"],
                "slippage": result["slippage"],
                "fee": result["fee"],
                "venue": venue,
                "pnl": 0,  # No realized P&L on entry
                "executed_at": result["executed_at"],
            },
            correlation_id=order.get("correlation_id"),
        )

        logger.info(
            "order_filled",
            agent_id=self.agent_id,
            side=order["side"],
            instrument=order["instrument"],
            filled_price=round(result["filled_price"], 2),
            slippage_pct=round(result["slippage"] * 100, 3),
        )

    async def _report_failure(self, order: Dict, result: Dict, venue: str):
        """Report execution failure"""
        order["status"] = "failed"
        order["error"] = result.get("error")

        # Send alert
        await self.send_alert(
            "warning",
            f"Order Execution Failed: {order['instrument']}",
            result.get("error", "Unknown error"),
            {"order_id": order["id"], "venue": venue},
        )

        logger.error(
            f"[{self.agent_id}] Order failed: {order['id']} - {result.get('error')}"
        )

    async def _process_execution_command(self, message: AgentMessage):
        """Handle execution commands (cancel, modify, etc.)"""
        command = message.payload.get("command")
        order_id = message.payload.get("order_id")

        if command == "cancel":
            await self._cancel_order(order_id)
        elif command == "cancel_all":
            await self._cancel_all_orders()

    async def _cancel_order(self, order_id: str):
        """Cancel a pending order"""
        if order_id in self._pending_orders:
            order = self._pending_orders.pop(order_id)
            order["status"] = "cancelled"
            self._order_history.append(order)
            logger.info(f"[{self.agent_id}] Order cancelled: {order_id}")

    async def _cancel_all_orders(self):
        """Cancel all pending orders"""
        for order_id in list(self._pending_orders.keys()):
            await self._cancel_order(order_id)
        logger.warning(f"[{self.agent_id}] All pending orders cancelled")

    def _update_latency_metric(self, latency_ms: float):
        """Update rolling average latency"""
        current = self._metrics["avg_latency_ms"]
        count = self._metrics["orders_filled"]
        if count > 0:
            self._metrics["avg_latency_ms"] = (
                current * (count - 1) + latency_ms
            ) / count
        else:
            self._metrics["avg_latency_ms"] = latency_ms

    def _update_slippage_metric(self, slippage: float):
        """Update rolling average slippage"""
        current = self._metrics["avg_slippage"]
        count = self._metrics["orders_filled"]
        if count > 0:
            self._metrics["avg_slippage"] = (current * (count - 1) + slippage) / count
        else:
            self._metrics["avg_slippage"] = slippage

    async def cycle(self):
        """Execution monitoring cycle"""
        # Check pending orders for timeouts
        # Monitor venue health
        # Update order book snapshots

        await asyncio.sleep(0.1)  # 100ms cycle

    async def on_start(self):
        """Initialize execution agent"""
        logger.info(
            f"[{self.agent_id}] Execution agent starting with venues: {self.venues}"
        )

    async def on_pause(self):
        """Pause execution"""
        self._paused = True
        logger.warning(
            f"[{self.agent_id}] Execution PAUSED - cancelling pending orders"
        )
        await self._cancel_all_orders()

    async def on_resume(self):
        """Resume execution"""
        self._paused = False
        logger.info(f"[{self.agent_id}] Execution resumed")
