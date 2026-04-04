from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from app.services.smart_order_router import (
    ExecutionAlgorithm,
    SmartOrderRouter,
    VenueLiquidity,
)


@pytest.fixture
def router():
    return SmartOrderRouter()


@pytest.mark.asyncio
async def test_route_order_selects_best_venue(router, monkeypatch):
    venues = [
        VenueLiquidity(
            venue_id="fast",
            venue_name="Fast",
            daily_volume=1_000_000,
            spread_bps=1.0,
            market_depth=0.9,
            latency_ms=20,
            fee_structure={"taker": 0.001},
            reliability_score=0.95,
            max_order_size=1_000_000,
        ),
        VenueLiquidity(
            venue_id="slow",
            venue_name="Slow",
            daily_volume=500_000,
            spread_bps=3.0,
            market_depth=0.5,
            latency_ms=120,
            fee_structure={"taker": 0.004},
            reliability_score=0.7,
            max_order_size=100_000,
        ),
    ]
    monkeypatch.setattr(router, "_get_available_venues", AsyncMock(return_value=venues))
    monkeypatch.setattr(
        router,
        "_select_execution_algorithm",
        AsyncMock(
            return_value=ExecutionAlgorithm(
                algorithm_type="market",
                total_quantity=10,
                time_horizon_minutes=1,
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow() + timedelta(minutes=1),
                participation_rate=None,
                iceberg_size=None,
                price_limit=None,
                venue_restrictions=None,
            )
        ),
    )
    monkeypatch.setattr(
        router, "_estimate_price_impact", AsyncMock(return_value=0.0005)
    )
    monkeypatch.setattr(router, "_estimate_slippage", AsyncMock(return_value=0.0007))
    monkeypatch.setattr(router, "_estimate_execution_time", AsyncMock(return_value=5))

    decision = await router.route_order("BTC-USD", "buy", 10)

    assert decision.venue_id == "fast"
    assert decision.execution_algorithm == "market"
    assert decision.confidence_score > 0.8


@pytest.mark.asyncio
async def test_route_order_raises_when_no_venues(router, monkeypatch):
    monkeypatch.setattr(router, "_get_available_venues", AsyncMock(return_value=[]))

    with pytest.raises(ValueError):
        await router.route_order("BTC-USD", "buy", 10)


@pytest.mark.asyncio
async def test_score_venue_respects_constraints(router):
    venue = VenueLiquidity(
        venue_id="binance",
        venue_name="Binance",
        daily_volume=10_000_000,
        spread_bps=2.0,
        market_depth=0.9,
        latency_ms=50,
        fee_structure={"taker": 0.001},
        reliability_score=0.95,
        max_order_size=1_000_000,
    )

    score = await router._score_venue_for_order(venue, "BTC-USD", "buy", 1_000, None)
    penalized = await router._score_venue_for_order(
        venue,
        "BTC-USD",
        "buy",
        1_000,
        {"max_fee": 0.0005, "min_reliability": 0.99},
    )
    excluded = await router._score_venue_for_order(
        venue,
        "BTC-USD",
        "buy",
        1_000,
        {"venue_restrictions": ["binance"]},
    )

    assert score > penalized
    assert excluded == 0.0


