# Enterprise Crypto — Full System Audit Report

**Date:** 2026-04-04
**Auditor:** Claude Code (Akiva Build Standard v2.14)
**Archetype:** 7 — Algorithmic Trading Platform
**Previous Audit:** 2026-03-17 (v2.11, post-Sprint 4, 72/100)
**Declared Agentic Engineering Level:** 5 (estimated)
**Declared Agent Runtime Tier:** AT0 (paper trading default)

---

## Verification Evidence

| Check | Result | Command |
|-------|--------|---------|
| Backend tests | **1243 passed**, 2 skipped | `pytest --cov=app` |
| Backend coverage | **64%** (floor: 60%) | `pytest --cov=app --cov-report=term-missing` |
| Backend lint | **All checks passed** | `ruff check app/` |
| Frontend tests | **284 passed** (18 files) | `npx vitest run` |
| Frontend typecheck | **Clean** (0 errors) | `tsc -p tsconfig.app.json --noEmit` |
| Frontend lint | **Clean** (0 errors) | `npx eslint . --ext .ts,.tsx` |
| E2E tests | 4 Playwright specs | `e2e/*.spec.ts` |
| Docker build | Passes in CI | `docker build -t enterprise-crypto-backend .` |
| CI matrix | Python 3.11 + 3.12 | `.github/workflows/ci.yml` |

---

## Standards Checklist (v2.14 Baseline)

### Core Standards

| Standard | Version | Applies? | Status | Impact |
|----------|---------|----------|--------|--------|
| Build Standard | v2.14 | Yes | Control-plane rubric: PARTIAL (adapters exist, optional) | D1, D21 |
| System Archetypes | v2.0 | Yes | Archetype 7 weights/minimums applied | All dims |
| Sprint Execution Protocol | v3.4 | Yes | SA-1 through SA-13 not formally executed | Governance |
| Repository Controls | v1.3 | Yes | **GAPS: No SBOM, no container scanning, no signed commits** | D8 (-2), D10 |
| Operational Standard | v1.4 | Yes | No compliance ops (§8), no data retention (§10) | D9, D20 |
| Pre-Push Verification | v1.2 | Yes | Not formally adopted | D10 |

### UI/UX and Trust Standards

| Standard | Version | Applies? | Status | Impact |
|----------|---------|----------|--------|--------|
| UI/UX Standard | v1.8 | Yes | §§17-21 (Typography, Microcopy, Animation, Touch, Hydration) not addressed | D6, D16 |
| Frontend Review Checklist | v1.0 | Yes | 44-rule sweep not executed; page-level caps not applied | D6, D16 |
| User Trust Standard | v1.4 | Yes | T-1 partial (agent status visible), T-2 partial (kill switch), T-3 through T-8 not assessed | D15 |
| Auth & User Experience | v1.2 | Yes | MFA UI exists, enforcement CONDITIONAL | D2 |
| User Personalization | v1.3 | Yes | No trading preferences, no model selection UI | D17 |

### AI Standards

| Standard | Version | Applies? | Status | Impact |
|----------|---------|----------|--------|--------|
| AI Response Quality | v1.2 | Partial | Limited AI surfaces (copilot edge functions not integrated) | D13 |
| AI Service Standard | v1.5 | Partial | No streaming surface declaration | D13 |
| AI Agent Runtime | v1.8 | Yes | Control-plane adapters PARTIAL; trading agent governance via RBAC | D21 |
| AI Resilience Standard | v1.3 | Yes | **R-1 through R-6 NOT addressed; §7 bias/fairness NOT addressed** | D13, D21 |
| Streaming AI Rendering | v1.0 | N/A | No streaming AI output surfaces identified | — |
| RAG & KG Standard | v1.3 | N/A | No RAG or knowledge graph features | — |
| LLM Gateway Standard | v1.2 | Partial | No LLM gateway circuit breakers; edge functions call LLM directly | D13 |
| Knowledge Representation | v1.0 | N/A | Not applicable | — |
| Cognitive Architecture | v1.1 | N/A | Not applicable | — |
| BENCHMARK Standard | v1.5 | Partial | No market monitoring automation, no self-healing | D13 |

### Domain-Specific Standards

| Standard | Version | Applies? | Status | Impact |
|----------|---------|----------|--------|--------|
| Integration & Webhook | v1.1 | Yes | Webhook endpoints exist (TradingView, Telegram); no reliability patterns (retry, DLQ) | D14 |
| Data Isolation | v1.1 | Yes | Financial account isolation via `book_id` + RLS. §8.5 pattern: STRONG | D3 |
| Application Composition | v1.4 | N/A | Not a composed system | — |

### Compliance Standards

