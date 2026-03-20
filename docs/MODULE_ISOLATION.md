# Enterprise Crypto — Module Isolation

**Version:** 1.0
**Date:** 2026-03-19

This document defines the layer enforcement rules, module boundaries, and dependency direction for the Enterprise Crypto codebase. All contributors must follow these rules to maintain architectural integrity.

---

## Layered Architecture

The backend is organized into five layers. Dependencies flow strictly inward (higher layers depend on lower layers, never the reverse).

```text
Layer 5 (outermost)   app/api/          HTTP routers, request/response schemas
Layer 4               app/agents/       Multi-agent system, orchestrator
Layer 3               app/services/     Domain services, engines, business logic
Layer 2               app/enterprise/   RBAC, audit, risk limits, compliance
Layer 1               app/adapters/     Exchange venue adapters
Layer 0 (innermost)   app/models/       Pydantic domain models
                      app/core/         Config, security, observability
                      app/database.py   Supabase client
                      app/config.py     Pydantic settings
```

### Dependency Direction (always inward)

```text
api/ ──> agents/ ──> services/ ──> enterprise/ ──> adapters/ ──> models/
  \         \            \              \              \            |
   \         \            \              \              +---------> core/
    \         \            \              +--------------------------> database
     \         \            +-------------------------------------------> config
      \         +-------------------------------------------------------> models/
       +----------------------------------------------------------------> core/
```

**The rule:** A module at layer N may import from any module at layer N-1 or below. It must never import from a module at layer N+1 or above.

---

## Layer Enforcement Rules

### Layer 0: Models & Core (`app/models/`, `app/core/`, `app/config.py`, `app/database.py`)

**Responsibility:** Data structures, configuration, database client, security primitives, observability setup.

**May import from:** Python standard library, third-party packages only.

**Must never import from:** Any other `app/` module.

| Module | Purpose | Key exports |
| ------ | ------- | ----------- |
| `app/models/domain.py` | Pydantic domain models (Order, Position, TradeIntent, Book, VenueHealth, RiskCheckResult) | All trading domain types |
| `app/models/backtest_result.py` | Backtest result and performance metrics models | BacktestResult, PerformanceMetrics |
| `app/models/basis.py` | Basis arbitrage models | BasisPosition, BasisMetrics |
| `app/models/opportunity.py` | Arbitrage opportunity models | Various opportunity types |
| `app/core/config.py` | Pydantic Settings with environment variables | settings singleton |
| `app/core/security.py` | JWT verification, token handling | get_current_user, verify_token |
| `app/core/observability.py` | Sentry + OpenTelemetry initialization | init_sentry, init_tracing |
| `app/core/strategy_registry.py` | Strategy definition registry | strategy_registry singleton |
| `app/core/agent_identity.py` | Agent message signing/verification | create_agent_identity, verify_agent_signature |
| `app/config.py` | Unified Pydantic settings (re-export) | settings |
| `app/database.py` | Supabase client, audit_log helper, kill switch functions | get_supabase, init_db, close_db |
| `app/logging_config.py` | structlog configuration | configure_logging |

### Layer 1: Adapters (`app/adapters/`)

**Responsibility:** Exchange venue connectivity. Translate between internal domain models and external exchange APIs.

**May import from:** `app/models/`, `app/core/`, `app/config.py`.

**Must never import from:** `app/services/`, `app/agents/`, `app/api/`, `app/enterprise/`.

| Module | Purpose |
| ------ | ------- |
| `base.py` | `VenueAdapter` abstract base class (6 methods: connect, place_order, cancel_order, get_balance, get_positions, health_check) |
| `coinbase_adapter.py` | Coinbase exchange adapter (scaffolded) |
| `kraken_adapter.py` | Kraken exchange adapter (scaffolded) |
| `mexc_adapter.py` | MEXC exchange adapter (scaffolded) |
| `dex_adapter.py` | DEX aggregator adapter (scaffolded) |

### Layer 2: Enterprise (`app/enterprise/`)

**Responsibility:** Cross-cutting enterprise concerns that apply across all services.

**May import from:** `app/models/`, `app/core/`, `app/config.py`, `app/database.py`.

**Must never import from:** `app/services/`, `app/agents/`, `app/api/`, `app/adapters/`.

| Module | Purpose |
| ------ | ------- |
| `rbac.py` | Role-Based Access Control: 6 roles, 25 permissions, per-role trade size limits |
| `audit.py` | Async audit event buffering: 100-event / 5s flush, 9 categories, 5 severity levels |
| `risk_limits.py` | Position/loss/drawdown/exposure/velocity limits with breach tracking |
| `compliance.py` | Trading region restrictions, rule engine |
| `compliance_reporting.py` | Regulatory report generation (JSON + CSV export) |