@pytest.mark.asyncio
async def test_select_execution_algorithm_varies_by_participation(router, monkeypatch):
    venue = VenueLiquidity(
        venue_id="binance",
        venue_name="Binance",
        daily_volume=100,
        spread_bps=2.0,
        market_depth=0.8,
        latency_ms=30,
        fee_structure={"taker": 0.001},
        reliability_score=0.95,
        max_order_size=1_000_000,
    )

    monkeypatch.setattr(
        router,
        "analyze_market_impact",
        AsyncMock(return_value={"participation_rate": 0.2}),
    )
    large = await router._select_execution_algorithm(
        "BTC-USD", "buy", 10, venue, {"time_horizon_minutes": 60}
    )
    assert large.algorithm_type == "vwap"

    monkeypatch.setattr(
        router,
        "analyze_market_impact",
        AsyncMock(return_value={"participation_rate": 0.07}),
    )
    medium = await router._select_execution_algorithm("BTC-USD", "buy", 10, venue, None)
    assert medium.algorithm_type == "iceberg"
    assert medium.iceberg_size == 1.0

    monkeypatch.setattr(
        router,
        "analyze_market_impact",
        AsyncMock(return_value={"participation_rate": 0.01}),
    )
    small = await router._select_execution_algorithm("BTC-USD", "buy", 10, venue, None)
    assert small.algorithm_type == "market"

    monkeypatch.setattr(
        router,
        "analyze_market_impact",
        AsyncMock(return_value={"participation_rate": 0.15}),
    )
    twap = await router._select_execution_algorithm(
        "BTC-USD", "buy", 10, venue, {"time_horizon_minutes": 15}
    )
    assert twap.algorithm_type == "twap"


@pytest.mark.asyncio
async def test_measure_execution_quality_handles_empty_and_non_empty(router):
    empty = await router.measure_execution_quality("order-0", [], 100)
    assert empty.isq_score == 0

    now = datetime.utcnow()
    trades = [
        {
            "instrument": "BTC-USD",
            "side": "buy",
            "quantity": 10,
            "executed_quantity": 5,
            "price": 99,
            "timestamp": now,
        },
        {
            "instrument": "BTC-USD",
            "side": "buy",
            "quantity": 10,
            "executed_quantity": 5,
            "price": 101,
            "timestamp": now + timedelta(seconds=10),
        },
    ]

    quality = await router.measure_execution_quality("order-1", trades, 100)

    assert quality.executed_quantity == 10
    assert quality.average_price == 100
    assert quality.execution_time_seconds == 10
    assert quality.completion_rate == 0.5

    sell_quality = await router.measure_execution_quality(
        "order-2",
        [
            {
                "instrument": "BTC-USD",
                "side": "sell",
                "quantity": 4,
                "executed_quantity": 4,
                "price": 101,
                "timestamp": now,
            }
        ],
        100,
    )
    assert sell_quality.price_improvement > 0


@pytest.mark.asyncio
async def test_analyze_market_impact_and_slippage(router, monkeypatch):
    venue = VenueLiquidity(
        venue_id="kraken",
        venue_name="Kraken",
        daily_volume=252_000,
        spread_bps=4.0,
        market_depth=0.5,
        latency_ms=70,
        fee_structure={"taker": 0.003},
        reliability_score=0.88,
        max_order_size=200_000,
    )
    monkeypatch.setattr(router, "_get_venue_liquidity", AsyncMock(return_value=venue))
    monkeypatch.setattr(
        router, "_get_market_data", AsyncMock(return_value={"volatility": 0.04})
    )

    impact = await router.analyze_market_impact("BTC-USD", "buy", 1000, "kraken")
    slippage = await router._estimate_slippage("BTC-USD", "buy", 1000, venue, "market")
    limit_slippage = await router._estimate_slippage(
        "BTC-USD", "buy", 1000, venue, "limit"
    )

    assert impact["total_impact"] > 0
    assert slippage > limit_slippage


