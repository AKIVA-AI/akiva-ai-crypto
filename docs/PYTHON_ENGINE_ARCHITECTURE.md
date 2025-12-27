# Python Trading Engine - Architecture & Integration Plan

## Overview

This document outlines the hedge-fund grade Python backend architecture for the CryptoOps trading platform. The Python service acts as the **intelligence and execution core**, providing:

- Real-time market data aggregation via **ccxt** (60+ exchanges)
- Quantitative analysis and signal generation
- Autonomous agent orchestration
- Risk management and portfolio optimization
- Strategy execution and backtesting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                              │
│  ┌───────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ Dashboard │  │ AI Copilot   │  │ Trading UI │  │ Intelligence │ │
│  └─────┬─────┘  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘ │
└────────┼───────────────┼────────────────┼────────────────┼──────────┘
         │               │                │                │
         ▼               ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Edge Functions)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐                 │
│  │ trading-    │  │ market-      │  │ live-       │                 │
│  │ copilot     │  │ intelligence │  │ trading     │                 │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘                 │
└─────────┼───────────────┼──────────────────┼────────────────────────┘
          │               │                  │
          ▼               ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PYTHON ENGINE (FastAPI)                           │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     AGENT ORCHESTRATOR                          ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           ││
│  │  │ Market   │ │ Strategy │ │ Risk     │ │ Execution│           ││
│  │  │ Data     │ │ Agent    │ │ Agent    │ │ Agent    │           ││
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           ││
│  └───────┼────────────┼────────────┼────────────┼──────────────────┘│
│          │            │            │            │                   │
│  ┌───────▼────────────▼────────────▼────────────▼──────────────────┐│
│  │                       SHARED SERVICES                           ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        ││
│  │  │ ccxt     │  │ Quant    │  │ Portfolio│  │ Memory   │        ││
│  │  │ Exchange │  │ Engine   │  │ Analytics│  │ Store    │        ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      DATA SOURCES                               ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           ││
│  │  │ Exchanges│ │ CoinGecko│ │ Glassnode│ │ Santiment│           ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ positions│ │ signals  │ │ agents   │ │ memory   │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Framework

### Agent Types & Capabilities

| Agent | Tools | Autonomy Level | Triggers |
|-------|-------|----------------|----------|
| **Market Data** | ccxt, WebSockets, APIs | Full Auto | Continuous |
| **Strategy** | Technical indicators, ML models | Semi-Auto | Market events, schedules |
| **Risk** | VaR, stress tests, limits | Full Auto | Position changes, thresholds |
| **Execution** | Smart order router, TWAP/VWAP | User-triggered | Trade intents |
| **Intelligence** | Sentiment APIs, on-chain | Full Auto | Scheduled, events |
| **Treasury** | Balance sync, transfers | Semi-Auto | Rebalance triggers |

### Agent Memory System

```python
# backend/app/services/agent_memory.py

from datetime import datetime
from typing import Any, Dict, List
import json

class AgentMemory:
    """Persistent and short-term memory for agents."""
    
    def __init__(self, agent_id: str, supabase_client):
        self.agent_id = agent_id
        self.db = supabase_client
        self.short_term: List[Dict] = []  # Last N observations
        self.context_window = 100
    
    async def remember(self, event_type: str, data: Any):
        """Store observation in memory."""
        entry = {
            "agent_id": self.agent_id,
            "event_type": event_type,
            "data": json.dumps(data),
            "timestamp": datetime.utcnow().isoformat()
        }
        self.short_term.append(entry)
        if len(self.short_term) > self.context_window:
            self.short_term.pop(0)
        
        # Persist to DB
        await self.db.table("agent_memory").insert(entry).execute()
    
    async def recall(self, event_type: str = None, limit: int = 50) -> List[Dict]:
        """Retrieve past observations."""
        query = self.db.table("agent_memory").select("*").eq("agent_id", self.agent_id)
        if event_type:
            query = query.eq("event_type", event_type)
        result = await query.order("timestamp", desc=True).limit(limit).execute()
        return result.data
    
    async def get_context(self) -> str:
        """Build context string for LLM prompts."""
        recent = self.short_term[-20:]
        return "\n".join([
            f"[{e['timestamp']}] {e['event_type']}: {e['data'][:200]}"
            for e in recent
        ])
```

