from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import numpy as np
import pytest
from app.arbitrage.cross_exchange import (
    CrossExchangeArbitrage,
    CrossExchangeOpportunity,
)
from app.arbitrage.engine import ArbitrageEngine, ArbitrageStats
from app.arbitrage.funding_rate import (
    FundingDirection,
    FundingPosition,
    FundingRateArbitrage,
    FundingRateOpportunity,
)
from app.arbitrage.statistical import PairsPosition, StatisticalArbitrage
from app.arbitrage.triangular import TriangularArbitrage


def test_funding_rate_opportunity_properties():
    opportunity = FundingRateOpportunity(
        symbol="BTC-PERP",
        exchange="binance",
        funding_rate=0.002,
        next_funding_time=datetime.utcnow() + timedelta(hours=3),
        predicted_rate=0.0015,
        direction=FundingDirection.LONGS_PAY,
        annualized_return=20.0,
        spot_price=50000,
        perp_price=50050,
        basis=50,
        confidence=0.8,
        recommended_size_usd=10000,
    )

    assert 0 < opportunity.hours_until_funding <= 3.1
    assert opportunity.is_profitable is True


def test_funding_rate_analyze_opportunity_handles_thresholds_and_direction():
    engine = FundingRateArbitrage(min_funding_rate=0.0002, max_position_size_usd=25000)

    assert (
        engine._analyze_opportunity(
            "BTC-PERP",
            "binance",
            {
                "funding_rate": 0.0001,
                "next_funding_time": datetime.utcnow() + timedelta(hours=4),
                "spot_price": 50000,
                "perp_price": 50005,
            },
        )
        is None
    )

    negative = engine._analyze_opportunity(
        "ETH-PERP",
        "bybit",
        {
            "funding_rate": -0.0008,
            "next_funding_time": datetime.utcnow() + timedelta(hours=4),
            "spot_price": 3000,
            "perp_price": 2990,
        },
    )

    assert negative is not None
    assert negative.direction == FundingDirection.SHORTS_PAY
    assert negative.basis == -10
    assert negative.recommended_size_usd == 10000


@pytest.mark.asyncio
async def test_funding_rate_scan_collects_profitable_opportunities(monkeypatch):
    engine = FundingRateArbitrage(exchanges=["binance", "broken"])

    async def fake_rates(exchange):
        if exchange == "broken":
            raise RuntimeError("down")
        return {
            "BTC-PERP": {
                "funding_rate": 0.0011,
                "next_funding_time": datetime.utcnow() + timedelta(hours=2),
                "spot_price": 50000,
                "perp_price": 50040,
            }
        }

    monkeypatch.setattr(engine, "_get_funding_rates", fake_rates)

    await engine._scan_opportunities()

    opportunities = engine.get_opportunities()
    assert len(opportunities) == 1
    assert opportunities[0].exchange == "binance"
    assert engine.get_status()["opportunities_count"] == 1


def test_cross_exchange_find_best_opportunity_and_sorting():
    engine = CrossExchangeArbitrage(min_spread_bps=20, max_position_size_usd=25000)
    engine._prices = {
        "binance": {"BTC/USDT": 50000},
        "coinbase": {"BTC/USDT": 50450},
        "kraken": {"BTC/USDT": 50100},
    }

    opportunity = engine._find_best_opportunity("BTC/USDT")

    assert opportunity is not None
    assert opportunity.buy_exchange == "binance"
    assert opportunity.sell_exchange == "coinbase"
    assert opportunity.profit_after_fees_bps > 0

    lower_profit = CrossExchangeOpportunity(
        symbol="ETH/USDT",
        buy_exchange="binance",
        sell_exchange="kraken",
        buy_price=3000,
        sell_price=3010,
        spread_bps=33.3,
        spread_pct=0.333,
        profit_after_fees_bps=12.0,
        estimated_profit_usd=12.0,
        recommended_size_usd=10000,
        execution_time_ms=200,
        confidence=0.8,
    )
    engine._opportunities = {
        "btc": opportunity,
        "eth": lower_profit,
    }

    sorted_opps = engine.get_opportunities()
    assert sorted_opps[0].profit_after_fees_bps >= sorted_opps[1].profit_after_fees_bps


@pytest.mark.asyncio
async def test_cross_exchange_scan_requires_multiple_venues():
    engine = CrossExchangeArbitrage()
    engine._prices = {"binance": {"BTC/USDT": 50000}}

    await engine._scan_opportunities()

    assert engine.get_opportunities() == []


