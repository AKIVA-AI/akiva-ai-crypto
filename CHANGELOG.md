# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-03-09

### Sprint 0: Security and Observability Hardening

#### Security (Dim 8: 7 -> 8)
- Added Dependabot configuration for automated dependency scanning (pip, npm, GitHub Actions)
- Added SAST scanning (bandit) and dependency audit (pip-audit) to CI pipeline
- Fixed WebSocket authentication vulnerability: all WS connections now require JWT token
- Enabled HSTS header in production environments
- Added npm audit to frontend CI pipeline
- Subprocess usage in strategy_screener.py reviewed and confirmed safe (input validation + create_subprocess_exec)

#### Testing (Dim 7: 6 -> 7)
- Removed `continue-on-error: true` from CI lint and test steps (failures now block merges)
- Added pytest coverage threshold enforcement (--cov-fail-under=50)
- Added vitest coverage thresholds
- Added risk engine edge case tests: kill switch fail-safe, circuit breaker cascades, boundary conditions
- Added WebSocket authentication tests
- Added health/metrics endpoint tests
- Added security middleware tests

#### Observability (Dim 9: 6 -> 7)
- Added Prometheus metrics export endpoint (/metrics/prometheus) with trading-specific metrics
- Added trade execution latency histogram tracking (p50/p95/p99)
- Added agent heartbeat staleness detection (90-second threshold)
- Enhanced health endpoint with dependency status (database, Redis)
- Added order count and PnL tracking metrics
- Enhanced /metrics endpoint with trade, latency, and agent metrics

#### CI/CD
- Upgraded CI to include ruff linting, bandit SAST, pip-audit, coverage enforcement
- Added Dependabot for pip, npm, and GitHub Actions dependencies

---

## [1.0.0] — 2026-02-20

### 🎉 Initial Open-Source Release

First public release of Enterprise Crypto — an institutional-grade crypto trading platform.

### Added

#### Trading & Execution
- Multi-exchange support: Binance.US, Coinbase Advanced Trade, Kraken
- Cross-exchange arbitrage detection and execution
- Paper trading mode (enabled by default)
- Order lifecycle management (open → filled/cancelled) with full audit trail
- Retry logic with exponential backoff (3 attempts) on venue failures

#### Risk Management
- Global kill switch — emergency halt all trading
- Database-level circuit breakers (Postgres triggers)
- Reduce-only mode at 80% daily loss threshold
- Per-book risk limits: max leverage, concentration, daily loss
- Strategy lifecycle states: quarantine, cooldown, disable
- Real-time risk breach detection and alerting

#### Intelligence & Signals
- Multi-factor signal scoring engine
- Whale alert monitoring
- Funding rate arbitrage detection
- Social sentiment aggregation
- On-chain metrics tracking
- Macro indicators via FRED integration
- Market news feed with sentiment analysis

#### Security & Compliance
- Row-Level Security (RLS) on all tables
- RBAC: admin, CIO, trader, ops, research, auditor, viewer roles
- Server-side API key encryption via pgcrypto
- JWT authentication on all trading endpoints
- Full audit trail with before/after state capture
- Circuit breaker events logging

#### Operations
- Telegram alert notifications for critical events
- Automated CRON health monitoring (every 2 minutes)
- Decision traces — see why each trade was blocked or executed
- Dynamic system status banner on dashboard
- Performance metrics tracking

#### Frontend
- React + TypeScript + Tailwind CSS + shadcn/ui
- Real-time dashboard with portfolio overview
- Trading interface with order entry
- Risk management console
- Arbitrage scanner
- Strategy management
- Audit log viewer
- Market intelligence panels

#### Infrastructure
- Supabase Edge Functions (Deno) for backend logic
- GitHub Actions CI (type-check, lint, test)
- Docker Compose for local development
- Comprehensive `.env.example` with all configuration options

### Security Notes

- All exchange API keys must be stored as Supabase secrets — never in code
- Paper trading mode is **on** by default; live trading requires explicit admin action
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

---

*Enterprise Crypto — Institutional trading, open source.*