### Agent Configuration

```yaml
# backend/config/agents.yaml

agents:
  market_data:
    enabled: true
    schedule: "continuous"
    exchanges: ["binance", "coinbase", "kraken", "hyperliquid"]
    symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    capabilities:
      - fetch_orderbook
      - fetch_trades
      - fetch_ohlcv
      - calculate_vwap
    
  strategy:
    enabled: true
    schedule: "*/5 * * * *"  # Every 5 minutes
    models:
      - momentum
      - mean_reversion
      - ml_ensemble
    risk_tier: 2
    
  risk:
    enabled: true
    schedule: "continuous"
    limits:
      max_leverage: 3.0
      max_drawdown_daily: 0.05
      max_concentration: 0.25
      var_limit: 0.02
    
  execution:
    enabled: true
    schedule: "on_demand"
    algos:
      - smart_router
      - twap
      - vwap
      - iceberg
    
  intelligence:
    enabled: true
    schedule: "*/15 * * * *"  # Every 15 minutes
    sources:
      - coingecko
      - glassnode
      - santiment
      - twitter
      - reddit
```

---

## Data Sources Integration

### Exchange Data (ccxt)

```python
# backend/app/services/market_data.py

import ccxt.async_support as ccxt
from typing import Dict, List

class MarketDataService:
    def __init__(self):
        self.exchanges: Dict[str, ccxt.Exchange] = {}
        
    async def init_exchanges(self, configs: Dict):
        for name, config in configs.items():
            exchange_class = getattr(ccxt, name)
            self.exchanges[name] = exchange_class({
                'apiKey': config.get('api_key'),
                'secret': config.get('api_secret'),
                'enableRateLimit': True,
                'options': {'defaultType': 'spot'}
            })
    
    async def fetch_ticker(self, symbol: str) -> Dict:
        """Fetch best price across all venues."""
        results = []
        for name, exchange in self.exchanges.items():
            try:
                ticker = await exchange.fetch_ticker(symbol)
                results.append({
                    'venue': name,
                    'bid': ticker['bid'],
                    'ask': ticker['ask'],
                    'last': ticker['last'],
                    'volume': ticker['quoteVolume']
                })
            except Exception as e:
                print(f"Error fetching from {name}: {e}")
        return results
    
    async def fetch_orderbook(self, symbol: str, venue: str, limit: int = 20):
        exchange = self.exchanges.get(venue)
        if not exchange:
            raise ValueError(f"Unknown venue: {venue}")
        return await exchange.fetch_order_book(symbol, limit)
```

### On-Chain Intelligence

```python
# backend/app/services/onchain_intelligence.py

import aiohttp
from typing import Dict, List

class OnChainIntelligence:
    def __init__(self, glassnode_key: str, santiment_key: str):
        self.glassnode_key = glassnode_key
        self.santiment_key = santiment_key
        
    async def get_exchange_flows(self, asset: str = "BTC") -> Dict:
        """Fetch exchange inflow/outflow from Glassnode."""
        async with aiohttp.ClientSession() as session:
            headers = {"x-api-key": self.glassnode_key}
            inflow = await session.get(
                f"https://api.glassnode.com/v1/metrics/transactions/transfers_to_exchanges_count",
                params={"a": asset, "i": "24h"},
                headers=headers
            )
            outflow = await session.get(
                f"https://api.glassnode.com/v1/metrics/transactions/transfers_from_exchanges_count",
                params={"a": asset, "i": "24h"},
                headers=headers
            )
            return {
                "inflow": (await inflow.json())[-1]["v"],
                "outflow": (await outflow.json())[-1]["v"],
                "net": (await outflow.json())[-1]["v"] - (await inflow.json())[-1]["v"]
            }
    
    async def get_whale_activity(self, asset: str = "BTC") -> List:
        """Fetch large transactions."""
        async with aiohttp.ClientSession() as session:
            resp = await session.get(
                f"https://api.glassnode.com/v1/metrics/transactions/transfers_volume_to_exchanges_mean",
                params={"a": asset, "i": "1h"},
                headers={"x-api-key": self.glassnode_key}
            )
            return await resp.json()
```

