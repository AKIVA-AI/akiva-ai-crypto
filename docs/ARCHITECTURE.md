# Enterprise Crypto — Architecture Documentation

**Version:** 2.0
**Date:** 2026-03-19
**Archetype:** 7 — Algorithmic Trading Platform

---

## System Overview

Enterprise Crypto is an institutional-grade, multi-agent algorithmic trading platform for cryptocurrency markets. It combines a FastAPI backend with a React/TypeScript frontend, Supabase PostgreSQL for persistence, Redis for inter-agent messaging, and 38 Deno edge functions for exchange-specific operations.

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React / Vite / TypeScript)              │
│  22 pages, 162 components, 66 hooks, TanStack Query, shadcn/ui          │
│  Supabase Realtime subscriptions + WebSocket streams                     │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ REST / WebSocket
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI / Python)                        │
│  14 API routers under /api/v1  │  Health/Metrics at /health /metrics     │
│  Auth middleware (JWT)         │  Rate limiting (slowapi)                │
│  Security headers + XSS/SQLi  │  Request validation (10 MB limit)       │
└──────┬───────────────┬────────┴──────────┬───────────────┬──────────────┘
       │               │                   │               │
       ▼               ▼                   ▼               ▼
┌─────────────┐ ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│  10 Trading │ │  45+ Domain │  │   4 Exchange  │  │  5 Arbitrage │
│   Agents    │ │  Services   │  │   Adapters    │  │   Engines    │
│  (Redis     │ │  (Risk,     │  │  (Coinbase,   │  │  (Funding,   │
│   pub/sub)  │ │   Exec,     │  │   Kraken,     │  │   Cross-Exch,│
│             │ │   Backtest)  │  │   MEXC, DEX)  │  │   Stat, Tri) │
└──────┬──────┘ └──────┬──────┘  └──────┬───────┘  └──────┬───────┘
       │               │                │                  │
       ▼               ▼                ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                        │
│  Supabase PostgreSQL (64 tables, 212 RLS policies, 42 migrations)        │
│  Redis 7 (pub/sub channels, rate limit state, cache)                     │
│  38 Deno Edge Functions (exchange integrations, signals, risk ops)        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Module Dependency Graph

```
                    ┌────────────────────┐
                    │     app/main.py    │ ← FastAPI entry point
                    └──────┬─────────────┘
                           │
              ┌────────────┼────────────────────────┐
              ▼            ▼                         ▼
      ┌──────────┐  ┌──────────┐              ┌──────────┐
      │ app/api/ │  │app/core/ │              │app/middle│
      │ 14       │  │ config,  │              │ ware/    │
      │ routers  │  │ security,│              │ security │
      └────┬─────┘  │ registry │              └──────────┘
           │        └────┬─────┘
           ▼             │
      ┌──────────────────┼──────────────────────────┐
      │                  │                           │
      ▼                  ▼                           ▼
┌───────────┐    ┌──────────────┐           ┌──────────────┐
│app/agents/│    │app/services/ │           │app/enterprise│
│ 10 agents │    │ 45+ services │           │ RBAC, audit, │
│ + orchest.│    │ (engines,    │           │ risk limits, │
│           │    │  managers)   │           │ compliance   │
└─────┬─────┘    └──────┬──────┘           └──────────────┘
      │                 │
      ▼                 ▼
┌───────────┐    ┌──────────────┐
│app/adapte │    │ app/models/  │
│rs/ 4 venue│    │ domain.py,   │
│ adapters  │    │ backtest,    │
│           │    │ basis, etc.  │
└───────────┘    └──────────────┘
      │                 │
      └────────┬────────┘
               ▼
      ┌──────────────┐
      │app/database  │ ← Supabase client
      │app/config    │ ← Pydantic settings
      └──────────────┘
```

---

## Backend Architecture

### Entry Point: `backend/app/main.py`

The FastAPI application uses a lifespan context manager for ordered startup/shutdown.