| Standard | Version | Applies? | Status | Impact |
|----------|---------|----------|--------|--------|
| Compliance Framework | v1.0 | Yes | SOC 2 Type II (Required), SOX (Required), ISO 27001 (Required) — **none pursued** | D19 |
| SBOM & Supply Chain | v1.0 | Yes | **No SBOM generation, no supply chain verification** | D8 |
| AI Governance & Ethics | v1.1 | Yes | Agent drift metrics exist; no formal risk tier classification | D13, D19 |
| Change Management | v1.0 | Yes | CHANGE_LOG.md exists; no change classification, no CAB process, no immutable change log | D19 |

---

## Trust Review Snapshot

| Trust Gate | Result | Evidence |
|-----------|--------|----------|
| T-1 State Transparency | PARTIAL | Agent status dashboard shows heartbeats, status; no task-level progress visibility |
| T-2 Override Accessibility | PARTIAL | Kill switch in KillSwitchPanel.tsx; not ≤2 clicks from all pages |
| T-3 Autonomy Fit | PASS | Paper trading default; live requires explicit admin action |
| T-4 High-Risk Action Clarity | PARTIAL | Trade execution requires meta-decision veto; no explicit user confirmation UX |
| T-5 Error and Recovery Honesty | PARTIAL | Error boundaries exist; no specific recovery guidance in error states |
| T-6 Operational Trust Discipline | N/A | Not in production |
| T-7 Consequence Classification | FAIL | No consequence classification system for trading actions |

## Resilience Review Snapshot

| Resilience Gate | Result | Evidence |
|----------------|--------|----------|
| R-1 Confidence Thresholds | FAIL | No confidence thresholds on trading signals or AI output |
| R-2 Degradation Testing | FAIL | No degradation test suite |
| R-3 Friction Telemetry | FAIL | No friction telemetry |
| R-4 Flow SLOs | FAIL | No flow SLOs defined |
| R-5 Feedback Discipline | FAIL | No structured feedback loop |
| R-6 Business-Context Alignment | FAIL | No review cadence or materiality assessment |

---

## Composite Score: 71/100

| # | Dimension | Weight | Score | Prior | Delta | Weighted | Min | Gap? |
|---|-----------|--------|-------|-------|-------|----------|-----|------|
| 1 | Architecture | 5% | 8 | 8 | 0 | 0.40 | — | — |
| 2 | Auth & Identity | 7% | 7 | 7 | 0 | 0.49 | 7 | — |
| 3 | Row-Level Security | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 4 | API Surface Quality | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 5 | Data Layer | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 6 | Frontend Quality | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 7 | Testing & QA | 8% | 8 | 8 | 0 | 0.64 | 7 | — |
| 8 | Security Posture | 8% | **7** | 8 | **-1** | 0.56 | **8** | **YES** |
| 9 | Observability | 7% | 8 | 8 | 0 | 0.56 | 7 | — |
| 10 | CI/CD | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 11 | Documentation | 1% | 7 | 7 | 0 | 0.07 | — | — |
| 12 | Domain Capability | 8% | 7 | 7 | 0 | 0.56 | 7 | — |
| 13 | AI/ML Capability | 6% | 7 | 7 | 0 | 0.42 | — | — |
| 14 | Connectivity | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 15 | Agentic UI/UX | 2% | **6** | 5 | **+1** | 0.12 | — | — |
| 16 | UX Quality | 2% | 6 | 6 | 0 | 0.12 | — | — |
| 17 | User Journey | 1% | 5 | 5 | 0 | 0.05 | — | — |
| 18 | Zero Trust | 5% | 7 | 7 | 0 | 0.35 | — | — |
| 19 | Enterprise Security | 7% | 8 | 8 | 0 | 0.56 | 7 | — |
| 20 | Operational Readiness | 0% | **5** | 4 | **+1** | 0.00 | — | — |
| 21 | Agentic Workspace | 2% | **7** | 6 | **+1** | 0.14 | — | — |
| | **TOTAL** | **100%** | | | | **7.14** | | |

**Weighted Composite: 7.14 x 10 = 71.4 => 71/100**

**Score change: 72 => 71 (-1)**

**Archetype minimum gaps: 1**
- D8 Security Posture: 7 (minimum 8) — NEW gap from v2.14 supply chain requirements

---

## Dimension Details

### Dimension 1: Architecture Integrity — 8/10 (unchanged)

**Weight: 5%**

Architecture matches documented design. FastAPI backend with ordered lifespan management (DB -> market data -> FreqTrade -> risk engines -> arbitrage). 14 API routers, 45+ services, 10 agents, 4 exchange adapters. All services wired in `main.py`. Error handlers registered centrally (`core/error_handlers.py`).

**New since S4:** Control-plane adapters added (`backend/app/control_plane/`) with authority boundary mapping, risk policy engine, and evidence adapter. Optional dependency on `akiva-execution-contracts` and `akiva-policy-runtime`.