def test_statistical_arbitrage_calculates_stats_and_exit_signal():
    engine = StatisticalArbitrage()
    prices_a = np.array(
        [
            100,
            101,
            102,
            103,
            104,
            105,
            106,
            107,
            108,
            109,
            110,
            111,
            112,
            113,
            114,
            115,
            116,
            117,
            118,
            119,
            130,
        ],
        dtype=float,
    )
    prices_b = np.array(
        [
            50,
            50.5,
            51,
            51.5,
            52,
            52.5,
            53,
            53.5,
            54,
            54.5,
            55,
            55.5,
            56,
            56.5,
            57,
            57.5,
            58,
            58.5,
            59,
            59.5,
            60.2,
        ],
        dtype=float,
    )

    stats = engine.calculate_spread_statistics(prices_a, prices_b)

    assert stats["correlation"] > 0.7
    assert stats["z_score"] > 0

    opportunity = engine.analyze_pair("BTC/USDT", "ETH/USDT", prices_a, prices_b)
    assert opportunity is not None
    assert opportunity.long_symbol == "ETH/USDT"
    assert opportunity.short_symbol == "BTC/USDT"

    position = PairsPosition(
        id="pairs-1",
        long_symbol=opportunity.long_symbol,
        short_symbol=opportunity.short_symbol,
        long_size=1,
        short_size=1,
        entry_z_score=2.5,
        current_z_score=0.25,
        entry_spread=opportunity.spread,
        current_spread=opportunity.mean_spread,
        pnl=0,
        entry_time=datetime.utcnow(),
        status="open",
    )
    assert engine.should_exit_position(position) is True


def test_triangular_arbitrage_paths_profit_and_scan():
    engine = TriangularArbitrage(
        min_profit_bps=5, max_position_size_usd=5000, fee_bps=0
    )
    rates = {
        "ETH/USDT": 2.0,
        "BTC/ETH": 2.0,
        "BTC/USDT": 3.0,
    }

    paths = engine.find_triangular_paths(list(rates.keys()), "USDT")
    assert ["USDT", "ETH", "BTC", "USDT"] in paths

    profit_bps, used_rates = engine.calculate_arbitrage_profit(
        ["USDT", "ETH", "BTC", "USDT"], rates
    )
    assert profit_bps > 0
    assert len(used_rates) == 3

    opportunities = engine.scan_opportunities("binance", rates)
    assert opportunities
    assert opportunities[0].pairs == ["ETH/USDT", "BTC/ETH", "BTC/USDT"]


@pytest.mark.asyncio
async def test_arbitrage_engine_stats_and_lifecycle(monkeypatch):
    engine = ArbitrageEngine(
        enable_funding_rate=True,
        enable_cross_exchange=True,
        enable_statistical=True,
        enable_triangular=True,
        exchanges=["binance", "bybit", "coinbase"],
    )

    funding_opp = FundingRateOpportunity(
        symbol="BTC-PERP",
        exchange="binance",
        funding_rate=0.001,
        next_funding_time=datetime.utcnow() + timedelta(hours=1),
        predicted_rate=0.0008,
        direction=FundingDirection.LONGS_PAY,
        annualized_return=10.0,
        spot_price=50000,
        perp_price=50020,
        basis=20,
        confidence=0.8,
        recommended_size_usd=10000,
    )
    cross_opp = CrossExchangeOpportunity(
        symbol="BTC/USDT",
        buy_exchange="binance",
        sell_exchange="coinbase",
        buy_price=50000,
        sell_price=50300,
        spread_bps=60,
        spread_pct=0.6,
        profit_after_fees_bps=20,
        estimated_profit_usd=20,
        recommended_size_usd=10000,
        execution_time_ms=100,
        confidence=0.9,
    )

    engine.funding_rate._opportunities = {"funding": funding_opp}
    engine.funding_rate._positions = {
        "pos-1": FundingPosition(
            symbol="BTC-PERP",
            exchange="binance",
            spot_size=1,
            perp_size=1,
            direction=FundingDirection.LONGS_PAY,
            entry_funding_rate=0.001,
            total_funding_collected=12.0,
            entry_time=datetime.utcnow(),
        )
    }
    engine.cross_exchange._opportunities = {"cross": cross_opp}
    engine.statistical._opportunities = {}
    engine.statistical._positions = {"pairs": object()}
    engine.triangular._opportunities = {}

    stats = engine.get_stats()
    assert isinstance(stats, ArbitrageStats)
    assert stats.total_opportunities == 2
    assert stats.active_positions == 2
    assert stats.total_estimated_profit_usd == 20

    monkeypatch.setattr(engine.funding_rate, "start", AsyncMock())
    monkeypatch.setattr(engine.cross_exchange, "start", AsyncMock())
    monkeypatch.setattr(engine.funding_rate, "stop", AsyncMock())
    monkeypatch.setattr(engine.cross_exchange, "stop", AsyncMock())

    await engine.start()
    assert engine.get_status()["running"] is True
    assert set(engine.get_status()["enabled_strategies"]) == {
        "FundingRate",
        "CrossExchange",
        "Statistical",
        "Triangular",
    }

    await engine.stop()
    assert engine.get_status()["running"] is False