**Startup sequence:**
1. `init_db()` — Supabase client initialization
2. `market_data_service.start()` — Market data polling
3. `initialize_freqtrade_integration()` — FreqTrade bot bridge
4. `smart_order_router.initialize()` — Multi-venue order routing
5. `advanced_risk_engine.initialize()` — VaR / portfolio optimization
6. `arbitrage_engine.start()` — Arbitrage opportunity scanning

**Shutdown:** Reverse order (arbitrage -> FreqTrade -> market data -> DB close).

### Middleware Stack (request processing order)

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | CORSMiddleware | Specific origins, credentials=true, 24h preflight cache |
| 2 | TrustedHostMiddleware | Production only — allowed hosts enforcement |
| 3 | RequestValidationMiddleware | 10 MB body limit, XSS/SQL injection detection |
| 4 | SecurityHeadersMiddleware | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| 5 | Request Context Middleware | X-Request-ID generation, structlog binding |
| 6 | Auth Middleware | Bearer JWT -> Supabase verify -> role lookup |
| 7 | Rate Limiting (slowapi) | 30/min trading, 100/min read, 10/min auth |

### API Routers (all under `/api/v1`)

14 routers registered via `app/api/routes.py`:

| Router | Prefix | Endpoints | Purpose |
|--------|--------|-----------|---------|
| trading | `/api/trading` | 4 | Positions, orders, fills, trade intents |
| risk | `/api/risk` | 10 | Risk limits, VaR, stress tests, kill switch, circuit breakers |
| venues | `/api/venues` | 4 | Venue listing, health, instruments |
| meme | `/api/meme` | 8 | Meme project pipeline (create, score, advance, checklist) |
| system | `/system` | 4 | Kill switch activate/deactivate/status, alerts |
| agents | `/agents` | 6 | Agent status, start/stop, commands, behavior versions |
| arbitrage | `/api/arbitrage` | 6 | Arb opportunities, funding rates, stats, start/stop |
| market | `/api/market` | 6 | Ticker, candles, orderbook, trades, symbols, exchanges |
| strategies | `/api/strategies` | 6 | FreqTrade strategy listing, backtest, signals, validation |
| screener | `/screener` | 5 | Strategy scanning, opportunity ranking, deployment |
| backtest | `/backtest` | 6 | Institutional backtesting with equity curves, trades |
| execution | `/execution` | 3 | Strategy registry, walk-forward analysis |
| ml_signals | `/ml` | 6 | ML signal generation, model registry, training |
| compliance | `/compliance` | 2 | Compliance report generation, CSV export |
| websocket | `/ws` | 1 WS | Real-time streams (market, signals, arb, portfolio, agents) |
| health | `/health`, `/ready`, `/metrics` | 4 | Liveness, readiness, JSON + Prometheus metrics |

### Service Layer (`backend/app/services/` — 45+ files)

Services are organized by trading domain. Key engines:

**Risk Management:**
- `risk_engine.py` — Pre-trade checks (kill switch, circuit breakers, position limits, daily loss)
- `advanced_risk_engine.py` — VaR (historical, parametric, Monte Carlo), portfolio optimization (Modern Portfolio Theory), stress testing, risk attribution, liquidity-adjusted VaR, counterparty risk

**Order Execution:**
- `smart_order_router.py` — Multi-venue scoring, TWAP/VWAP/POV/Iceberg algorithm selection, market impact modeling
- `order_gateway.py` — Order submission and lifecycle management
- `execution_planner.py` — Legged execution with atomic unwind on failure
- `oms_execution.py` — Single point of truth for order creation (writes to DB)

**Portfolio & Positions:**
- `portfolio_engine.py` / `portfolio_analytics.py` — Tracking, P&L, Greeks
- `position_manager.py` / `position_sizer.py` — Lifecycle management, Kelly criterion sizing
- `capital_allocator.py` — Strategy-level capital distribution

**Backtesting:**
- `institutional_backtester.py` — Full backtesting engine with slippage/commission modeling
- `enhanced_backtesting_engine.py` — Extended backtesting features
- `walk_forward_engine.py` — Rolling window train/test validation