**What caps at 8:** No backend type-checking (mypy/pyright) in CI. Single baseline migration reduces schema auditability. No circular dependency detection tooling.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No mypy/pyright enforcement in CI | Agent |
| 2 | LOW | Migration history reset to single baseline | Agent |
| 3 | INFO | Control-plane adapters are opt-in, not wired by default | Agent |

---

### Dimension 2: Auth & Identity — 7/10 (unchanged)

**Weight: 7% | Minimum: 7 | AT MINIMUM**

Centralized middleware-based auth in `main.py`. All `/api/v1` routes depend on `get_current_user()`. JWT verified via Supabase `auth.get_user()`, then role fetched from `user_roles` with priority hierarchy (admin > cio > trader > ops > research > auditor > viewer). Rate limiting: 10/min auth, 30/min trading, 100/min read (slowapi, memory backend).

**MFA:** Functional TOTP enrollment UI (`src/components/settings/MfaSettings.tsx`) using Supabase `auth.mfa.enroll()`. Includes QR code display, verification, recovery codes, disable dialog. MFA enforcement at API level requires Supabase project configuration (CONDITIONAL on human action).

**What caps at 7:** Rate limiter uses `memory://` (not Redis — dev-only comment in code). No MFA enforcement policy configured. No `@require_role()` decorators on individual endpoints (middleware-only).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | MFA enforcement not configured in Supabase | Human |
| 2 | MEDIUM | Rate limiter uses in-memory storage, not Redis | Human (production config) |
| 3 | LOW | No per-endpoint role decorators | Agent |

---

### Dimension 3: Row-Level Security — 7/10 (unchanged)

**Weight: 5%**

Multi-tenant isolation via `book_id` + `current_tenant_id()` SQL function. ADR-002 documents 212 RLS policies across 16+ tables. `audit_events` table is INSERT-only (immutable by design). API key encryption via pgcrypto AES-256 with SECURITY DEFINER functions. Service role key restricted to backend operations.

**What caps at 7:** Migration history reset to single baseline file (3 lines). Cannot locally verify the 212 RLS policies — they exist in Supabase remote database but not in version-controlled SQL. No automated cross-tenant denial tests found. No AI-layer isolation tests.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | Migration history not version-controlled | Agent (restore) |
| 2 | MEDIUM | No cross-tenant denial tests | Agent |
| 3 | MEDIUM | AI-layer isolation not verified | Agent |

---

### Dimension 4: API Surface Quality — 7/10 (unchanged)

**Weight: 5%**

All endpoints under `/api/v1/` prefix. 14 sub-routers + health. Standardized error handling via `error_handlers.py` with `ErrorResponse(error, code, details)`. Pydantic validation on all request bodies. 10MB request size limit. XSS/SQL injection detection in query strings. Health probes: `/health` (liveness), `/ready` (readiness), `/metrics` (JSON + Prometheus).

**What caps at 7:** No OpenAPI spec validation in CI. WebSocket auth unclear (separate `ws_router` path). Pagination not consistently implemented. No API versioning strategy for v2.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No OpenAPI spec generation/validation in CI | Agent |
| 2 | LOW | WebSocket auth flow undocumented | Agent |

---

### Dimension 5: Data Layer Integrity — 7/10 (unchanged)

**Weight: 5%**

64 tables in Supabase with RLS. Circuit breaker triggers in database (migration `20260220042730` — applied remotely). Immutable audit trail (INSERT-only). Agent state written to Supabase via heartbeats.

**Archetype 7 state durability:** Requires T2 for agent state, T3 for workflow/user data. Agent heartbeats go to Supabase (T2+). User data in Supabase (T3). Workflow state: trade executions in Supabase (T3). BUT: in-memory agent state (current positions, signal cache) is T0 — lost on restart. No explicit durability tier documentation.

**What caps at 7:** Migration reset impairs verification. No backup/recovery SLA documentation. In-memory agent state gaps for T2 requirement. No disaster recovery testing.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | Agent in-memory state not persisted at T2 | Agent |
| 2 | MEDIUM | No backup/recovery RTO/RPO documentation | Human |
| 3 | MEDIUM | Migration history not locally auditable | Agent |

---

### Dimension 6: Frontend Quality — 7/10 (unchanged)

**Weight: 5%**

Build clean (0 lint errors, 0 type errors). ErrorBoundary component wraps entire app (`src/components/ErrorBoundary.tsx`). PageLoader + Suspense for loading states. shadcn/ui + Tailwind CSS with design tokens (HSL CSS variables). 22 pages with ProtectedRoute wrapper.

**Frontend testing significantly improved:** 18 test files with 284 passing tests (up from 6 files / ~18 active tests at CODEBASE_MAP creation). Tests cover KillSwitchPanel, AdvancedRiskDashboard, TradeTicket, PositionManagement, hooks (positions, alerts, strategies, dashboard metrics, system health), schemas, and utility libraries.