@pytest.mark.asyncio
async def test_execution_time_helpers_and_isq(router):
    market_algo = ExecutionAlgorithm(
        algorithm_type="market",
        total_quantity=100,
        time_horizon_minutes=5,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=5),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )
    iceberg_algo = ExecutionAlgorithm(
        algorithm_type="iceberg",
        total_quantity=100,
        time_horizon_minutes=5,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=5),
        participation_rate=None,
        iceberg_size=20,
        price_limit=None,
        venue_restrictions=None,
    )
    vwap_algo = ExecutionAlgorithm(
        algorithm_type="vwap",
        total_quantity=100,
        time_horizon_minutes=5,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=5),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )
    adaptive_algo = ExecutionAlgorithm(
        algorithm_type="adaptive",
        total_quantity=100,
        time_horizon_minutes=5,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=5),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )
    venue = VenueLiquidity(
        venue_id="binance",
        venue_name="Binance",
        daily_volume=1_000_000,
        spread_bps=2.0,
        market_depth=0.8,
        latency_ms=50,
        fee_structure={"taker": 0.001},
        reliability_score=0.95,
        max_order_size=1_000_000,
    )

    market_time = await router._estimate_execution_time(100, venue, market_algo)
    iceberg_time = await router._estimate_execution_time(100, venue, iceberg_algo)
    vwap_time = await router._estimate_execution_time(100, venue, vwap_algo)
    adaptive_time = await router._estimate_execution_time(100, venue, adaptive_algo)
    timing_risk = router._calculate_timing_risk(
        [
            datetime.utcnow(),
            datetime.utcnow() + timedelta(seconds=10),
            datetime.utcnow() + timedelta(seconds=25),
        ]
    )
    isq = router._calculate_isq_score(0.002, 0.0005, 0.1)

    assert market_time == 5
    assert iceberg_time > 0
    assert vwap_time == 300
    assert adaptive_time == 150
    assert 0 <= timing_risk <= 1
    assert 0 <= isq <= 100


@pytest.mark.asyncio
async def test_execute_twap_dispatches_real_slices(router, monkeypatch):
    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr("app.services.smart_order_router.asyncio.sleep", fake_sleep)
    algorithm = ExecutionAlgorithm(
        algorithm_type="twap",
        total_quantity=9,
        time_horizon_minutes=3,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=3),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )

    orders = await router.execute_algorithmic_order(
        algorithm, "BTC-USD", "buy", "binance"
    )

    assert [order["quantity"] for order in orders] == [3, 3, 3]
    assert [order["slice_number"] for order in orders] == [1, 2, 3]
    assert sleep_calls == [60, 60, 60]


@pytest.mark.asyncio
async def test_execute_vwap_uses_volume_profile_and_remaining_quantity(
    router, monkeypatch
):
    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr("app.services.smart_order_router.asyncio.sleep", fake_sleep)
    monkeypatch.setattr(
        router, "_get_volume_profile", AsyncMock(return_value=[10, 30, 100, 100])
    )
    algorithm = ExecutionAlgorithm(
        algorithm_type="vwap",
        total_quantity=12,
        time_horizon_minutes=3,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=3),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )

    orders = await router.execute_algorithmic_order(
        algorithm, "BTC-USD", "buy", "binance"
    )

    assert [order["quantity"] for order in orders] == [1.0, 3.0, 8.0]
    assert all(order["algorithm"] == "vwap" for order in orders)
    assert sleep_calls == [60, 60, 60]


@pytest.mark.asyncio
async def test_execute_pov_respects_participation_rate(router, monkeypatch):
    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr("app.services.smart_order_router.asyncio.sleep", fake_sleep)
    monkeypatch.setattr(router, "_get_current_volume", AsyncMock(return_value=4))
    algorithm = ExecutionAlgorithm(
        algorithm_type="pov",
        total_quantity=4,
        time_horizon_minutes=1,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=1),
        participation_rate=0.5,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )

    orders = await router.execute_algorithmic_order(
        algorithm, "BTC-USD", "sell", "kraken"
    )

    assert [order["quantity"] for order in orders] == [2.0, 2.0]
    assert sleep_calls == [30, 30]