**Arbitrage:**
- `arbitrage_engine.py` — Orchestrates 5 arbitrage types
- `basis_edge_model.py` / `spot_arb_edge_model.py` — Edge calculation
- `basis_opportunity_scanner.py` / `spot_arb_scanner.py` — Opportunity detection

**Market Data:**
- `market_data_service.py` — Price polling and distribution
- `enhanced_market_data_service.py` — Extended market data features
- `regime_detection_service.py` — Market regime classification

**ML & Signals:**
- `enhanced_signal_engine.py` — Signal aggregation and scoring
- `technical_analysis.py` — Technical indicator computation
- `model_registry.py` — ML model version tracking with metrics

### Multi-Agent System (`backend/app/agents/`)

10 agents with a strict hierarchy, communicating via Redis pub/sub:

```
META-DECISION AGENT (veto power — no trade proceeds without approval)
  |
  +-- CAPITAL ALLOCATION AGENT (distributes capital across strategies)
  +-- RISK AGENT (pre-trade validation, kill switch enforcement)
  +-- SIGNAL AGENT (trend/mean-reversion/funding signal generation)
  +-- EXECUTION AGENT (order routing to venues)
  +-- ARBITRAGE AGENT (cross-venue opportunity detection)
  +-- FREQTRADE SIGNAL AGENT (FreqTrade strategy signals)
  +-- STRATEGY LIFECYCLE AGENT (strategy state management)
```

**BaseAgent** (`base_agent.py`):
- Redis pub/sub with message queue fallback (max 1000 messages)
- Exponential backoff reconnection (1s -> 30s)
- Supabase heartbeats every 30s (CPU, memory, status)
- Control channel commands: pause, resume, shutdown
- Behavior version tracking (D21): prompt hash, tool list, model ID, drift metrics

**Redis Channels:**
`agent:signals`, `agent:risk_check`, `agent:risk_approved`, `agent:execution`, `agent:fills`, `agent:control`, `agent:heartbeat`

### Exchange Adapters (`backend/app/adapters/`)

4 venue adapters implementing the `VenueAdapter` abstract base class:

| Adapter | File | Status |
|---------|------|--------|
| Coinbase | `coinbase_adapter.py` | Scaffolded (random data) |
| Kraken | `kraken_adapter.py` | Scaffolded (random data) |
| MEXC | `mexc_adapter.py` | Scaffolded (random data) |
| DEX | `dex_adapter.py` | Scaffolded (random data) |

The adapter interface defines: `connect()`, `place_order()`, `cancel_order()`, `get_balance()`, `get_positions()`, `health_check()`.

### Enterprise Features (`backend/app/enterprise/`)

- **RBAC** (`rbac.py`) — 6 roles (viewer, analyst, trader, PM, CIO, admin), 25 granular permissions, per-role trade size limits
- **Audit** (`audit.py`) — Async buffer (100 events, 5s flush), structured events, 9 categories, 5 severity levels
- **Risk Limits** (`risk_limits.py`) — Position/loss/drawdown/exposure/velocity limits with breach tracking
- **Compliance** (`compliance.py`, `compliance_reporting.py`) — Trading region restrictions, regulatory report generation (JSON + CSV export)

### Arbitrage Engines (`backend/app/arbitrage/`)

5 arbitrage strategy engines, orchestrated by `engine.py`:

| Engine | File | Strategy |
|--------|------|----------|
| Funding Rate | `funding_rate.py` | Perpetual funding rate arbitrage |
| Cross-Exchange | `cross_exchange.py` | Price discrepancy across venues |
| Statistical | `statistical.py` | Pairs trading via cointegration |
| Triangular | `triangular.py` | Three-leg currency triangulation |
| Basis | (in services) | Spot-futures basis trading |

---

## Frontend Architecture

### Technology Stack

- **Framework:** React 18 with TypeScript (Vite build)
- **State Management:** TanStack Query (React Query) for server state, React Context for app state
- **UI Library:** shadcn/ui (Radix UI primitives) with Tailwind CSS
- **Charting:** Recharts + Lightweight Charts (TradingView)
- **Routing:** React Router v6 with `<ProtectedRoute>` guards
- **Real-time:** Supabase Realtime subscriptions + native WebSocket