**What caps at 7:** ARIA coverage sparse (~58 attributes across 162 components). No keyboard navigation testing. No visual regression testing. Page-level AP-1 through AP-7 sweep not executed (required for scores >7 per audit template).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | Accessibility ARIA coverage sparse | Agent |
| 2 | MEDIUM | Page-level coverage sweep not executed | Agent |
| 3 | LOW | No visual regression testing | Agent |

---

### Dimension 7: Testing & QA — 8/10 (unchanged, strengthened)

**Weight: 8% | Minimum: 7 | ABOVE MINIMUM**

**Backend:** 1243 tests, 64% coverage. 69 test files covering risk engine, arbitrage, backtesting, capital allocation, compliance reporting, enterprise features, order gateway, signal engine, technical analysis, health metrics, agent identity, control plane, and more. CI enforces `--cov-fail-under=60` (note: S4 audit claimed 64%, but current CI has 60).

**Frontend:** 284 tests in 18 files (significant improvement from S4 era). Coverage includes components (KillSwitchPanel, AdvancedRiskDashboard, TradeTicket, RiskGauge, PositionManagement), hooks (5 hooks tested), libraries (schemas, trading gate, instrument parser, compliance enforcement, status colors, user modes, trading modes).

**E2E:** 4 Playwright specs (kill-switch, position-management, risk-dashboard, trade-flow). Separate `e2e.yml` workflow.

**CI enforcement:** Matrix testing (Python 3.11 + 3.12), coverage artifacts published, `--max-warnings=0` ESLint, bandit, pip-audit (--strict), npm audit (--audit-level=high).

**What caps at 8:** No mutation testing. Frontend coverage still thin relative to 285 source files (18 test files / 285 sources = 6%). No database-level test fixtures. No contract/CDC tests. Coverage CI floor is 60% (not 64 as S4 claimed).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | LOW | CI coverage floor is 60%, not 64% as S4 audit stated | Agent |
| 2 | LOW | No mutation testing | Agent |
| 3 | INFO | Frontend test ratio thin (18/285 files) | Agent |

---

### Dimension 8: Security Posture — 7/10 (DOWN from 8) **BELOW MINIMUM**

**Weight: 8% | Minimum: 8 | BELOW MINIMUM**

**Existing strengths (would justify 8-9):**
- No hardcoded secrets in source
- SecurityHeadersMiddleware: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- RequestValidationMiddleware: 10MB body limit, XSS/SQL injection detection
- SECURITY.md exists (missing Supported Versions table per Repository Controls §1.1)
- CI scanning: bandit (backend), pip-audit --strict (backend), npm audit --audit-level=high (frontend)
- Rate limiting on all endpoint categories
- Dependabot enabled for pip, npm, GitHub Actions
- CVE-2026-34073 fixed (cryptography 46.0.5 -> 46.0.6)

**New v2.14 gaps (Repository Controls v1.3):**
- **No SBOM generation** (§8, Required for Archetype 7): No CycloneDX/Syft in CI pipeline. Dim 8 reduced by 1.
- **No container image scanning** (§9, Required for all container deployers): No Trivy/Grype/Snyk in CI. Dim 8 reduced by 1.
- **Signed commits not enforced** (§10, Required for Archetype 7): No GPG/SSH signing, no branch protection enforcement. Scoring impact noted for Archetype 10 but Archetype 7 also lists it as Required.
- Docker runs as root (no `USER` directive in Dockerfile)
- SECURITY.md missing Supported Versions table

**Score calculation:** Base 9 (excellent security practice) -1 (no SBOM) -1 (no container scanning) = **7**.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | **CRITICAL** | No SBOM generation in CI (Archetype 7 Required) | Agent |
| 2 | **CRITICAL** | No container image scanning in CI | Agent |
| 3 | HIGH | Docker runs as root (no USER directive) | Agent |
| 4 | HIGH | Signed commits not enforced | Human (GPG key setup) |
| 5 | MEDIUM | SECURITY.md missing Supported Versions table | Agent |

---

### Dimension 9: Observability — 8/10 (unchanged)

**Weight: 7% | Minimum: 7 | ABOVE MINIMUM**

Structured logging via structlog with JSON output. Request tracing via X-Request-ID correlation in middleware. Sentry error tracking with FastAPI/Starlette integrations (`core/observability.py`). OpenTelemetry tracing integration with OTLP exporter support. Health metrics with Prometheus export (`/metrics/prometheus`). Agent heartbeat monitoring with 90-second stale threshold.

**What caps at 8:** OpenTelemetry and Sentry require environment configuration (OTEL_EXPORTER_OTLP_ENDPOINT, SENTRY_DSN) — CONDITIONAL on deployment. No Operational Standard v1.4 §10 data retention enforcement. No log aggregation in place.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No data retention policy enforcement | Agent + Human |
| 2 | LOW | OTEL/Sentry conditional on env vars | Human (deployment) |

