from app.services.basis_edge_model import BasisEdgeConfig, BasisEdgeModel


def test_basis_edge_model_expected_return():
    model = BasisEdgeModel(
        BasisEdgeConfig(
            latency_buffer_bps=2.0,
            unwind_risk_buffer_bps=4.0,
            default_slippage_bps=6.0,
            default_fee_bps=8.0,
            basis_convergence_weight=0.5,
        )
    )

    result = model.compute_expected_return(
        expected_funding_bps=12.0,
        basis_bps_mid=20.0,
    )

    # expected = funding(12) + basis_convergence(10) - fees(8) - slippage(6) - latency(2) - unwind(4)
    assert result.expected_return_bps == 2.0
