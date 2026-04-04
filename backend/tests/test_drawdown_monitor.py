"""
Tests for drawdown monitoring (D7/D12 risk management testing).
"""

from datetime import UTC, datetime, timedelta

from app.services.drawdown_monitor import DrawdownMonitor


def _ts(day: int) -> datetime:
    """Helper to create timestamps."""
    return datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=day)


class TestDrawdownTracking:
    def test_no_drawdown_at_start(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        assert mon.get_current_drawdown() == 0.0

    def test_drawdown_detection(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 95_000)  # 5% drawdown
        assert abs(mon.get_current_drawdown() - 5.0) < 0.01

    def test_max_drawdown_tracking(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 90_000)  # 10% dd
        mon.update(_ts(2), 95_000)  # 5% dd
        assert abs(mon.max_drawdown_pct - 10.0) < 0.01

    def test_drawdown_recovery(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 90_000)  # drawdown
        mon.update(_ts(2), 100_000)  # recovery
        assert mon.get_current_drawdown() == 0.0
        assert len(mon.drawdown_periods) == 1
        assert mon.drawdown_periods[0].is_recovered

    def test_new_high_resets_peak(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 110_000)  # new peak
        mon.update(_ts(2), 105_000)  # 4.5% dd from new peak
        assert abs(mon.get_current_drawdown() - 4.545) < 0.1
        assert mon.peak_equity == 110_000


class TestAlerts:
    def test_warning_alert(self):
        mon = DrawdownMonitor(initial_capital=100_000, alert_threshold=10.0)
        mon.update(_ts(0), 100_000)
        alert = mon.update(_ts(1), 88_000)  # 12% dd
        assert alert is not None
        assert "WARNING" in alert

    def test_critical_alert(self):
        mon = DrawdownMonitor(initial_capital=100_000, max_drawdown_limit=20.0)
        mon.update(_ts(0), 100_000)
        alert = mon.update(_ts(1), 78_000)  # 22% dd
        assert alert is not None
        assert "CRITICAL" in alert

    def test_no_alert_within_threshold(self):
        mon = DrawdownMonitor(initial_capital=100_000, alert_threshold=10.0)
        mon.update(_ts(0), 100_000)
        alert = mon.update(_ts(1), 95_000)  # 5% dd
        assert alert is None

    def test_should_halt(self):
        mon = DrawdownMonitor(initial_capital=100_000, max_drawdown_limit=15.0)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 80_000)  # 20% dd
        assert mon.should_halt() is True


class TestStats:
    def test_stats_with_periods(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 90_000)  # dd 1
        mon.update(_ts(3), 100_000)  # recovery
        mon.update(_ts(4), 95_000)  # dd 2

        stats = mon.get_stats()
        assert stats.max_drawdown_pct == 10.0
        assert stats.peak_equity == 100_000
        assert len(stats.drawdown_periods) == 2  # 1 completed + 1 current

    def test_stats_no_drawdowns(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 105_000)
        stats = mon.get_stats()
        assert stats.max_drawdown_pct == 0.0
        assert stats.current_drawdown_pct == 0.0

    def test_underwater_curve(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 90_000)
        mon.update(_ts(2), 95_000)
        curve = mon.get_underwater_curve()
        assert len(curve) == 3
        assert curve[0][1] == 0.0  # no dd at start
        assert curve[1][1] < 0  # underwater

    def test_reset(self):
        mon = DrawdownMonitor(initial_capital=100_000)
        mon.update(_ts(0), 100_000)
        mon.update(_ts(1), 80_000)
        mon.reset(new_capital=200_000)
        assert mon.current_equity == 200_000
        assert mon.max_drawdown_pct == 0.0
        assert len(mon.equity_curve) == 0