---

### Dimension 10: CI/CD — 7/10 (unchanged)

**Weight: 5%**

CI workflows: `ci.yml` (frontend + backend), `e2e.yml` (Playwright), `deploy.yml` (staging placeholder), `radar-healing.yml` (RADAR CI diagnosis). Python matrix testing (3.11 + 3.12). Coverage artifacts published for both frontend and backend. TypeCheck correctly uses `tsc -p tsconfig.app.json --noEmit`.

**What caps at 7:** Deploy stage is a placeholder (echo statements only). No aggregator job for branch protection. No branch protection enforcement verified. No SBOM in release pipeline. Repository Controls v1.3: Dim 10 capped at 7 if no vulnerability-to-component mapping.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | Deploy pipeline is placeholder | Human (infrastructure) |
| 2 | MEDIUM | No aggregator job | Agent |
| 3 | MEDIUM | Branch protection not verified | Human |

---

### Dimension 11: Documentation — 7/10 (unchanged)

**Weight: 1%**

45+ documentation files. CODEBASE_MAP.md exists. API_REFERENCE.md, ARCHITECTURE.md, MULTI_AGENT_COORDINATION.md, REGULATORY_COMPLIANCE_DOCUMENTATION.md, INCIDENT_RESPONSE_RUNBOOK.md, DEPLOYMENT_GUIDE.md, CHANGE_LOG.md, ONBOARDING.md, SECURITY_AUDIT_REPORT.md.

**What caps at 7:** No documentation build validation in CI (Repository Controls v1.3: Dim 11 capped at 7 without doc build validation). No auto-generated API docs from OpenAPI spec. CODEBASE_MAP.md is stale (reports 29 test files, actual is 69; reports 6 frontend test files, actual is 18).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | CODEBASE_MAP.md is stale (test file counts wrong) | Agent |
| 2 | LOW | No doc build validation in CI | Agent |

---

### Dimension 12: Domain Capability — 7/10 (unchanged)

**Weight: 8% | Minimum: 7 | AT MINIMUM**

**WORKING capabilities:**
- Risk engine: VaR (historical, parametric, Monte Carlo), portfolio optimization, stress testing (94% coverage on risk_engine.py)
- Smart order router: multi-venue scoring, TWAP/VWAP/POV/Iceberg (100% coverage)
- Backtesting: institutional backtester (96%), walk-forward engine (96%)
- Technical analysis: RSI, MACD, Bollinger Bands, ATR, VWAP (94% coverage)
- Kill switch: circuit breakers at database level + API + UI
- RBAC: 6 roles, 25 permissions, trade size limits

**PARTIAL capabilities:**
- Exchange adapters: Paper mode WORKING with simulated fills. Live mode code exists (Coinbase, Kraken, MEXC have real API integration with HMAC auth, httpx clients) but UNVERIFIED without API keys. DEX adapter more scaffolded.
- Arbitrage engines: logic real, venue data mocked
- ML signals: signal engine working (64%), regime detection partial (30%)

**Archetype 7 Required: "3+ exchanges working, not stubs"** — Adapters have dual-mode design (paper + live). Paper mode is WORKING. Live mode is UNVERIFIED (needs exchange testnet keys, human action).

**What caps at 7:** Exchange live paths UNVERIFIED. ML models not deployed. No trained model serving. Control-plane adapters are opt-in.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | Exchange live paths unverified (testnet API keys needed) | Human |
| 2 | MEDIUM | ML models not deployed | Human |
| 3 | LOW | Control-plane adapters opt-in, not default | Agent |

---

### Dimension 13: AI/ML Capability — 7/10 (unchanged)

**Weight: 6%**

Enhanced signal engine with composite signal generation (64% coverage). Technical analysis suite (94% coverage). Regime detection service (30%, partial). Edge functions: `trading-copilot` and `ai-trading-copilot` exist but not integrated into frontend UI.

**Agent behavior versioning:** `AGENT_BEHAVIOR_VERSION = "1.0.0"` with prompt hash, tool list, model identifier tracking. Agent drift metrics (override_count, fallback_count, approval_rate).

**New standard gaps (v2.14):**
- No AI Service Standard v1.5 streaming surface declaration
- No AI Resilience Standard v1.3 gates (R-1 through R-6 all FAIL)
- No financial AI risk tier classification (AI Governance & Ethics Standard v1.1)
- No LLM Gateway circuit breakers or cost tracking
- No confidence thresholds on trading signals
- No bias/fairness testing for financial AI

**What caps at 7:** AI copilot not integrated into UI. ML models not deployed. No resilience gates. No bias testing. No streaming surface declaration.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | All 6 AI Resilience gates FAIL | Agent (R-1, R-2, R-5) + Human (R-3, R-4, R-6) |
| 2 | HIGH | No financial AI risk classification | Agent |
| 3 | MEDIUM | AI copilot edge functions not integrated into UI | Agent |
| 4 | MEDIUM | No LLM Gateway circuit breakers | Agent |

