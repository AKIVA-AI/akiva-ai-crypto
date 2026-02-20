# AKIVA AI Crypto

> **Open-source, institutional-grade crypto trading platform** — enterprise risk management, multi-exchange execution, and real-time monitoring built on Supabase + React.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen.svg)](.github/workflows/ci.yml)
[![Paper Trading](https://img.shields.io/badge/Default-Paper%20Mode-yellow.svg)](#safety-first)

---

## Why This Exists

Most crypto trading tools are either:
- **Too simple** — no risk controls, no audit trail, no multi-exchange support
- **Too expensive** — institutional platforms cost $50k+/year
- **Black boxes** — you can't see why trades were blocked or executed

AKIVA bridges this gap: **institutional-grade controls, open-source transparency, zero cost.**

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  Dashboard · Trade · Risk · Arbitrage · Analytics        │
├─────────────────────────────────────────────────────────┤
│                 Supabase Edge Functions                   │
│  live-trading · market-data · kill-switch · alerts        │
│  binance-us · coinbase · kraken · cross-exchange-arb     │
├─────────────────────────────────────────────────────────┤
│                   Supabase (Postgres)                     │
│  RLS Policies · Circuit Breakers · Audit Triggers         │
│  pg_cron Scheduling · pgcrypto Key Encryption            │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Fail-closed** | If any safety check fails, trading halts — never fails open |
| **Paper mode default** | `paper_trading_mode = true` on fresh install |
| **Database-level risk** | Circuit breakers are Postgres triggers — can't be bypassed by app bugs |
| **RLS everywhere** | Every table has Row-Level Security; roles enforced at DB layer |
| **Edge function auth** | JWT validation + rate limiting on all trading endpoints |

## Features

### Risk Management (Automated)
- **Kill Switch** — emergency halt all trading, one click
- **Circuit Breakers** — auto-freeze books when daily loss exceeds limits
- **Reduce-Only Mode** — 80% loss threshold triggers position-only-close mode
- **Position Limits** — max leverage, concentration, and exposure checks
- **Strategy Lifecycle** — quarantine, cooldown, and disable states

### Multi-Exchange Trading
- **Binance.US** — spot trading with full order book
- **Coinbase** — Advanced Trade API integration
- **Kraken** — spot trading with signed requests
- **Cross-Exchange Arbitrage** — automated spread detection
- **Retry Logic** — exponential backoff (3 attempts) on venue failures

### Intelligence & Signals
- **Market Pulse** — real-time sentiment and momentum indicators
- **Signal Scoring** — multi-factor composite scoring
- **Whale Alerts** — large transaction monitoring
- **Funding Rate Arbitrage** — perp vs spot spread detection
- **Macro Indicators** — FRED data integration

### Operations
- **Full Audit Trail** — every state change logged with before/after
- **RBAC** — admin, CIO, trader, ops, research, auditor, viewer roles
- **Telegram Alerts** — real-time notifications for critical events
- **CRON Monitoring** — automated health checks every 2 minutes
- **Decision Traces** — see exactly why each trade was blocked or executed

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- A [Supabase](https://supabase.com/) project (free tier works)
- Exchange API keys (optional — paper mode works without them)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_ORG/akiva-ai-crypto.git
cd akiva-ai-crypto
bun install
```

### 2. Configure Supabase

```bash
# Copy environment template
cp .env.example .env

# Edit with your Supabase credentials
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key
```

Update `supabase/config.toml` with your project ID:
```toml
project_id = "your-supabase-project-id"
```

### 3. Run Migrations

Apply the database schema via the Supabase dashboard SQL editor or CLI:
```bash
# Using Supabase CLI
supabase db push
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy --project-ref your-project-id
```

### 5. Start the Frontend

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign up to create your first account.

### 6. (Optional) Add Exchange Keys

Add API keys as Supabase secrets via the dashboard:
- `BINANCE_US_API_KEY` / `BINANCE_US_API_SECRET`
- `COINBASE_API_KEY` / `COINBASE_API_SECRET`
- `KRAKEN_API_KEY` / `KRAKEN_API_SECRET`
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`

## Safety First

⚠️ **This platform defaults to paper trading mode.** Live trading requires:

1. Explicitly setting `paper_trading_mode = false` in `global_settings`
2. Configuring exchange API keys with trade permissions
3. An admin-role user to disable paper mode

**Never skip the paper validation period.** Run for at least 1 week in paper mode before considering live trading.

## Project Structure

```
akiva-ai-crypto/
├── src/                          # React frontend
│   ├── components/               # UI components (shadcn/ui + custom)
│   │   ├── dashboard/            # Control center widgets
│   │   ├── trading/              # Order entry, P&L tracking
│   │   ├── intelligence/         # Market signals, scanners
│   │   ├── risk/                 # Risk management panels
│   │   ├── arbitrage/            # Cross-exchange arbitrage
│   │   └── layout/               # Navigation, sidebars
│   ├── hooks/                    # React hooks (metrics, realtime, shortcuts)
│   ├── pages/                    # Route pages
│   └── integrations/supabase/    # Generated Supabase types & client
├── supabase/
│   ├── functions/                # Edge functions (Deno)
│   │   ├── live-trading/         # Order execution with safety checks
│   │   ├── binance-us-trading/   # Binance.US API integration
│   │   ├── coinbase-trading/     # Coinbase Advanced Trade
│   │   ├── kraken-trading/       # Kraken API
│   │   ├── cross-exchange-arbitrage/
│   │   ├── market-data/          # Price feeds
│   │   ├── kill-switch/          # Emergency halt
│   │   ├── scheduled-monitor/    # CRON health checks
│   │   └── _shared/              # Security middleware, CORS, validation
│   ├── migrations/               # Database schema migrations
│   └── config.toml               # Function configuration
├── backend/                      # Python FastAPI (optional, for advanced strategies)
├── docs/                         # Architecture, guides, runbooks
├── .github/workflows/            # CI pipeline
└── .env.example                  # Environment template
```

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `books` | Trading books with capital allocation and status |
| `orders` | Order lifecycle (open → filled/cancelled) |
| `positions` | Open/closed positions with P&L tracking |
| `fills` | Execution records with fees and slippage |
| `strategies` | Strategy definitions with lifecycle states |
| `risk_limits` | Per-book risk constraints |
| `circuit_breaker_events` | Automated halt records |
| `audit_events` | Full state-change audit trail |
| `global_settings` | Kill switch, paper mode, system toggles |
| `user_roles` | RBAC role assignments |
| `alerts` | System and trading alerts |

All tables are protected by Row-Level Security policies.

## Edge Functions

| Function | Auth | Purpose |
|----------|------|---------|
| `live-trading` | JWT + Role | Order placement with safety checks, retry logic |
| `kill-switch` | JWT + Admin | Emergency trading halt |
| `market-data` | Public | Price feeds and market snapshots |
| `binance-us-trading` | Public | Binance.US API proxy |
| `coinbase-trading` | Public | Coinbase Advanced Trade proxy |
| `kraken-trading` | Public | Kraken API proxy |
| `cross-exchange-arbitrage` | Public | Spread detection across venues |
| `scheduled-monitor` | CRON | Automated health checks |
| `send-alert-notification` | Public | Telegram alert delivery |
| `signal-scoring` | Public | Multi-factor signal analysis |
| `funding-arbitrage` | Public | Funding rate arbitrage detection |
| `macro-indicators` | Public | FRED economic data integration |
| `whale-alerts` | Public | Large transaction monitoring |
| `exchange-keys` | JWT | Encrypted API key management |

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

**We welcome:**
- Bug fixes (especially safety-related)
- Documentation improvements
- New exchange integrations (must follow adapter pattern)
- Test coverage improvements
- UI/UX enhancements

**We reject anything that weakens risk controls.**

## Security

See [SECURITY.md](SECURITY.md) for our security policy and vulnerability reporting.

## License

[MIT License](LICENSE) — see the trading disclaimer in the license file.

## Disclaimer

**Trading cryptocurrency involves substantial risk of loss.** This software is provided as-is, without warranty of any kind. The authors are not financial advisors and this platform is not financial advice. Always use paper/dry-run mode first. Never trade with funds you cannot afford to lose.

---

*AKIVA AI — Institutional trading, open source.*