### Context Provider Hierarchy

```
QueryClientProvider (TanStack Query)
  BrowserRouter
    AuthProvider (Supabase auth state)
      TradingModeProvider (paper/live mode)
        UserModeProvider (observer/paper/guarded/advanced)
          MarketDataProvider (5s refresh, price feed)
            AICopilotProvider (AI assistant context)
              AlertNotificationProvider (toast/alert system)
                <Routes />
```

### Pages (22 routes in `src/App.tsx`)

All protected by `<ProtectedRoute>` except `/auth`:

| Route | Page | Domain |
|-------|------|--------|
| `/` | Index (Dashboard) | Metrics, agent status, positions, P&L |
| `/agents` | Agents | Agent registry, status, role management |
| `/strategies` | Strategies | Strategy CRUD, backtest, deploy |
| `/execution` | Execution | Order history, alerts, kill switch |
| `/risk` | Risk | Risk analytics, kill switch, circuit breakers |
| `/launch` | Launch | Meme project pipeline |
| `/treasury` | Treasury | Wallet management (ETH, BTC, SOL) |
| `/observability` | Observability | System monitoring |
| `/settings` | Settings | Configuration |
| `/engine` | Engine | Strategy execution engine controls |
| `/analytics` | Analytics | Portfolio performance, trade journal |
| `/markets` | Markets | Market data viewer |
| `/positions` | Positions | Live position tracking, P&L |
| `/audit` | AuditLog | Compliance activity log |
| `/status` | SystemStatus | Health checks, uptime |
| `/arbitrage` | Arbitrage | Spot & funding arb opportunities |
| `/trade` | Trade | Unified spot trader, risk simulator |
| `/operations` | Operations | Data source health |
| `/screener` | Screener | Asset screener |
| `/multi-exchange-demo` | MultiExchangeDemo | Multi-venue routing demo |
| `/auth` | Auth | Login/signup (public) |
| `*` | NotFound | 404 handler |

### Hooks (`src/hooks/` — 66 files)

- **29 hooks** performing real backend queries (useAgents, useAuth, usePositions, useLivePriceFeed, useStrategies, useBacktestResults, useSpotArbSpreads, useDashboardMetrics, etc.)
- **37 hooks** that are stubs, partial, or thin wrappers (useMarketRegimes, useSignalScoring, useDerivativesData, useTradingCopilot, useWhaleAlerts, etc.)

### Component Library (`src/components/` — 162 components, 34 subdirectories)

Major component groups: dashboard, trading, risk, arbitrage, agents, strategies, portfolio, compliance, audit, meme, wallet, charts, orders, positions, settings, observability, intelligence.

All use the shadcn/ui design system with a dark-theme trading aesthetic.

---

## Data Flow: Market Data -> Signal Engine -> Trading Engine -> Order Gateway

