from app.services.spot_arb_edge_model import SpotArbEdgeConfig, SpotArbEdgeModel


def test_spot_arb_edge_model_math():
    model = SpotArbEdgeModel(
        SpotArbEdgeConfig(
            slippage_buffer_bps=4.0,
            latency_risk_buffer_bps=2.0,
            default_fee_bps=5.0,
        )
    )

    result = model.compute(buy_ask=100.0, sell_bid=101.0)

    executable = (101.0 / 100.0 - 1) * 10000
    expected_net = executable - 5.0 - 5.0 - 4.0 - 2.0
    assert result.executable_spread_bps == executable
    assert result.net_edge_bps == expected_net
