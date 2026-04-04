"""
Smart Order Router & Algorithmic Execution Engine

Implements institutional-grade order routing and execution algorithms:
- Smart order routing with venue selection optimization
- Algorithmic execution (TWAP, VWAP, POV, Iceberg)
- Market impact modeling and minimization
- Execution quality analytics
- Liquidity analysis and fragmentation handling
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import structlog

logger = structlog.get_logger()


@dataclass
class VenueLiquidity:
    """Venue liquidity profile."""

    venue_id: str
    venue_name: str
    daily_volume: float
    spread_bps: float
    market_depth: float
    latency_ms: int
    fee_structure: Dict[str, float]
    reliability_score: float
    max_order_size: Optional[float]


@dataclass
class ExecutionAlgorithm:
    """Algorithmic execution parameters."""

    algorithm_type: str  # 'twap', 'vwap', 'pov', 'iceberg', 'adaptive'
    total_quantity: float
    time_horizon_minutes: int
    start_time: datetime
    end_time: datetime
    participation_rate: Optional[float]  # For POV
    iceberg_size: Optional[float]  # For iceberg
    price_limit: Optional[float]
    venue_restrictions: Optional[List[str]]


@dataclass
class RoutingDecision:
    """Order routing decision."""

    instrument: str
    side: str
    quantity: float
    venue_id: str
    execution_algorithm: str
    estimated_price_impact: float
    estimated_slippage: float
    expected_execution_time: int  # seconds
    confidence_score: float
    reasoning: str


@dataclass
class ExecutionQuality:
    """Execution quality metrics."""

    order_id: str
    instrument: str
    side: str
    total_quantity: float
    executed_quantity: float
    average_price: float
    benchmark_price: float
    price_improvement: float
    market_impact: float
    timing_risk: float
    execution_time_seconds: int
    completion_rate: float
    isq_score: float  # Implementation Shortfall Quality


class SmartOrderRouter:
    """
    Intelligent order routing and execution engine.

    Features:
    - Multi-venue optimization
    - Algorithmic execution strategies
    - Market impact modeling
    - Execution quality measurement
    - Real-time adaptation
    """

    def __init__(self):
        self.venue_cache: Dict[str, VenueLiquidity] = {}
        self.market_data_cache: Dict[str, Any] = {}
        self.execution_history: List[ExecutionQuality] = []

    async def route_order(
        self,
        instrument: str,
        side: str,
        quantity: float,
        order_type: str = "market",
        constraints: Optional[Dict[str, Any]] = None,
    ) -> RoutingDecision:
        """
        Route order to optimal venue with execution algorithm selection.

        Considers:
        - Liquidity availability
        - Price impact minimization
        - Fee optimization
        - Venue reliability
        - Execution speed requirements
        """
        # Get available venues and their liquidity profiles
        venues = await self._get_available_venues(instrument)

        if not venues:
            raise ValueError(f"No venues available for {instrument}")

        # Score each venue for this order
        venue_scores = []
        for venue in venues:
            score = await self._score_venue_for_order(
                venue, instrument, side, quantity, constraints
            )
            venue_scores.append((venue, score))

        # Select best venue
        best_venue, best_score = max(venue_scores, key=lambda x: x[1])

        # Select execution algorithm
        algorithm = await self._select_execution_algorithm(
            instrument, side, quantity, best_venue, constraints
        )

        # Calculate execution metrics
        price_impact = await self._estimate_price_impact(
            instrument, side, quantity, best_venue
        )
        slippage = await self._estimate_slippage(
            instrument, side, quantity, best_venue, order_type
        )
        execution_time = await self._estimate_execution_time(
            quantity, best_venue, algorithm
        )

        return RoutingDecision(
            instrument=instrument,
            side=side,
            quantity=quantity,
            venue_id=best_venue.venue_id,
            execution_algorithm=algorithm.algorithm_type,
            estimated_price_impact=price_impact,
            estimated_slippage=slippage,
            expected_execution_time=execution_time,
            confidence_score=best_score,
            reasoning=f"Selected {best_venue.venue_name} with {algorithm.algorithm_type} algorithm",
        )

    async def execute_algorithmic_order(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """
        Execute order using specified algorithmic strategy.

        Returns list of child orders with execution details.
        """
        if algorithm.algorithm_type == "twap":
            return await self._execute_twap(algorithm, instrument, side, venue_id)
        elif algorithm.algorithm_type == "vwap":
            return await self._execute_vwap(algorithm, instrument, side, venue_id)
        elif algorithm.algorithm_type == "pov":
            return await self._execute_pov(algorithm, instrument, side, venue_id)
        elif algorithm.algorithm_type == "iceberg":
            return await self._execute_iceberg(algorithm, instrument, side, venue_id)
        elif algorithm.algorithm_type == "adaptive":
            return await self._execute_adaptive(algorithm, instrument, side, venue_id)
        else:
            raise ValueError(f"Unknown algorithm type: {algorithm.algorithm_type}")

    async def measure_execution_quality(
        self,
        order_id: str,
        executed_trades: List[Dict[str, Any]],
        benchmark_price: float,
    ) -> ExecutionQuality:
        """
        Measure and analyze execution quality against benchmarks.

        Calculates ISQ (Implementation Shortfall Quality) and other metrics.
        """
        if not executed_trades:
            return ExecutionQuality(
                order_id=order_id,
                instrument="",
                side="",
                total_quantity=0,
                executed_quantity=0,
                average_price=0,
                benchmark_price=benchmark_price,
                price_improvement=0,
                market_impact=0,
                timing_risk=0,
                execution_time_seconds=0,
                completion_rate=0,
                isq_score=0,
            )

        # Aggregate execution statistics
        total_quantity = sum(trade["quantity"] for trade in executed_trades)
        executed_quantity = sum(trade["executed_quantity"] for trade in executed_trades)
        total_value = sum(
            trade["price"] * trade["executed_quantity"] for trade in executed_trades
        )
        average_price = total_value / executed_quantity if executed_quantity > 0 else 0

        # Calculate price improvement
        price_improvement = (benchmark_price - average_price) / benchmark_price
        if executed_trades[0]["side"] == "sell":  # Reverse for sell orders
            price_improvement = -price_improvement

        # Estimate market impact
        market_impact = await self._calculate_market_impact(executed_trades)

        # Calculate timing risk
        execution_times = [trade["timestamp"] for trade in executed_trades]
        timing_risk = self._calculate_timing_risk(execution_times)

        # Calculate ISQ score (0-100 scale)
        isq_score = self._calculate_isq_score(
            price_improvement, market_impact, timing_risk
        )

        completion_rate = executed_quantity / total_quantity

        # Get execution duration
        start_time = min(execution_times)
        end_time = max(execution_times)
        execution_duration = (end_time - start_time).total_seconds()

        return ExecutionQuality(
            order_id=order_id,
            instrument=executed_trades[0]["instrument"],
            side=executed_trades[0]["side"],
            total_quantity=total_quantity,
            executed_quantity=executed_quantity,
            average_price=average_price,
            benchmark_price=benchmark_price,
            price_improvement=price_improvement,
            market_impact=market_impact,
            timing_risk=timing_risk,
            execution_time_seconds=int(execution_duration),
            completion_rate=completion_rate,
            isq_score=isq_score,
        )

    async def analyze_market_impact(
        self, instrument: str, side: str, quantity: float, venue_id: str
    ) -> Dict[str, float]:
        """
        Analyze expected market impact of an order.

        Uses Almgren-Chriss model and empirical analysis.
        """
        # Get venue liquidity data
        venue = await self._get_venue_liquidity(venue_id, instrument)

        # Get recent market data
        market_data = await self._get_market_data(instrument)

        # Calculate participation rate
        participation_rate = min(quantity / venue.daily_volume * 365, 1.0)  # Annualized

        # Almgren-Chriss permanent impact
        sigma = market_data.get("volatility", 0.02)
        adv = venue.daily_volume / 252  # Average daily volume

        permanent_impact = 0.5 * sigma * (quantity / adv) ** 0.5

        # Temporary impact (spread + market depth)
        spread_impact = venue.spread_bps / 10000  # Convert bps to decimal
        depth_impact = participation_rate * 0.001  # Rough estimate

        temporary_impact = spread_impact + depth_impact

        # Total impact
        total_impact = permanent_impact + temporary_impact

        return {
            "permanent_impact": permanent_impact,
            "temporary_impact": temporary_impact,
            "total_impact": total_impact,
            "participation_rate": participation_rate,
            "estimated_slippage_bps": total_impact * 10000,
        }

    # Private methods

    async def _get_available_venues(self, instrument: str) -> List[VenueLiquidity]:
        """Get all available venues for an instrument."""
        # Mock venue data - in production, fetch from database
        venues = [
            VenueLiquidity(
                venue_id="binance",
                venue_name="Binance",
                daily_volume=1000000000,  # $1B daily
                spread_bps=2.0,
                market_depth=0.8,
                latency_ms=50,
                fee_structure={"maker": 0.001, "taker": 0.001},
                reliability_score=0.95,
                max_order_size=1000000,
            ),
            VenueLiquidity(
                venue_id="coinbase",
                venue_name="Coinbase Pro",
                daily_volume=800000000,  # $800M daily
                spread_bps=3.0,
                market_depth=0.7,
                latency_ms=60,
                fee_structure={"maker": 0.005, "taker": 0.005},
                reliability_score=0.92,
                max_order_size=500000,
            ),
            VenueLiquidity(
                venue_id="kraken",
                venue_name="Kraken",
                daily_volume=300000000,  # $300M daily
                spread_bps=4.0,
                market_depth=0.6,
                latency_ms=70,
                fee_structure={"maker": 0.002, "taker": 0.003},
                reliability_score=0.88,
                max_order_size=200000,
            ),
        ]

        return venues

    async def _score_venue_for_order(
        self,
        venue: VenueLiquidity,
        instrument: str,
        side: str,
        quantity: float,
        constraints: Optional[Dict[str, Any]],
    ) -> float:
        """Score venue suitability for specific order."""
        score = 0.0

        # Liquidity score (40% weight)
        liquidity_ratio = min(quantity / venue.daily_volume, 1.0)
        liquidity_score = 1.0 - liquidity_ratio  # Prefer high liquidity
        score += liquidity_score * 0.4

        # Fee score (20% weight) - lower fees better
        fee_rate = venue.fee_structure.get("taker", 0.005)
        fee_score = max(0, 1.0 - (fee_rate / 0.01))  # Normalize against 100bps
        score += fee_score * 0.2

        # Latency score (20% weight) - lower latency better
        latency_score = max(
            0, 1.0 - (venue.latency_ms / 200)
        )  # Normalize against 200ms
        score += latency_score * 0.2

        # Reliability score (20% weight)
        score += venue.reliability_score * 0.2

        # Check constraints
        if constraints:
            if "max_fee" in constraints and fee_rate > constraints["max_fee"]:
                score *= 0.5  # Penalty for high fees
            if (
                "min_reliability" in constraints
                and venue.reliability_score < constraints["min_reliability"]
            ):
                score *= 0.3  # Heavy penalty for low reliability
            if (
                "venue_restrictions" in constraints
                and venue.venue_id in constraints["venue_restrictions"]
            ):
                return 0.0  # Completely exclude restricted venues

        return score

    async def _select_execution_algorithm(
        self,
        instrument: str,
        side: str,
        quantity: float,
        venue: VenueLiquidity,
        constraints: Optional[Dict[str, Any]],
    ) -> ExecutionAlgorithm:
        """Select optimal execution algorithm based on order characteristics."""
        # Determine time horizon based on quantity and market conditions
        market_impact_analysis = await self.analyze_market_impact(
            instrument, side, quantity, venue.venue_id
        )
        participation_rate = market_impact_analysis["participation_rate"]

        # Select algorithm based on participation rate and constraints
        if participation_rate > 0.1:  # Large order
            if constraints and constraints.get("time_horizon_minutes", 60) > 30:
                algorithm_type = "vwap"
            else:
                algorithm_type = "twap"
        elif participation_rate > 0.05:  # Medium order
            algorithm_type = "iceberg"
        else:  # Small order
            algorithm_type = "market"  # Immediate execution

        # Set algorithm parameters
        time_horizon = (
            constraints.get("time_horizon_minutes", 30) if constraints else 30
        )

        return ExecutionAlgorithm(
            algorithm_type=algorithm_type,
            total_quantity=quantity,
            time_horizon_minutes=time_horizon,
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(minutes=time_horizon),
            participation_rate=None,
            iceberg_size=quantity * 0.1 if algorithm_type == "iceberg" else None,
            price_limit=None,
            venue_restrictions=None,
        )

    async def _estimate_price_impact(
        self, instrument: str, side: str, quantity: float, venue: VenueLiquidity
    ) -> float:
        """Estimate price impact of order."""
        impact_analysis = await self.analyze_market_impact(
            instrument, side, quantity, venue.venue_id
        )
        return impact_analysis["total_impact"]

    async def _estimate_slippage(
        self,
        instrument: str,
        side: str,
        quantity: float,
        venue: VenueLiquidity,
        order_type: str,
    ) -> float:
        """Estimate slippage for order."""
        if order_type == "market":
            # Market orders have higher slippage
            base_slippage = venue.spread_bps / 10000  # Spread in decimal
            impact_slippage = await self._estimate_price_impact(
                instrument, side, quantity, venue
            )
            return base_slippage + impact_slippage
        else:
            # Limit orders have lower slippage
            return venue.spread_bps / 20000  # Half the spread

    async def _estimate_execution_time(
        self, quantity: float, venue: VenueLiquidity, algorithm: ExecutionAlgorithm
    ) -> int:
        """Estimate execution time in seconds."""
        if algorithm.algorithm_type == "market":
            return 5  # Immediate
        elif algorithm.algorithm_type in ["twap", "vwap"]:
            return algorithm.time_horizon_minutes * 60  # Full time horizon
        elif algorithm.algorithm_type == "iceberg":
            # Estimate based on iceberg size and market conditions
            num_slices = max(1, int(quantity / (algorithm.iceberg_size or quantity)))
            return min(
                algorithm.time_horizon_minutes * 60, num_slices * 30
            )  # 30s per slice
        else:
            return algorithm.time_horizon_minutes * 30  # Conservative estimate

    async def _execute_twap(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """Execute Time-Weighted Average Price algorithm."""
        time_slices = algorithm.time_horizon_minutes
        quantity_per_slice = algorithm.total_quantity / time_slices

        orders = []
        for i in range(time_slices):
            # Schedule order execution
            await asyncio.sleep(60)  # Wait 1 minute between slices

            order = {
                "instrument": instrument,
                "side": side,
                "quantity": quantity_per_slice,
                "venue_id": venue_id,
                "algorithm": "twap",
                "slice_number": i + 1,
                "timestamp": datetime.utcnow(),
            }
            orders.append(order)

        return orders

    async def _execute_vwap(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """Execute Volume-Weighted Average Price algorithm."""
        # VWAP execution - adjust based on volume profile
        volume_profile = await self._get_volume_profile(
            instrument, algorithm.time_horizon_minutes
        )

        orders = []
        remaining_quantity = algorithm.total_quantity

        for interval_volume in volume_profile:
            if remaining_quantity <= 0:
                break

            # Execute proportional to volume
            participation_rate = 0.1  # 10% of volume
            quantity = min(remaining_quantity, interval_volume * participation_rate)

            order = {
                "instrument": instrument,
                "side": side,
                "quantity": quantity,
                "venue_id": venue_id,
                "algorithm": "vwap",
                "timestamp": datetime.utcnow(),
            }
            orders.append(order)

            remaining_quantity -= quantity
            await asyncio.sleep(60)  # Wait 1 minute

        return orders

    async def _execute_pov(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """Execute Percentage of Volume algorithm."""
        participation_rate = algorithm.participation_rate or 0.1  # 10% default

        orders = []
        remaining_quantity = algorithm.total_quantity

        while remaining_quantity > 0 and datetime.utcnow() < algorithm.end_time:
            # Get current market volume
            market_volume = await self._get_current_volume(instrument)

            # Calculate order size based on participation rate
            quantity = min(remaining_quantity, market_volume * participation_rate)

            order = {
                "instrument": instrument,
                "side": side,
                "quantity": quantity,
                "venue_id": venue_id,
                "algorithm": "pov",
                "timestamp": datetime.utcnow(),
            }
            orders.append(order)

            remaining_quantity -= quantity
            await asyncio.sleep(30)  # Check every 30 seconds

        return orders

    async def _execute_iceberg(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """Execute Iceberg algorithm (hidden orders)."""
        iceberg_size = algorithm.iceberg_size or (algorithm.total_quantity * 0.1)

        orders = []
        remaining_quantity = algorithm.total_quantity

        while remaining_quantity > 0 and datetime.utcnow() < algorithm.end_time:
            # Place iceberg order (visible portion)
            visible_quantity = min(iceberg_size, remaining_quantity)

            order = {
                "instrument": instrument,
                "side": side,
                "quantity": visible_quantity,
                "venue_id": venue_id,
                "algorithm": "iceberg",
                "iceberg_total": min(
                    iceberg_size * 3, remaining_quantity
                ),  # Hide 3x visible
                "timestamp": datetime.utcnow(),
            }
            orders.append(order)

            remaining_quantity -= visible_quantity
            await asyncio.sleep(120)  # Wait 2 minutes between icebergs

        return orders

    async def _execute_adaptive(
        self, algorithm: ExecutionAlgorithm, instrument: str, side: str, venue_id: str
    ) -> List[Dict[str, Any]]:
        """Execute adaptive algorithm based on market conditions."""
        orders = []
        remaining_quantity = algorithm.total_quantity

        while remaining_quantity > 0 and datetime.utcnow() < algorithm.end_time:
            # Adapt execution based on current market conditions
            market_conditions = await self._assess_market_conditions(instrument)

            if market_conditions["volatility"] > 0.05:  # High volatility
                # Slow down execution
                quantity = min(remaining_quantity, algorithm.total_quantity * 0.02)
                wait_time = 120  # 2 minutes
            elif market_conditions["liquidity"] < 0.3:  # Low liquidity
                # Reduce order size
                quantity = min(remaining_quantity, algorithm.total_quantity * 0.01)
                wait_time = 300  # 5 minutes
            else:
                # Normal execution
                quantity = min(remaining_quantity, algorithm.total_quantity * 0.05)
                wait_time = 60  # 1 minute

            order = {
                "instrument": instrument,
                "side": side,
                "quantity": quantity,
                "venue_id": venue_id,
                "algorithm": "adaptive",
                "market_conditions": market_conditions,
                "timestamp": datetime.utcnow(),
            }
            orders.append(order)

            remaining_quantity -= quantity
            await asyncio.sleep(wait_time)

        return orders

    async def _get_venue_liquidity(
        self, venue_id: str, instrument: str
    ) -> VenueLiquidity:
        """Get liquidity information for venue and instrument."""
        # Return cached or fetch venue data
        if venue_id in self.venue_cache:
            return self.venue_cache[venue_id]

        # Mock - in production, fetch from database
        venue = VenueLiquidity(
            venue_id=venue_id,
            venue_name=venue_id.title(),
            daily_volume=500000000,
            spread_bps=2.5,
            market_depth=0.75,
            latency_ms=55,
            fee_structure={"maker": 0.001, "taker": 0.002},
            reliability_score=0.9,
            max_order_size=1000000,
        )

        self.venue_cache[venue_id] = venue
        return venue

    async def _get_market_data(self, instrument: str) -> Dict[str, Any]:
        """Get current market data for instrument."""
        # Mock market data
        return {
            "volatility": 0.025,
            "liquidity": 0.8,
            "spread_bps": 2.5,
            "last_price": 50000,
            "daily_volume": 1000000000,
        }

    async def _get_volume_profile(self, instrument: str, minutes: int) -> List[float]:
        """Get volume profile for time period."""
        # Mock volume profile - equal distribution
        intervals = minutes
        avg_volume = 1000000 / intervals  # 1M total volume
        return [avg_volume] * intervals

    async def _get_current_volume(self, instrument: str) -> float:
        """Get current market volume."""
        return 1000000  # Mock 1M per minute

    async def _assess_market_conditions(self, instrument: str) -> Dict[str, float]:
        """Assess current market conditions."""
        return {"volatility": 0.02, "liquidity": 0.8, "trend": 0.1, "momentum": 0.05}

    async def _calculate_market_impact(
        self, executed_trades: List[Dict[str, Any]]
    ) -> float:
        """Calculate realized market impact."""
        if not executed_trades:
            return 0.0

        # Simple market impact calculation
        total_quantity = sum(trade["executed_quantity"] for trade in executed_trades)
        avg_price = (
            sum(
                trade["price"] * trade["executed_quantity"] for trade in executed_trades
            )
            / total_quantity
        )

        # Estimate benchmark price (simplified)
        benchmark_price = avg_price * 0.998  # Assume slight adverse selection

        impact = abs(avg_price - benchmark_price) / benchmark_price
        return impact

    def _calculate_timing_risk(self, execution_times: List[datetime]) -> float:
        """Calculate timing risk of execution."""
        if len(execution_times) < 2:
            return 0.0

        # Calculate execution timing dispersion
        start_time = min(execution_times)
        total_duration = (max(execution_times) - start_time).total_seconds()

        # Ideal timing would be uniform distribution
        total_duration / len(execution_times)
        actual_intervals = [(t - start_time).total_seconds() for t in execution_times]

        # Calculate variance from ideal timing
        timing_variance = np.var(actual_intervals)
        normalized_timing_risk = min(timing_variance / (total_duration**2), 1.0)

        return normalized_timing_risk

    def _calculate_isq_score(
        self, price_improvement: float, market_impact: float, timing_risk: float
    ) -> float:
        """Calculate Implementation Shortfall Quality score (0-100)."""
        # Weight the components
        price_weight = 0.5
        impact_weight = 0.3
        timing_weight = 0.2

        # Normalize to 0-100 scale
        price_score = max(0, min(100, 50 + (price_improvement * 1000)))  # Center at 50
        impact_score = max(
            0, 100 - (market_impact * 10000)
        )  # Lower impact = higher score
        timing_score = max(
            0, 100 - (timing_risk * 100)
        )  # Lower timing risk = higher score

        # Weighted average
        isq_score = (
            price_score * price_weight
            + impact_score * impact_weight
            + timing_score * timing_weight
        )

        return round(isq_score, 1)


# Singleton instance
smart_order_router = SmartOrderRouter()