### Layer 3: Services (`app/services/`)

**Responsibility:** All domain business logic. Engines, managers, analyzers.

**May import from:** `app/adapters/`, `app/enterprise/`, `app/models/`, `app/core/`, `app/config.py`, `app/database.py`.

**Must never import from:** `app/agents/`, `app/api/`.

Key service groups:

| Group | Modules | Purpose |
| ----- | ------- | ------- |
| Risk | `risk_engine.py`, `advanced_risk_engine.py`, `drawdown_monitor.py` | Pre-trade checks, VaR, stress testing |
| Execution | `smart_order_router.py`, `order_gateway.py`, `execution_planner.py`, `oms_execution.py`, `order_simulator.py` | Order routing and lifecycle |
| Portfolio | `portfolio_engine.py`, `portfolio_analytics.py`, `position_manager.py`, `position_sizer.py`, `capital_allocator.py` | Position tracking, sizing, allocation |
| Backtesting | `institutional_backtester.py`, `enhanced_backtesting_engine.py`, `walk_forward_engine.py`, `backtesting.py` | Strategy validation |
| Arbitrage | `arbitrage_engine.py`, `basis_edge_model.py`, `spot_arb_edge_model.py`, `basis_opportunity_scanner.py`, `spot_arb_scanner.py` | Arbitrage detection and execution |
| Market Data | `market_data_service.py`, `enhanced_market_data_service.py` | Price feeds and distribution |
| ML/Signals | `enhanced_signal_engine.py`, `regime_detection_service.py`, `technical_analysis.py`, `model_registry.py` | Signal generation and ML |
| Strategy | `strategy_registry.py`, `strategy_screener.py`, `strategy_metrics_service.py` | Strategy management |
| Infrastructure | `cache.py`, `realtime_broadcaster.py`, `reconciliation.py`, `live_reconciliation.py`, `performance_metrics.py` | Cross-cutting service utilities |

### Layer 4: Agents (`app/agents/`)

**Responsibility:** Autonomous trading agents that communicate via Redis pub/sub and coordinate through the orchestrator.

**May import from:** `app/services/`, `app/enterprise/`, `app/adapters/`, `app/models/`, `app/core/`, `app/config.py`, `app/database.py`.

**Must never import from:** `app/api/`.

| Module | Purpose |
| ------ | ------- |
| `base_agent.py` | BaseAgent ABC: Redis pub/sub, heartbeats, behavior versioning, drift metrics |
| `agent_orchestrator.py` | Starts/stops/monitors all agents, routes messages |
| `meta_decision_agent.py` | Veto power: evaluates market regime, allows/forbids trading |
| `risk_agent.py` | Final pre-trade validation, kill switch enforcement |
| `signal_agent.py` | Signal generation from technical/fundamental analysis |
| `capital_allocation_agent.py` | Capital budget distribution across strategies |
| `execution_agent.py` | Order execution via smart order router |
| `arbitrage_agent.py` | Cross-venue arbitrage opportunity detection |
| `freqtrade_signal_agent.py` | FreqTrade strategy signal bridging |
| `strategy_lifecycle.py` | Strategy state machine management |
| `behavior_tracking.py` | Agent behavior version tracking and drift detection |

### Layer 5: API (`app/api/`)

**Responsibility:** HTTP interface. Translates HTTP requests into service calls and formats responses. No business logic.

**May import from:** All lower layers.

**Must never import from:** Nothing imports from `app/api/` (except `app/main.py` which wires routers).

| Module | Purpose |
| ------ | ------- |
| `routes.py` | Aggregates all 14 sub-routers into `api_router` |
| `trading.py` | Positions, orders, fills, trade intents |
| `risk.py` | Risk limits, VaR, stress tests, kill switch, circuit breakers |
| `venues.py` | Venue listing, health status, instruments |
| `meme.py` | Meme project pipeline CRUD |
| `system.py` | Kill switch control, system alerts, health |
| `agents.py` | Agent lifecycle (start/stop/command), status, behavior versions |
| `arbitrage.py` | Arbitrage opportunities, funding rates, engine control |
| `market.py` | Ticker, candles, orderbook, trades, symbols |
| `strategies.py` | FreqTrade strategy management, backtest, signals |
| `screener.py` | Strategy scanning and opportunity deployment |
| `backtest.py` | Institutional backtesting with equity curves |
| `execution.py` | Strategy registry, walk-forward analysis |
| `ml_signals.py` | ML signal generation, model registry, training |
| `compliance.py` | Compliance report generation and export |
| `websocket.py` | WebSocket streaming (market, signals, arb, portfolio, agents) |
| `health.py` | Liveness, readiness, JSON + Prometheus metrics |
| `schemas/` | Pydantic request/response schemas (e.g., `backtest_schemas.py`) |