---

## API Endpoints

### FastAPI Router

```python
# backend/app/api/engine.py

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/api/v1/engine", tags=["Engine"])

class TradeIntent(BaseModel):
    instrument: str
    direction: str  # "long" or "short"
    size_usd: float
    confidence: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None

class AgentCommand(BaseModel):
    agent_type: str
    action: str
    params: Optional[dict] = None

@router.post("/trade-intent")
async def submit_trade_intent(intent: TradeIntent, background_tasks: BackgroundTasks):
    """Submit a trade intent for risk validation and execution."""
    # Validate with risk agent
    risk_decision = await risk_agent.evaluate(intent)
    if not risk_decision.approved:
        raise HTTPException(400, detail=risk_decision.reason)
    
    # Queue for execution
    background_tasks.add_task(execution_agent.execute, intent, risk_decision)
    return {"status": "queued", "intent_id": intent.id}

@router.post("/agent/command")
async def agent_command(cmd: AgentCommand):
    """Send command to an agent."""
    agent = agents.get(cmd.agent_type)
    if not agent:
        raise HTTPException(404, detail=f"Agent not found: {cmd.agent_type}")
    
    result = await agent.handle_command(cmd.action, cmd.params)
    return {"status": "ok", "result": result}

@router.get("/intelligence/summary")
async def get_intelligence_summary():
    """Get aggregated market intelligence."""
    return await intelligence_agent.get_summary()

@router.get("/market-data/prices")
async def get_prices(symbols: List[str]):
    """Get real-time prices across venues."""
    return await market_data_service.fetch_all_tickers(symbols)
```

---

## Deployment

### Docker Compose

```yaml
# docker-compose.yml (updated)

version: '3.8'

services:
  python-engine:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - BINANCE_API_KEY=${BINANCE_API_KEY}
      - BINANCE_API_SECRET=${BINANCE_API_SECRET}
      - COINBASE_API_KEY=${COINBASE_API_KEY}
      - COINBASE_API_SECRET=${COINBASE_API_SECRET}
      - GLASSNODE_API_KEY=${GLASSNODE_API_KEY}
      - SANTIMENT_API_KEY=${SANTIMENT_API_KEY}
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

### Required Environment Variables

```bash
# .env.example (backend)

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Exchange APIs
BINANCE_API_KEY=
BINANCE_API_SECRET=
COINBASE_API_KEY=
COINBASE_API_SECRET=
KRAKEN_API_KEY=
KRAKEN_API_SECRET=

# Intelligence APIs
GLASSNODE_API_KEY=
SANTIMENT_API_KEY=
COINGECKO_API_KEY=
TWITTER_BEARER_TOKEN=

# Agent Config
AGENT_MODE=autonomous  # or "supervised"
RISK_TIER=2
```

---

## Database Schema Extensions

```sql
-- New table for agent memory
CREATE TABLE public.agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now(),
    processed BOOLEAN DEFAULT false
);

CREATE INDEX idx_agent_memory_agent_id ON agent_memory(agent_id);
CREATE INDEX idx_agent_memory_timestamp ON agent_memory(timestamp DESC);

-- Enable RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access" ON agent_memory
    FOR ALL USING (auth.role() = 'service_role');
```

---

## Next Steps

1. **Phase 1: Data Pipeline** (Week 1-2)
   - Wire up ccxt for real exchange data
   - Integrate CoinGecko for market data
   - Set up Redis for caching

2. **Phase 2: Agent Framework** (Week 2-3)
   - Implement agent base class
   - Build memory system
   - Create orchestrator

3. **Phase 3: Intelligence** (Week 3-4)
   - Glassnode integration
   - Santiment integration
   - Social sentiment pipeline

4. **Phase 4: Execution** (Week 4-5)
   - Smart order router
   - TWAP/VWAP algos
   - Risk validation

5. **Phase 5: Autonomy** (Week 5-6)
   - Autonomous trading mode
   - Circuit breakers
   - Monitoring & alerts