```
                     ┌──────────────────┐
                     │  Exchange APIs   │
                     │  (via adapters   │
                     │   or edge fns)   │
                     └────────┬─────────┘
                              │ prices, orderbook, trades
                              ▼
                     ┌──────────────────┐
                     │  Market Data     │
                     │  Service         │  app/services/market_data_service.py
                     │  (polling +      │
                     │   distribution)  │
                     └────────┬─────────┘
                              │ Redis pub/sub: agent:signals
                              ▼
              ┌───────────────────────────────┐
              │       SIGNAL GENERATION        │
              │                                │
              │  Signal Agent                  │ app/agents/signal_agent.py
              │    ├─ Technical Analysis       │ app/services/technical_analysis.py
              │    ├─ Regime Detection          │ app/services/regime_detection_service.py
              │    ├─ Enhanced Signal Engine    │ app/services/enhanced_signal_engine.py
              │    └─ FreqTrade Signal Agent   │ app/agents/freqtrade_signal_agent.py
              │                                │
              │  Output: TradeIntent           │
              │  {instrument, direction,       │
              │   confidence, strategy}         │
              └───────────────┬───────────────┘
                              │ Redis: agent:risk_check
                              ▼
              ┌───────────────────────────────┐
              │     META-DECISION AGENT        │
              │                                │
              │  Evaluates: market regime,     │ app/agents/meta_decision_agent.py
              │  volatility, liquidity,         │
              │  correlation exposure            │
              │                                │
              │  Decision: ALLOW / FORBID      │
              │  + intensity level              │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     CAPITAL ALLOCATION          │
              │                                │
              │  Distributes capital budget     │ app/agents/capital_allocation_agent.py
              │  per strategy based on          │ app/services/capital_allocator.py
              │  performance & correlation      │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │         RISK AGENT             │
              │  (Final veto — cannot be       │
              │   overridden)                  │
              │                                │
              │  Checks:                       │ app/agents/risk_agent.py
              │  1. Kill switch active?         │ app/services/risk_engine.py
              │  2. Circuit breakers tripped?   │
              │  3. Position limits exceeded?   │
              │  4. Daily loss limit reached?   │
              │  5. Exposure limits breached?   │
              │  6. Venue health OK?            │
              │                                │
              │  Decision: APPROVED / MODIFY   │
              │            / REJECT            │
              └───────────────┬───────────────┘
                              │ Redis: agent:risk_approved
                              ▼
              ┌───────────────────────────────┐
              │     EXECUTION COST GATE        │
              │                                │
              │  Expected Edge >               │ app/services/edge_cost_model.py
              │    Spread + Slippage +          │ app/services/execution_planner.py
              │    Fees + Buffer                │
              │                                │
              │  If unprofitable: REJECT       │
              └───────────────┬───────────────┘
                              │ Redis: agent:execution
                              ▼
              ┌───────────────────────────────┐
              │      EXECUTION AGENT           │
              │                                │
              │  Smart Order Router selects:   │ app/agents/execution_agent.py
              │  - Best venue (scoring)         │ app/services/smart_order_router.py
              │  - Algorithm (TWAP/VWAP/POV/   │
              │    Iceberg)                     │
              │  - Market impact model          │
              │                                │
              │  Execution Planner handles:     │
              │  - Multi-leg atomic execution   │
              │  - Unwind on partial failure    │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │        ORDER GATEWAY           │
              │                                │
              │  OMS Execution: single point    │ app/services/oms_execution.py
              │  of order creation              │ app/services/order_gateway.py
              │                                │
              │  1. Final kill switch check     │
              │  2. Book status verification    │
              │  3. Venue health check          │
              │  4. Order submission via adapter │
              │  5. Fill recording               │
              │  6. Decision trace creation      │
              └───────────────┬───────────────┘
                              │ Redis: agent:fills
                              ▼
              ┌───────────────────────────────┐
              │    POSITION & PORTFOLIO        │
              │                                │
              │  Position Manager updates      │ app/services/position_manager.py
              │  Portfolio Engine recomputes   │ app/services/portfolio_engine.py
              │  Performance Metrics tracks    │ app/services/performance_metrics.py
              │  Supabase positions table      │
              └───────────────────────────────┘
```

---

## Risk Management Pipeline

### Pre-Trade Risk Checks (RiskEngine)

Every trade intent passes through `risk_engine.check_intent()` which evaluates:

1. **Kill Switch** — Global or per-book halt. If active, all trades rejected immediately.
2. **Circuit Breakers** — 5 types: global, latency, error_rate, recon_mismatch, vol_shock. Any tripped breaker halts trading.
3. **Leverage Cap** — Configurable max leverage per book.
4. **Position Size Limits** — Per-instrument and per-book maximum notional.
5. **Spread/Liquidity** — Minimum liquidity requirements before execution.
6. **Daily Loss Limit** — Cumulative P&L threshold per book.
7. **Max Drawdown** — Portfolio drawdown circuit breaker.
8. **Correlation Exposure** — Simplified cross-position correlation check.
9. **Venue Health** — Adapter health check must pass.

### Advanced Risk Analytics (AdvancedRiskEngine)