### Middleware (`app/middleware/`)

**Responsibility:** Cross-cutting HTTP concerns (security headers, request validation, rate limiting).

**May import from:** `app/core/`, `app/config.py`.

**Must never import from:** `app/services/`, `app/agents/`, `app/api/`.

---

## Frontend Module Boundaries

```text
src/
  pages/         Page-level components (one per route). Import from components/, hooks/, contexts/.
  components/    Presentational and smart components. Import from hooks/, lib/, contexts/, ui/.
  hooks/         Data fetching and state logic. Import from lib/, integrations/.
  contexts/      React Context providers. Import from hooks/, lib/.
  providers/     Provider wrappers. Import from contexts/.
  lib/           Pure utility functions and domain logic (tradingGate, decisionTrace, userModes).
  integrations/  Supabase client and generated types.
  types/         TypeScript type definitions.
```

**Dependency direction:**

```text
pages/ --> components/ --> hooks/ --> lib/
  |            |             |         |
  |            |             +-------> integrations/
  |            +-------------------->  contexts/
  +-------------------------------->  types/
```

**Rules:**
- `lib/` and `integrations/` must not import from `hooks/`, `components/`, `pages/`, or `contexts/`.
- `hooks/` must not import from `components/` or `pages/`.
- `components/` must not import from `pages/`.
- `contexts/` must not import from `components/` or `pages/`.

---

## How to Add a New Module

### Adding a Backend Service

1. Create the file in `backend/app/services/`.
2. Import only from layers 0-2 (models, core, config, database, adapters, enterprise).
3. Never import from `app/agents/` or `app/api/`.
4. If your service needs data from an exchange, call through an adapter (layer 1), not directly.
5. Export a module-level singleton instance if the service maintains state (e.g., `risk_engine = RiskEngine()`).
6. Add tests in `backend/tests/`.

### Adding a Backend Agent

1. Create the file in `backend/app/agents/`.
2. Extend `BaseAgent` from `base_agent.py`.
3. Define `agent_type`, `subscribed_channels`, and implement `process_message()`.
4. Register the agent in `agent_orchestrator.py`.
5. The agent may import from services (layer 3) and below, but never from `app/api/`.
6. Add tests in `backend/tests/`.

### Adding an API Router

1. Create the file in `backend/app/api/`.
2. Define a `router = APIRouter(prefix="/your-prefix", tags=["your-tag"])`.
3. Import and register in `app/api/routes.py`.
4. Delegate all business logic to services (layer 3). The router must not contain domain logic.
5. Use Pydantic models for request/response validation (place complex schemas in `app/api/schemas/`).
6. Apply rate limiting via `@limiter.limit(RATE_LIMITS["read"])` or similar.

### Adding a Frontend Hook

1. Create the file in `src/hooks/`.
2. Use TanStack Query (`useQuery`, `useMutation`) for server state.
3. Import only from `src/lib/`, `src/integrations/`, or `src/types/`.
4. Never import from `src/components/` or `src/pages/`.
5. Export the hook as the default or named export.

### Adding a Frontend Component

1. Create the file in `src/components/<domain>/`.
2. Use hooks for data fetching; do not call Supabase directly from components.
3. Use the shadcn/ui design system components from `src/components/ui/`.
4. Import types from `src/types/` or `src/integrations/supabase/types.ts`.

### Adding an Exchange Adapter

1. Create the file in `backend/app/adapters/`.
2. Implement the `VenueAdapter` abstract base class (all 6 methods).
3. Import only from `app/models/` and `app/core/`.
4. Never import from services, agents, or API layers.
5. Register with the Smart Order Router in the service layer.

---

## Violation Detection

To check for layer violations, search for imports that cross boundaries:

```bash
# Agents importing from API (violation)
grep -r "from app.api" backend/app/agents/

# Services importing from API or agents (violation)
grep -r "from app.api\|from app.agents" backend/app/services/

# Enterprise importing from services, agents, or API (violation)
grep -r "from app.services\|from app.agents\|from app.api" backend/app/enterprise/

# Adapters importing from services, agents, API, or enterprise (violation)
grep -r "from app.services\|from app.agents\|from app.api\|from app.enterprise" backend/app/adapters/

# Models/core importing from anything above (violation)
grep -r "from app.services\|from app.agents\|from app.api\|from app.enterprise\|from app.adapters" backend/app/models/ backend/app/core/
```

Any matches from these commands represent architectural violations that must be fixed before merging.