---

### Dimension 14: Connectivity — 7/10 (unchanged)

**Weight: 5%**

38 Deno edge functions covering trading, arbitrage, intelligence, signals, risk/ops, integrations (TradingView webhook, Telegram alerts, external signals, Token Metrics), AI, exchange management, audit. Redis pub/sub for agent communication with 10 defined channels.

**What caps at 7:** No webhook reliability patterns (retry with backoff, dead letter queue). No MCP server. No formal Integration & Webhook Standard v1.1 compliance (no webhook signature verification, no delivery guarantees).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No webhook reliability patterns (retry, DLQ) | Agent |
| 2 | LOW | No MCP server | Agent |

---

### Dimension 15: Agentic UI/UX — 6/10 (UP from 5)

**Weight: 2%**

Agent registry dashboard (`src/pages/Agents.tsx`) with live agent status, heartbeat monitoring, CPU/memory metrics, capability tags. Agent decision panel (`AgentDecisionPanel.tsx`) shows 5 canonical agents with roles, status, last decision with reason. Kill switch accessible via KillSwitchPanel in risk pages.

**What improved:** Agent registry UI now shows detailed per-agent heartbeat timing, online/degraded/offline status, decision timeline. This is substantively better than "basic agent status" at S4.

**What caps at 6:** No AI suggestion labeling. Kill switch not ≤2 clicks from all pages. No persona-specific onboarding for agent views. Heartbeat display is raw timestamp, not user-friendly visual.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No AI suggestion labeling | Agent |
| 2 | LOW | Kill switch not globally accessible (≤2 clicks) | Agent |

---

### Dimension 16: UX Quality — 6/10 (unchanged)

**Weight: 2%**

Design tokens via Tailwind HSL CSS variables (tailwind.config.ts). Typography: Inter (sans) + JetBrains Mono (mono). Animations defined: slide-in-right, fade-in, pulse-glow. Dark trading theme consistent.

**What caps at 6:** UI/UX Standard v1.8 §§17-21 not addressed (Typography hierarchy, Microcopy audit, Animation budgets, Touch targets, Hydration verification). Mobile untested. Accessibility gaps (sparse ARIA coverage). Page-level sweep not executed.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | v1.8 §§17-21 new sections not addressed | Agent |
| 2 | LOW | Mobile UX untested | Human |

---

### Dimension 17: User Journey — 5/10 (unchanged)

**Weight: 1%**

RoleGate.tsx implements persona-based access control (AdminOnly, CIOOnly, TraderOnly, OpsOnly, etc.). 22 pages covering different user workflows. Settings page with profile, MFA, notifications, theme.

**What caps at 5:** No onboarding wizard (users land on complex dashboard cold). No trading preferences UI (risk tolerance, strategy selection, asset whitelist). No model selection dialog. Same navigation for all roles (no persona filtering). User Personalization Standard v1.3 not addressed.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No onboarding wizard | Agent |
| 2 | MEDIUM | No trading preferences UI | Agent |

---

### Dimension 18: Zero Trust — 7/10 (unchanged)

**Weight: 5%**

Per-agent HMAC identity (`core/agent_identity.py`): each agent gets derived secret from master key, signs messages with timestamp + payload hash, 5-minute max message age. JWT validation at API boundary. CORS hardened (explicit origins, no wildcard). RequestValidationMiddleware with SQL injection / XSS detection.

**What caps at 7:** No mTLS between services. Rate limiting IP-based (not per-user). Input validation limited to query params for XSS/SQL (request body relies on Pydantic). No request signing for user API calls (only agent-to-agent).

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | MEDIUM | No mTLS | Human |
| 2 | LOW | Rate limiting not per-user | Agent |

---

### Dimension 19: Enterprise Security — 8/10 (unchanged)

**Weight: 7% | Minimum: 7 | ABOVE MINIMUM**

**RBAC:** 6 roles with hierarchical permissions (`enterprise/rbac.py`). 12+ permission categories. Max trade size and daily volume per role (trader: $10k/$100k, CIO: $1M/$10M). Enforced at execution.

**Audit trail:** AuditLogger with 10 event categories, 5 severity levels, async buffer flushing (`enterprise/audit.py`). Events include: event_id, timestamp, category, severity, action, user_id, resource_type, details, ip_address, user_agent.

**Compliance:** ComplianceReportGenerator produces structured reports for SEC/CPO-PQR filing prep. Rule engine with position limits, asset restrictions, jurisdiction checks, time restrictions, concentration limits.

**Agent governance:** Agent behavior versioning with drift metrics (override_count, fallback_count, approval_rate). Agent identity with HMAC signing.

