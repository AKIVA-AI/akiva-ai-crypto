# Crypto Ops Trading Engine

Institutional-grade multi-venue trading system backend.

## Architecture

```
backend/
├── app/
│   ├── main.py              # FastAPI application entry
│   ├── config.py            # Configuration management
│   ├── database.py          # Supabase/Postgres connection
│   ├── models/              # Domain models
│   ├── services/            # Core business logic
│   │   ├── risk_engine.py
│   │   ├── portfolio_engine.py
│   │   ├── oms_execution.py
│   │   ├── reconciliation.py
│   │   ├── market_data.py
│   │   └── meme_venture.py
│   ├── adapters/            # Venue adapters
│   │   ├── base.py
│   │   ├── coinbase_adapter.py
│   │   ├── mexc_adapter.py
│   │   └── dex_adapter.py
│   ├── api/                 # API routes
│   └── utils/               # Helpers
├── tests/
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Set your Supabase credentials
# SUPABASE_URL=your_supabase_url
# SUPABASE_SERVICE_KEY=your_service_role_key

# 3. Run with Docker
docker-compose up -d

# 4. Or run locally
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Paper Trading Mode

By default, the system runs in **paper trading mode**. Set `PAPER_TRADING=false` and provide venue API keys to enable live trading.

## Venue Configuration

```env
# Coinbase
COINBASE_API_KEY=
COINBASE_API_SECRET=
COINBASE_PASSPHRASE=

# MEXC
MEXC_API_KEY=
MEXC_API_SECRET=

# DEX (Ethereum)
DEX_WALLET_PRIVATE_KEY=
DEX_RPC_URL=
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/overview` | GET | Dashboard metrics |
| `/api/books` | GET | List trading books |
| `/api/books/reallocate` | POST | Reallocate capital (Admin/CIO) |
| `/api/strategies` | GET | List strategies |
| `/api/strategies/{id}/toggle` | POST | Toggle strategy status |
| `/api/trading/positions` | GET | Current positions |
| `/api/trading/orders` | GET | Order history |
| `/api/risk/kill-switch` | POST | Emergency halt |
| `/api/venues/health` | GET | Venue connectivity status |
| `/api/meme/projects` | GET/POST | Meme venture projects |
| `/api/audit` | GET | Audit trail |