- **Value at Risk (VaR)** — Historical, parametric, and Monte Carlo methods at 95%, 99%, 99.9% confidence levels
- **Expected Shortfall (CVaR)** — Tail risk beyond VaR threshold
- **Liquidity-Adjusted VaR** — Incorporates market impact and liquidation time
- **Stress Testing** — Configurable scenarios (market crash, flash crash, correlation breakdown, liquidity crisis)
- **Portfolio Optimization** — Mean-variance optimization (Modern Portfolio Theory) with constraints
- **Risk Attribution** — Factor-model decomposition into systematic and idiosyncratic risk
- **Counterparty Risk** — Per-venue exposure assessment

### Position Sizing

`position_sizer.py` implements Kelly criterion position sizing with configurable fractional Kelly (typically 25-50% of full Kelly) to account for estimation error.

### Database-Level Circuit Breakers

Supabase migration `20260220042730` installs PostgreSQL triggers on fills and positions tables that:
- Compute running daily P&L
- Freeze books when loss limits are breached
- Activate the global kill switch automatically

---

## Key Abstractions and Extension Points

### Adding a New Strategy

1. Create a strategy class compatible with the FreqTrade interface (`populate_indicators`, `populate_entry_trend`, `populate_exit_trend`)
2. Place strategy file in `data/freqtrade/strategies/`
3. Register with the Strategy Registry via `POST /api/v1/execution/strategies`
4. The strategy will be discovered by the StrategyManager and available for backtesting and signals
5. **Cannot bypass:** Risk Agent, Execution Cost Gate, Trading Gate

### Adding a New Exchange Venue

1. Create a new adapter in `backend/app/adapters/` implementing `VenueAdapter` ABC
2. Implement all 6 methods: `connect()`, `place_order()`, `cancel_order()`, `get_balance()`, `get_positions()`, `health_check()`
3. Register with the Smart Order Router
4. Add venue configuration to environment variables
5. Add fee structure to the edge cost model

### Adding a New Agent

1. Create agent class in `backend/app/agents/` extending `BaseAgent`
2. Define `agent_type`, subscribed channels, and `process_message()` handler
3. Register in `agent_orchestrator.py`
4. Agent automatically gets: Redis pub/sub, heartbeat reporting, control commands, behavior versioning

### Adding a New API Router

1. Create router file in `backend/app/api/`
2. Import and register in `app/api/routes.py` via `api_router.include_router()`
3. Apply rate limiting decorators from `app/middleware/security`
4. Use Pydantic models for request/response schemas

### Adding a Frontend Page

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx` wrapped in `<ProtectedRoute>`
3. Create hooks in `src/hooks/` for data fetching (use TanStack Query)
4. Use existing component library from `src/components/ui/`

---

## Deployment Architecture

### Docker Compose Services

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.yml                         │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│  │   api    │   │  agents  │   │  redis   │                │
│  │ :8000    │   │ (orchest │   │  :6379   │                │
│  │ FastAPI  │──▶│  rator)  │──▶│ 7-alpine │                │
│  │ backend  │   │          │   │ AOF +    │                │
│  │          │   │          │   │ password │                │
│  └──────────┘   └──────────┘   └──────────┘                │
│       │                                                      │
│  ┌──────────┐                                                │
│  │ frontend │  (profile: with-frontend)                      │
│  │  :3000   │                                                │
│  │  nginx   │                                                │
│  └──────────┘                                                │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────┐     ┌──────────────────┐
│   Supabase     │     │  38 Deno Edge    │
│   PostgreSQL   │     │  Functions       │
│   (managed)    │     │  (Supabase)      │
└────────────────┘     └──────────────────┘
```

**Services:**

| Service | Image / Build | Port | Purpose |
|---------|--------------|------|---------|
| api | `backend/Dockerfile` | 8000 | FastAPI backend, health checks |
| agents | `backend/Dockerfile` | — | Agent orchestrator (separate process) |
| redis | `redis:7-alpine` | 6379 | Pub/sub, caching, rate limit state |
| frontend | `Dockerfile.frontend` | 3000 | Static React build served by nginx |

