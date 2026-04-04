"""
Load testing for the Enterprise Crypto Trading Platform.

Usage:
    pip install locust
    locust -f tests/load/locustfile.py --host=http://localhost:8000

Web UI will be available at http://localhost:8089
"""

import os

from locust import HttpUser, between, tag, task


class TradingPlatformUser(HttpUser):
    """Simulates a typical trading platform user."""

    # Wait 1-3 seconds between tasks
    wait_time = between(1, 3)

    def on_start(self):
        """Setup before starting tasks."""
        # Get auth token if needed
        self.token = os.getenv("TEST_AUTH_TOKEN", "test-token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    @tag("health")
    @task(10)
    def health_check(self):
        """Health check - high frequency, should always pass."""
        self.client.get("/health")

    @tag("health")
    @task(5)
    def readiness_check(self):
        """Readiness check - moderate frequency."""
        self.client.get("/ready")

    @tag("health")
    @task(2)
    def metrics_check(self):
        """Metrics endpoint - lower frequency."""
        self.client.get("/metrics")

    @tag("trading", "read")
    @task(8)
    def get_positions(self):
        """Get positions - common read operation."""
        self.client.get("/api/trading/positions", headers=self.headers)

    @tag("trading", "read")
    @task(6)
    def get_orders(self):
        """Get orders - common read operation."""
        self.client.get("/api/trading/orders?limit=50", headers=self.headers)

    @tag("trading", "read")
    @task(4)
    def get_trade_intents(self):
        """Get trade intents."""
        self.client.get("/api/trading/intents?limit=50", headers=self.headers)

    @tag("risk", "read")
    @task(3)
    def get_risk_metrics(self):
        """Get risk metrics - computationally heavier."""
        self.client.get("/api/risk/metrics", headers=self.headers)


class HighFrequencyTrader(HttpUser):
    """Simulates high-frequency trading patterns."""

    # Very short waits for HFT simulation
    wait_time = between(0.1, 0.5)

    def on_start(self):
        self.token = os.getenv("TEST_AUTH_TOKEN", "test-token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    @tag("hft", "read")
    @task(10)
    def rapid_position_check(self):
        """Rapid position checks."""
        self.client.get("/api/trading/positions", headers=self.headers)

    @tag("hft", "read")
    @task(8)
    def rapid_order_check(self):
        """Rapid order status checks."""
        self.client.get(
            "/api/trading/orders?status=pending&limit=10", headers=self.headers
        )


class MonitoringUser(HttpUser):
    """Simulates monitoring/observability tools."""

    wait_time = between(5, 15)

    @tag("monitoring")
    @task(5)
    def health_check(self):
        """Regular health check."""
        with self.client.get("/health", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"Health check failed: {response.status_code}")

    @tag("monitoring")
    @task(3)
    def ready_check(self):
        """Regular readiness check."""
        with self.client.get("/ready", catch_response=True) as response:
            if response.status_code not in [200, 503]:
                response.failure(f"Ready check unexpected: {response.status_code}")

    @tag("monitoring")
    @task(2)
    def metrics_scrape(self):
        """Metrics scraping (like Prometheus)."""
        self.client.get("/metrics")
