from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from app.services.institutional_backtester import BacktestConfig
from app.services.walk_forward_engine import WalkForwardConfig, WalkForwardEngine


class MockStrategy:
    def populate_indicators(self, dataframe, metadata):
        return dataframe

    def populate_entry_trend(self, dataframe, metadata):
        dataframe["enter_long"] = 0
        dataframe["enter_short"] = 0
        dataframe.loc[dataframe.index % 10 == 0, "enter_long"] = 1
        return dataframe

    def populate_exit_trend(self, dataframe, metadata):
        dataframe["exit_long"] = 0
        dataframe["exit_short"] = 0
        for i in range(len(dataframe)):
            if i >= 5 and dataframe.iloc[i - 5].get("enter_long", 0) == 1:
                dataframe.loc[dataframe.index[i], "exit_long"] = 1
        return dataframe


def test_walk_forward_runs_windows():
    np.random.seed(42)
    dates = pd.date_range(start="2023-01-01", periods=500, freq="1h")
    price = 50000 + np.cumsum(np.random.randn(500) * 50)
    data = pd.DataFrame(
        {
            "date": dates,
            "open": price,
            "high": price * 1.01,
            "low": price * 0.99,
            "close": price,
            "volume": np.random.uniform(100, 1000, 500),
        }
    )

    engine = WalkForwardEngine(
        WalkForwardConfig(train_window=200, test_window=100, step_size=100)
    )
    base_config = BacktestConfig(
        strategy_name="MockStrategy",
        instruments=["BTC-USD"],
        start_date=datetime(2023, 1, 1),
        end_date=datetime(2023, 2, 1),
    )

    result = engine.run(MockStrategy(), data, base_config)

    assert result.total_windows == 3
    assert len(result.window_results) == 3
    assert result.aggregate_metrics is not None