**What caps at 8:** Audit logger uses in-memory buffer (not write-once guarantee). No formal change classification or CAB process (Change Management Standard v1.0). No immutable change log. SOC 2 Type II, SOX, ISO 27001 all Required for Archetype 7 but none pursued. These are organizational certifications requiring human action.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | SOC 2 / SOX / ISO 27001 not pursued (all Required for Archetype 7) | Human |
| 2 | MEDIUM | No change classification system | Agent |
| 3 | MEDIUM | Audit log buffer is not write-once | Agent |

---

### Dimension 20: Operational Readiness — 5/10 (UP from 4)

**Weight: 0%**

Docker compose with 3 services (api, agents, redis). Health checks on api container (`/health` every 30s). Redis ping every 10s. Restart policies configured. Prometheus metrics export at `/metrics/prometheus` with 15+ metrics. Multiple compose variants (base, staging, trading/FreqTrade). Deployment scripts exist (`scripts/deploy.sh`).

**What improved:** Agent heartbeat monitoring added. Prometheus metrics export. Health probe structure (liveness + readiness + metrics) is production-ready.

**What caps at 5:** Deploy pipeline in CI is placeholder (echo statements). No alerting system. Agents container lacks health check. No log aggregation. No blue/green or canary deployment. No backup/recovery procedures. No data retention enforcement. Operational Standard v1.4 §8 (compliance ops) and §10 (data retention) not met.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | No production deployment pipeline | Human |
| 2 | MEDIUM | No alerting rules | Agent |
| 3 | MEDIUM | No data retention policy | Human |

---

### Dimension 21: Agentic Workspace — 7/10 (UP from 6)

**Weight: 2%**

7 agents extending BaseAgent (MetaDecision, Risk, Signal, Execution, CapitalAllocation, Arbitrage, FreqTradeSignal) + orchestrator. Redis pub/sub with 10 channels. Heartbeats written to Supabase. Auto-restart up to 5 times on crash. Strategy lifecycle management (ACTIVE -> QUARANTINED -> DISABLED based on performance thresholds).

**Control-plane adapters (NEW):** Authority boundary mapping for each agent type (meta-decision: FULL_ACCESS + REQUIRE_APPROVAL, signal: READ_ONLY, execution: WORKSPACE_WRITE). Risk policy engine with VaR, position limit, and daily loss policies. Evidence adapter for compliance evidence collection.

**Archetype 7 recovery modes:**
- Checkpoint resume: PARTIAL (strategy state tracked, not granular task state)
- Full retry: YES (auto-restart on crash, max 5)
- Graceful abort: YES (CONTROL channel available)
- Compensating rollback: **NO** (no rollback handlers for executed trades)

**What improved:** Control-plane adapters, strategy lifecycle, improved heartbeat monitoring.

**What caps at 7:** Missing compensating rollback (CRITICAL for Archetype 7 financial operations). No dynamic agent registration at runtime. No persistent workflow queue. No explicit state durability tier documentation. Control-plane is opt-in.

| # | Severity | Finding | Fixable By |
|---|----------|---------|------------|
| 1 | HIGH | No compensating rollback for trade execution | Agent |
| 2 | MEDIUM | No dynamic agent registration at runtime | Agent |
| 3 | MEDIUM | No persistent workflow step queue | Agent |

---

## Top 3 Gaps (Ranked by Score Impact)

### 1. D8 Security Posture: Supply Chain Security (CRITICAL — below minimum)

**Impact:** D8 drops from 8 to 7, below Archetype 7 minimum of 8. New archetype minimum gap.

**Root cause:** Repository Controls v1.3 (published 2026-03-27, after prior audit) requires SBOM generation and container image scanning for all systems, with enhanced requirements for Archetype 7.

**Fix (Agent-fixable):**
1. Add CycloneDX SBOM generation to CI (`syft` or `cyclonedx-bom`)
2. Add Trivy container image scanning after Docker build step
3. Add `USER` directive to Dockerfile (run as non-root)
4. Add Supported Versions table to SECURITY.md

**Estimated score impact:** D8 7 -> 8 (+0.08 weighted = +0.8 composite)

### 2. D12 Domain Capability: Exchange Live Paths (HIGH — at minimum)

**Impact:** D12 held at 7 (at minimum). Live exchange paths are UNVERIFIED.

**Root cause:** Exchange adapters have real API integration code (Coinbase, Kraken, MEXC with HMAC auth, httpx) but run in paper mode by default. Live mode requires testnet API keys (human action).

**Fix (Human-only):** Configure testnet API keys for Coinbase, Kraken, and MEXC. Verify live path connectivity and order placement. Document paper vs live mode operational procedures.

**Estimated score impact:** D12 7 -> 8 (+0.08 weighted = +0.8 composite)

### 3. D13 AI/ML: Resilience Gates & Governance (HIGH — compliance gap)

**Impact:** All 6 AI Resilience gates FAIL. No financial AI risk classification. AI copilot not integrated.

