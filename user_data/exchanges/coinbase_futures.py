"""
Coinbase Advanced Futures Exchange Implementation for Freqtrade

Enterprise Crypto - Custom exchange class enabling Coinbase perpetual futures trading.

Coinbase Advanced launched perpetual futures for US users in July 2025.
This class extends Freqtrade's base exchange to support:
- Perpetual futures (swap) trading
- Cross margin mode (Coinbase default)
- Leverage up to 10x
- USDC-settled contracts

Key differences from other exchanges:
- Leverage is set PER ORDER, not per account/position
- Margin mode is always CROSS (no isolated mode)
- No setLeverage or setMarginMode API calls needed
"""

import logging
from typing import Any

from freqtrade.enums import MarginMode, TradingMode
from freqtrade.exchange import Exchange
from freqtrade.exchange.exchange_types import FtHas

logger = logging.getLogger(__name__)


class CoinbaseFutures(Exchange):
    """
    Coinbase Advanced Futures Exchange class for Freqtrade.

    Enables perpetual futures trading on Coinbase Advanced.
    Leverage is applied per-order via order parameters.
    """

    _ft_has: FtHas = {
        "ohlcv_candle_limit": 300,
        "ohlcv_has_history": True,
        "order_time_in_force": ["GTC", "IOC", "PO"],
        "stoploss_on_exchange": False,  # Coinbase doesn't support native SL orders well
        "trades_has_history": False,
        "l2_limit_upper": 1000,
    }

    _ft_has_futures: FtHas = {
        "needs_trading_fees": True,
        "fee_cost_in_contracts": False,
        "funding_fee_candle_limit": 1000,
        # Coinbase perpetuals are linear USDC-settled
    }

    # Enable FUTURES + CROSS margin (Coinbase's default and only mode)
    _supported_trading_mode_margin_pairs: list[tuple[TradingMode, MarginMode]] = [
        (TradingMode.SPOT, MarginMode.NONE),
        (TradingMode.FUTURES, MarginMode.CROSS),  # Coinbase only supports cross margin
    ]

    def __init__(
        self, config: dict, *, exchange_config: dict | None = None, **kwargs
    ) -> None:
        # Accept and pass through any additional kwargs (like 'validate')
        super().__init__(config, exchange_config=exchange_config, **kwargs)
        logger.info("Enterprise Crypto: Coinbase Futures exchange initialized")

    def _get_params(
        self,
        side: str,
        ordertype: str,
        leverage: float,
        reduceOnly: bool,
        time_in_force: str = "GTC",
    ) -> dict:
        """
        Build order parameters for Coinbase futures.
        Leverage is applied per-order on Coinbase.
        """
        params = super()._get_params(
            side=side,
            ordertype=ordertype,
            leverage=leverage,
            reduceOnly=reduceOnly,
            time_in_force=time_in_force,
        )

        # Coinbase applies leverage per-order
        if self.trading_mode == TradingMode.FUTURES and leverage > 1:
            params["leverage"] = leverage
            logger.debug(f"Coinbase order with {leverage}x leverage")

        return params

    def set_margin_mode(
        self,
        pair: str,
        margin_mode: MarginMode,
        accept_fail: bool = False,
        params: dict = {},
    ) -> None:
        """
        Coinbase only supports CROSS margin mode.
        This is a no-op since margin mode cannot be changed.
        """
        if margin_mode != MarginMode.CROSS:
            logger.warning(
                f"Coinbase only supports CROSS margin. Ignoring request for {margin_mode}."
            )
        # No API call needed - Coinbase is always cross margin
        logger.debug(f"Coinbase margin mode: CROSS (default, no API call needed)")

    @staticmethod
    def _get_stake_currency_from_market(market: dict) -> str:
        """Get stake currency - USDC for Coinbase perpetuals."""
        return market.get("settle", market.get("quote", "USDC"))

    def _lev_prep(
        self, pair: str, leverage: float, side: str, accept_fail: bool = False
    ) -> None:
        """
        Prepare leverage for a trade.
        Coinbase doesn't require pre-setting leverage - it's per order.
        """
        # Validate leverage is within Coinbase limits (max 10x)
        max_leverage = 10
        if leverage > max_leverage:
            logger.warning(
                f"Leverage {leverage}x exceeds Coinbase max {max_leverage}x. Capping."
            )
            leverage = max_leverage

        logger.debug(f"Coinbase leverage prep: {leverage}x for {pair} ({side})")
        # No API call needed - leverage applied at order time

    def validate_config(self, config: dict) -> None:
        """Validate Coinbase-specific configuration."""
        super().validate_config(config)

        # Warn about Coinbase-specific limitations
        if config.get("margin_mode") == "isolated":
            logger.warning(
                "Coinbase does not support isolated margin. Using cross margin instead."
            )

    def additional_exchange_init(self) -> None:
        """Additional initialization for Coinbase futures."""
        super().additional_exchange_init()
        logger.info("Enterprise Crypto: Coinbase Advanced Futures ready for trading")
        logger.info(
            f"Trading mode: {self.trading_mode}, Margin mode: {self.margin_mode}"
        )