@pytest.mark.asyncio
async def test_execute_iceberg_splits_visible_quantity(router, monkeypatch):
    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    monkeypatch.setattr("app.services.smart_order_router.asyncio.sleep", fake_sleep)
    algorithm = ExecutionAlgorithm(
        algorithm_type="iceberg",
        total_quantity=7,
        time_horizon_minutes=10,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=10),
        participation_rate=None,
        iceberg_size=3,
        price_limit=None,
        venue_restrictions=None,
    )

    orders = await router.execute_algorithmic_order(
        algorithm, "BTC-USD", "buy", "coinbase"
    )

    assert [order["quantity"] for order in orders] == [3, 3, 1]
    assert orders[0]["iceberg_total"] == 7
    assert orders[-1]["iceberg_total"] == 1
    assert sleep_calls == [120, 120, 120]


@pytest.mark.asyncio
async def test_execute_algorithmic_order_unknown_type_raises(router):
    algorithm = ExecutionAlgorithm(
        algorithm_type="unknown",
        total_quantity=1,
        time_horizon_minutes=1,
        start_time=datetime.utcnow(),
        end_time=datetime.utcnow() + timedelta(minutes=1),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )

    with pytest.raises(ValueError):
        await router.execute_algorithmic_order(algorithm, "BTC-USD", "buy", "binance")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("conditions", "expected_quantity", "expected_wait"),
    [
        ({"volatility": 0.06, "liquidity": 0.9}, 2.0, 120),
        ({"volatility": 0.02, "liquidity": 0.2}, 1.0, 300),
        ({"volatility": 0.02, "liquidity": 0.8}, 5.0, 60),
    ],
)
async def test_execute_adaptive_covers_market_condition_branches(
    router, monkeypatch, conditions, expected_quantity, expected_wait
):
    sleep_calls = []

    async def fake_sleep(seconds):
        sleep_calls.append(seconds)

    class FakeDateTime:
        calls = [
            datetime(2026, 1, 1, 0, 0, 0),
            datetime(2026, 1, 1, 0, 0, 1),
            datetime(2026, 1, 1, 0, 0, 20),
        ]
        index = 0

        @classmethod
        def utcnow(cls):
            value = cls.calls[min(cls.index, len(cls.calls) - 1)]
            cls.index += 1
            return value

    monkeypatch.setattr("app.services.smart_order_router.asyncio.sleep", fake_sleep)
    monkeypatch.setattr("app.services.smart_order_router.datetime", FakeDateTime)
    monkeypatch.setattr(
        router, "_assess_market_conditions", AsyncMock(return_value=conditions)
    )
    algorithm = ExecutionAlgorithm(
        algorithm_type="adaptive",
        total_quantity=100,
        time_horizon_minutes=1,
        start_time=datetime.utcnow(),
        end_time=datetime(2026, 1, 1, 0, 0, 10),
        participation_rate=None,
        iceberg_size=None,
        price_limit=None,
        venue_restrictions=None,
    )

    orders = await router.execute_algorithmic_order(
        algorithm, "BTC-USD", "buy", "binance"
    )

    assert len(orders) == 1
    assert orders[0]["quantity"] == expected_quantity
    assert orders[0]["market_conditions"] == conditions
    assert sleep_calls == [expected_wait]


@pytest.mark.asyncio
async def test_router_helper_methods_cover_cached_and_static_paths(router):
    venues = await router._get_available_venues("BTC-USD")
    market_data = await router._get_market_data("BTC-USD")
    volume_profile = await router._get_volume_profile("BTC-USD", 4)
    current_volume = await router._get_current_volume("BTC-USD")
    market_conditions = await router._assess_market_conditions("BTC-USD")
    empty_impact = await router._calculate_market_impact([])

    fetched_venue = await router._get_venue_liquidity("gemini", "BTC-USD")
    cached_venue = await router._get_venue_liquidity("gemini", "BTC-USD")

    assert [venue.venue_id for venue in venues] == ["binance", "coinbase", "kraken"]
    assert market_data["last_price"] == 50000
    assert volume_profile == [250000.0] * 4
    assert current_volume == 1000000
    assert market_conditions["liquidity"] == 0.8
    assert empty_impact == 0.0
    assert fetched_venue is cached_venue
    assert fetched_venue.venue_name == "Gemini"