**Root cause:** AI Resilience Standard v1.3 and AI Governance & Ethics Standard v1.1 are new requirements not previously assessed. The system has signal generation and agent drift metrics but no formal resilience or governance framework.

**Fix (Mixed):**
- Agent: Add confidence thresholds to signal engine (R-1), add degradation tests (R-2), add financial AI risk tier to agent configs
- Human: Define flow SLOs (R-4), establish review cadence (R-6), conduct bias/fairness assessment

**Estimated score impact:** D13 7 -> 8 (+0.06 weighted = +0.6 composite)

---

## Path to 75/100

Current: 71/100. Need: +4 composite points (+0.4 weighted).

### Agent-Fixable (Sprint S5)

| Action | Dimension | Score Change | Weighted Gain |
|--------|-----------|-------------|---------------|
| Add SBOM + container scanning to CI | D8 | 7 -> 8 | +0.08 |
| Add Dockerfile USER directive | D8 | (part of above) | (included) |
| Add compensating rollback handlers | D21 | 7 -> 8 | +0.02 |
| Add AI confidence thresholds + risk classification | D13 | 7 -> 8 | +0.06 |
| Add onboarding wizard + suggestion labels | D15, D17 | 6->7, 5->6 | +0.03 |
| Update CODEBASE_MAP.md | D11 | — | — |
| **Agent-fixable total** | | | **+0.19 (~73)** |

### Human-Only (Required for 75+)

| Action | Dimension | Score Change | Weighted Gain |
|--------|-----------|-------------|---------------|
| Configure testnet exchange API keys | D12 | 7 -> 8 | +0.08 |
| Enable MFA enforcement in Supabase | D2 | 7 -> 8 | +0.07 |
| Configure Redis rate limiter in production | D2 | (part of above) | (included) |
| Set up signed commits (GPG keys) | D8 | (included in D8 above) | (included) |
| Deploy ML model for signals | D13 | (part of above) | (included) |
| **Human total** | | | **+0.15 (~75)** |

**Combined path: 71 + 1.9 + 1.5 = ~74-75**

---

## Human-Only Blockers

1. **Exchange testnet API keys** — configure Coinbase/Kraken/MEXC testnet credentials and verify live paths
2. **MFA enforcement** — enable MFA requirement for admin/CIO roles in Supabase project settings
3. **GPG signing** — set up GPG keys and branch protection rules for signed commits
4. **SOC 2 / SOX / ISO 27001** — initiate organizational certification processes (Required for Archetype 7)
5. **Production deployment** — set up actual deployment infrastructure (currently placeholder)
6. **Penetration testing** — conduct pen test on trading APIs and risk controls
7. **ML model deployment** — train and deploy production models for signal generation
8. **Redis rate limiter** — configure Redis backend for rate limiting in production

---

## New Since Prior Audit (S4, 2026-03-17)

### Code Changes

| Change | Impact |
|--------|--------|
| Control-plane adapters added (`control_plane/`) | D1, D21 improvement |
| CVE-2026-34073 fixed (cryptography upgrade) | D8 maintenance |
| ErrorBoundary component added | D6 improvement (already factored) |
| onAuthStateChange deadlock fix | D2 bug fix |
| Frontend tests expanded: 6 -> 18 files, ~18 -> 284 tests | D7 strengthened |
| Backend tests expanded: 32 -> 69 files, 1206 -> 1243 tests | D7 strengthened |
| Migration history reset to baseline | D3, D5 verification impaired |
| TypeCheck CI fix: now uses `tsc -p tsconfig.app.json` | D10 improvement (already at 7) |

### Standards Changes

| Standard | Version Change | New Requirement | Impact |
|----------|---------------|-----------------|--------|
| Repository Controls | v1.2 -> v1.3 | SBOM, container scanning, signed commits | D8 -1 (new gap) |
| AI Resilience Standard | v1.2 -> v1.3 | §7 bias/fairness for financial AI | D13 gap noted |
| AI Service Standard | v1.4 -> v1.5 | Streaming surface declaration | D13 gap noted |
| UI/UX Standard | v1.7 -> v1.8 | §§17-21 (5 new sections) | D16 gap noted |
| Sprint Execution Protocol | v3.0 -> v3.4 | SA-11, SA-12, SA-13 | Governance gap noted |
| Build Standard | v2.13 -> v2.14 | Control-plane maturity rubric | D1 assessed (PARTIAL) |

---

*Audited under Akiva Build Standard v2.14, Archetype 7 (Algorithmic Trading Platform).*
*Template version: 2.6. Previous audit: 2026-03-17 (post-S4, 72/100).*
*Verification: Backend 1243 passed / 64% coverage; Frontend 284 passed; ESLint clean; TypeCheck clean.*
*Standards baseline: 31 standards evaluated per v2.14 checklist.*
