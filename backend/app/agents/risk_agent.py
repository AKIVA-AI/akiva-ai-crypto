"""
Risk Agent - Pre-trade and real-time risk management.
Validates all trade intents against risk limits before execution.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict

from .base_agent import AgentChannel, AgentMessage, BaseAgent

logger = logging.getLogger(__name__)


class RiskAgent(BaseAgent):
    """
    Risk management agent that validates trade intents
    against configurable risk limits and portfolio constraints.
    """

    def __init__(
        self, agent_id: str = "risk-agent-01", redis_url: str = "redis://localhost:6379"
    ):
        super().__init__(
            agent_id=agent_id,
            agent_type="risk",
            redis_url=redis_url,
            subscribed_channels=[AgentChannel.RISK_CHECK, AgentChannel.FILLS],
        )

        # Load risk limits from config (with hardcoded fallbacks)
        from app.core.trading_config import trading_config

        self._config_limits = trading_config.risk_limits
        self._risk_limits = {
            "max_position_size_usd": self._config_limits.get(
                "max_position_size_usd", 50000
            ),
            "max_portfolio_exposure_usd": self._config_limits.get(
                "max_portfolio_exposure_usd", 500000
            ),
            "max_single_trade_usd": self._config_limits.get(
                "max_single_trade_usd", 25000
            ),
            "max_leverage": self._config_limits.get("max_leverage", 3.0),
            "max_concentration_pct": self._config_limits.get(
                "max_concentration_pct", 25.0
            ),
            "max_daily_loss_usd": self._config_limits.get("max_daily_loss_usd", 10000),
            "max_drawdown_pct": self._config_limits.get("max_drawdown_pct", 5.0),
            "min_confidence_threshold": self._config_limits.get(
                "min_confidence_threshold", 50.0
            ),
            "max_correlation_exposure": self._config_limits.get(
                "max_correlation_exposure", 0.7
            ),
        }

        # Portfolio state
        self._positions: Dict[str, Dict] = {}
        self._daily_pnl = 0.0
        self._total_exposure = 0.0
        self._pending_orders: Dict[str, Dict] = {}

        # Risk metrics
        self._risk_metrics = {
            "intents_received": 0,
            "intents_approved": 0,
            "intents_rejected": 0,
            "kill_switch_triggered": False,
        }

        self._paused = False

    async def handle_message(self, message: AgentMessage):
        """Process incoming risk check requests and fills"""
        if message.channel == AgentChannel.RISK_CHECK.value:
            await self._process_risk_check(message)
        elif message.channel == AgentChannel.FILLS.value:
            await self._process_fill(message.payload)

    async def _process_risk_check(self, message: AgentMessage):
        """Validate trade intent against risk limits"""
        self._risk_metrics["intents_received"] += 1

        payload = message.payload
        signal = payload.get("signal", {})

        logger.info(
            f"[{self.agent_id}] Received risk check: "
            f"{signal.get('direction')} {signal.get('instrument')} "
            f"${signal.get('target_exposure_usd')}"
        )

        # Run risk checks
        decision = await self._evaluate_risk(signal)

        if decision["approved"]:
            self._risk_metrics["intents_approved"] += 1
            await self.publish(
                AgentChannel.RISK_APPROVED,
                {
                    "signal": signal,
                    "decision": decision,
                    "adjusted_size": decision.get(
                        "adjusted_size", signal.get("target_exposure_usd")
                    ),
                    "risk_score": decision.get("risk_score", 0),
                },
                correlation_id=message.correlation_id,
            )
            logger.info(f"[{self.agent_id}] APPROVED: {signal.get('instrument')}")
        else:
            self._risk_metrics["intents_rejected"] += 1
            await self.publish(
                AgentChannel.RISK_REJECTED,
                {
                    "signal": signal,
                    "decision": decision,
                    "rejection_reasons": decision.get("rejection_reasons", []),
                },
                correlation_id=message.correlation_id,
            )
            logger.warning(
                f"[{self.agent_id}] REJECTED: {signal.get('instrument')} - "
                f"{decision.get('rejection_reasons')}"
            )

    async def _evaluate_risk(self, signal: Dict) -> Dict:
        """Run all risk checks on a trade intent"""
        rejection_reasons = []
        risk_score = 0
        adjusted_size = signal.get("target_exposure_usd", 0)

        # Check 1: Kill switch
        if self._risk_metrics["kill_switch_triggered"]:
            rejection_reasons.append("Kill switch is active")
            return {"approved": False, "rejection_reasons": rejection_reasons}

        # Check 2: Agent paused
        if self._paused:
            rejection_reasons.append("Risk agent is paused")
            return {"approved": False, "rejection_reasons": rejection_reasons}

        # Check 3: Confidence threshold
        confidence = signal.get("confidence", 0)
        if confidence < self._risk_limits["min_confidence_threshold"]:
            rejection_reasons.append(
                f"Confidence {confidence}% below threshold {self._risk_limits['min_confidence_threshold']}%"
            )
            risk_score += 20

        # Check 4: Single trade size
        if adjusted_size > self._risk_limits["max_single_trade_usd"]:
            # Scale down instead of reject
            adjusted_size = self._risk_limits["max_single_trade_usd"]
            risk_score += 10

        # Check 5: Position concentration
        instrument = signal.get("instrument", "")
        existing_position = self._positions.get(instrument, {})
        existing_size = existing_position.get("size_usd", 0)
        new_total = existing_size + adjusted_size

        if new_total > self._risk_limits["max_position_size_usd"]:
            # Check if we can add at reduced size
            remaining_capacity = (
                self._risk_limits["max_position_size_usd"] - existing_size
            )
            if remaining_capacity > 0:
                adjusted_size = remaining_capacity
                risk_score += 15
            else:
                rejection_reasons.append(
                    f"Position limit reached for {instrument}: ${existing_size}"
                )

        # Check 6: Portfolio exposure
        new_exposure = self._total_exposure + adjusted_size
        if new_exposure > self._risk_limits["max_portfolio_exposure_usd"]:
            remaining_capacity = (
                self._risk_limits["max_portfolio_exposure_usd"] - self._total_exposure
            )
            if remaining_capacity > 1000:  # Min trade size
                adjusted_size = min(adjusted_size, remaining_capacity)
                risk_score += 15
            else:
                rejection_reasons.append(
                    f"Portfolio exposure limit: ${self._total_exposure}/{self._risk_limits['max_portfolio_exposure_usd']}"
                )

        # Check 7: Daily loss limit
        if self._daily_pnl < -self._risk_limits["max_daily_loss_usd"]:
            rejection_reasons.append(f"Daily loss limit breached: ${self._daily_pnl}")
            # Trigger kill switch on severe loss
            kill_multiplier = self._config_limits.get("kill_switch_multiplier", 1.5)
            if (
                self._daily_pnl
                < -self._risk_limits["max_daily_loss_usd"] * kill_multiplier
            ):
                await self._trigger_kill_switch("Daily loss limit exceeded")

        # Check 8: Concentration check
        # Recalculate new_total with the (possibly reduced) adjusted_size
        new_total = existing_size + adjusted_size
        # Only check concentration when portfolio holds more than one instrument,
        # since a single-instrument portfolio is trivially 100% concentrated.
        other_instruments = [k for k in self._positions if k != instrument]
        if self._total_exposure > 0 and len(other_instruments) > 0:
            total_after = self._total_exposure + adjusted_size
            concentration = (new_total / total_after) * 100
            if concentration > self._risk_limits["max_concentration_pct"]:
                rejection_reasons.append(
                    f"Concentration too high: {concentration:.1f}%"
                )
                risk_score += 20

        # Final decision
        approved = len(rejection_reasons) == 0

        return {
            "approved": approved,
            "rejection_reasons": rejection_reasons,
            "risk_score": risk_score,
            "adjusted_size": adjusted_size,
            "checks_performed": [
                "kill_switch",
                "confidence_threshold",
                "single_trade_size",
                "position_concentration",
                "portfolio_exposure",
                "daily_loss_limit",
                "concentration",
            ],
            "evaluated_at": datetime.utcnow().isoformat(),
        }

    async def _process_fill(self, fill: Dict):
        """Update portfolio state on fill"""
        instrument = fill.get("instrument")
        side = fill.get("side")
        size_usd = fill.get("size_usd", 0)
        pnl = fill.get("pnl", 0)

        # Update position
        if instrument:
            if instrument not in self._positions:
                self._positions[instrument] = {"size_usd": 0, "side": side}

            pos = self._positions[instrument]
            if side == "buy":
                pos["size_usd"] += size_usd
            else:
                pos["size_usd"] -= size_usd

            # Remove closed positions
            if abs(pos["size_usd"]) < 1:
                del self._positions[instrument]

        # Update exposure
        self._total_exposure = sum(
            abs(p.get("size_usd", 0)) for p in self._positions.values()
        )

        # Update daily P&L
        self._daily_pnl += pnl

        logger.info(
            f"[{self.agent_id}] Fill processed: {instrument} {side} ${size_usd} "
            f"(Total exposure: ${self._total_exposure}, Daily P&L: ${self._daily_pnl})"
        )

    async def _trigger_kill_switch(self, reason: str):
        """Activate kill switch and halt all trading"""
        self._risk_metrics["kill_switch_triggered"] = True

        logger.critical(f"[{self.agent_id}] KILL SWITCH TRIGGERED: {reason}")

        # Notify all agents
        await self.publish(
            AgentChannel.CONTROL,
            {
                "command": "pause",
                "reason": f"Kill switch: {reason}",
                "triggered_by": self.agent_id,
            },
        )

        # Send critical alert
        await self.send_alert(
            "critical",
            "Kill Switch Activated",
            reason,
            {"daily_pnl": self._daily_pnl, "total_exposure": self._total_exposure},
        )

    async def cycle(self):
        """Risk monitoring cycle"""
        # Check for stale positions (would query DB in production)
        # Monitor real-time P&L
        # Check for correlation risks

        await asyncio.sleep(0.5)  # 500ms cycle

    async def on_start(self):
        """Initialize risk limits from DB"""
        logger.info(
            f"[{self.agent_id}] Risk agent starting with limits: {self._risk_limits}"
        )

    async def on_pause(self):
        """Pause risk approvals"""
        self._paused = True
        logger.warning(
            f"[{self.agent_id}] Risk agent PAUSED - no approvals will be granted"
        )

    async def on_resume(self):
        """Resume risk approvals"""
        self._paused = False
        logger.info(f"[{self.agent_id}] Risk agent resumed")

    def reset_kill_switch(self):
        """Admin function to reset kill switch"""
        self._risk_metrics["kill_switch_triggered"] = False
        logger.warning(f"[{self.agent_id}] Kill switch RESET")
