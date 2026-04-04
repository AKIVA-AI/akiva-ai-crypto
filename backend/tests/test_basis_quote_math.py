import pytest
from app.services.basis_quote_service import BasisQuoteConfig, BasisQuoteService
from app.services.market_data import market_data_service


@pytest.mark.asyncio
async def test_basis_quote_executable_basis(monkeypatch):
    service = BasisQuoteService(BasisQuoteConfig(window=5, min_samples=1))

    service._get_venue_id = lambda name: f"{name}_id"
    service._get_instrument_id = lambda tenant_id, venue_id, symbol: None
    service._store_quote = lambda *args, **kwargs: None

    market_data_service.update_price(
        venue="coinbase",
        instrument="BTC-USD",
        bid=100.0,
        ask=101.0,
        last=100.5,
        volume_24h=1_000_000,
    )
    market_data_service.update_price(
        venue="bybit",
        instrument="BTC-USD",
        bid=103.0,
        ask=104.0,
        last=103.5,
        volume_24h=1_000_000,
    )

    quotes = await service.build_quotes(
        instruments=["BTC-USD"],
        spot_venue="coinbase",
        deriv_venue="bybit",
        tenant_id="tenant-1",
    )

    assert quotes
    quote = quotes[0]
    assert quote.basis_bps_bid == pytest.approx((103.0 - 101.0) / 101.0 * 10000)
    assert quote.basis_bps_mid == pytest.approx((103.5 - 100.5) / 100.5 * 10000)