**Additional compose files:**
- `docker-compose.staging.yml` — Staging environment overrides
- `docker-compose.trading.yml` — FreqTrade bot containers

### Health Checks

- **API:** `GET /health` (liveness) checks DB + Redis connectivity
- **API:** `GET /ready` (readiness) checks all dependencies, returns 503 if not ready
- **API:** `GET /metrics` — JSON application metrics
- **API:** `GET /metrics/prometheus` — Prometheus scrape endpoint
- **Redis:** `redis-cli ping` every 10s

### Observability

- **Structured logging:** structlog with JSON output, request-scoped context (X-Request-ID)
- **Sentry:** Error tracking initialized at app startup (`app/core/observability.py`)
- **OpenTelemetry:** Distributed tracing initialized after route registration
- **Agent heartbeats:** Every 30s to Supabase, stale detection at 90s
- **Prometheus metrics:** `ec_uptime_seconds`, `ec_requests_total`, `ec_trades_total`, `ec_trade_errors_total`, `ec_trade_latency_p{50,95,99}_ms`, `ec_agents_{tracked,stale}`

### CI/CD

- **GitHub Actions ci.yml:** Frontend (tsc -> ESLint -> vitest) + Backend (Ruff -> Bandit -> pip-audit -> pytest -> Docker build)
- **GitHub Actions e2e.yml:** Playwright chromium on PR/nightly/manual
- **Dependabot:** Weekly updates for pip, npm, GitHub Actions

---

## Database Schema (Supabase PostgreSQL)

### Key Table Groups (64 tables across 42 migrations)

| Domain | Tables | Purpose |
|--------|--------|---------|
| Trading | books, orders, positions, fills, trade_intents, leg_events | Core order lifecycle |
| Strategies | strategies, strategy_allocations | Strategy configuration |
| Venues | venues, venue_health, instruments | Exchange connections |
| Risk | risk_limits, risk_breaches, circuit_breaker_events, global_settings | Risk controls |
| Users | profiles, user_roles, user_tenants, tenants, user_exchange_keys | Multi-tenant auth |
| Market Data | market_snapshots, derivatives_metrics, onchain_metrics, whale_transactions | Market intelligence |
| Intelligence | signals, decision_traces, alerts, audit_events | Decision audit trail |
| Meme | meme_projects, meme_tasks | Meme venture pipeline |
| Arbitrage | basis_positions, spot_arb_positions, basis_metrics, spot_arb_metrics | Arb tracking |
| ML | walk_forward_results | Backtest persistence |

### RLS Architecture

- 212 RLS policies across 16+ tables
- Multi-tenant isolation via `book_id` and `current_tenant_id()` function
- Role-based access using `has_any_role()` function (7 roles)
- Service role bypass for backend operations
- Audit events table: INSERT-only (immutable by design)
- API key encryption: pgcrypto AES-256 via SECURITY DEFINER functions

---

## Edge Functions (38 in `supabase/functions/`)

| Category | Count | Functions |
|----------|-------|-----------|
| Trading | 7 | live-trading, trading-api, binance-us-trading, coinbase-trading, kraken-trading, hyperliquid, toggle-strategy |
| Arbitrage | 4 | cross-exchange-arbitrage, funding-arbitrage, basis-arbitrage, approve-meme-launch |
| Intelligence | 5 | market-intelligence, market-data, market-data-stream, whale-alerts, real-news-feed |
| Signals | 2 | signal-scoring, analyze-signal |
| Risk/Ops | 6 | health-check, kill-switch, freeze-book, reallocate-capital, scheduled-monitor, alert-create + send-alert-notification |
| Integrations | 4 | tradingview-webhook, telegram-alerts, external-signals, token-metrics |
| AI | 2 | trading-copilot, ai-trading-copilot |
| Exchange | 2 | exchange-keys, exchange-validate |
| Audit | 1 | audit-log |
| Shared | 1 | `_shared/` (cors, security, oms-client, tenant-guard, validation) |
