# Architecture

> How the system actually works — for developers who want to understand, extend, or contribute.

## Overview

This is a multi-agent crypto trading system designed for:
- Institutional-grade risk management
- Complete decision transparency
- Safe community extension

```
┌─────────────────────────────────────────────────────────────────────┐
│                           TRADING GATE                               │
│                    (The Constitution — Cannot Be Bypassed)           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Strategy   │───▶│ Meta-Decision │───▶│   Capital    │          │
│  │   Agents     │    │    Agent      │    │  Allocation  │          │
│  │  (Propose)   │    │   (Allow?)    │    │   (How Much?)│          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                   │                    │                   │
│         ▼                   ▼                    ▼                   │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                      RISK AGENT                           │      │
│  │              (What is absolutely forbidden?)              │      │
│  │                                                           │      │
│  │  • Kill Switch Check                                      │      │
│  │  • Position Limits                                        │      │
│  │  • Exposure Limits                                        │      │
│  │  • Daily Loss Limits                                      │      │
│  │  • Regime Filtering                                       │      │
│  └──────────────────────────────────────────────────────────┘      │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                   EXECUTION COST GATE                     │      │
│  │           (Is the trade worth the costs?)                 │      │
│  │                                                           │      │
│  │  Expected Edge > (Spread + Slippage + Fees + Buffer)     │      │
│  └──────────────────────────────────────────────────────────┘      │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                   EXECUTION AGENT                         │      │
│  │              (Execute precisely, or not at all)           │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Trading Gate (`src/lib/tradingGate.ts`)

The constitution of the system. Every trade must pass through:

```typescript
interface TradingGateResult {
  allowed: boolean;
  reason?: string;
  gatesChecked: GateCheckResult[];
  tradingState: TradingState;
}
```

**Sacred rules:**
- If `globalKillSwitch` is active → NO trading
- If `reduceOnlyMode` is active → only position-reducing trades
- If data quality is insufficient → NO trading
- No bypass mechanisms exist

### 2. Decision Trace Engine (`src/lib/decisionTrace.ts`)

Every action or inaction produces a trace:

```typescript
interface DecisionTrace {
  id: string;
  timestamp: Date;
  intent: { instrument, direction, strategy, confidence };
  decision: 'EXECUTED' | 'BLOCKED' | 'MODIFIED';
  gatesChecked: GateCheckResult[];
  blockReasons: BlockReason[];
  regime: MarketRegime;
  costs: CostAnalysis;
  explanation: string;  // Human-readable
  reasonCodes: string[]; // Machine-readable
}
```

This powers:
- UI explainability panels
- API debugging endpoints
- Educational features
- Audit trails

### 3. Multi-Agent System

#### Strategy Agents (`backend/app/agents/signal_agent.py`)
- **Role:** Propose trade ideas only
- **Cannot:** Execute trades directly
- **Output:** Trade intents with confidence scores

#### Meta-Decision Agent (`backend/app/agents/meta_decision_agent.py`)
- **Role:** Decide if trading is allowed at all
- **Inputs:** Market regime, volatility, liquidity, correlation
- **Output:** Trading allowed/forbidden with intensity level

#### Capital Allocation Agent (`backend/app/agents/capital_allocation_agent.py`)
- **Role:** Decide how much risk per strategy
- **Inputs:** Strategy performance, correlation, book limits
- **Output:** Capital allocation per strategy

#### Risk Agent (`backend/app/agents/risk_agent.py`)
- **Role:** Final veto power on all trades
- **Checks:** Kill switch, position limits, exposure, daily loss
- **Cannot be overridden:** This is a hard constraint

#### Execution Agent (`backend/app/agents/execution_agent.py`)
- **Role:** Execute approved trades precisely
- **Requirement:** Must pass execution cost gate
- **Principle:** Execute precisely, or not at all

### 4. Order Management System (`backend/app/services/oms_execution.py`)

Single source of truth for order execution:

```python
class OMSExecution:
    async def execute_intent(
        self,
        intent: TradeIntent,
        venue_id: str,
        venue_name: str
    ) -> ExecutionResult:
        # 1. Check kill switch
        # 2. Check book status
        # 3. Check venue health
        # 4. Check execution costs
        # 5. Execute if all pass
        # 6. Record decision trace
```

**Critical invariant:** This is the ONLY component that writes orders to the database.

### 5. User Mode System (`src/lib/userModes.ts`)

Progressive trading modes:

| Mode | Live Trading | Max Position | Default |
|------|--------------|--------------|---------|
| Observer | ❌ | $0 | ✅ |
| Paper | ❌ (simulated) | Unlimited | |
| Guarded | ✅ | $500 | |
| Advanced | ✅ | $10,000 | |

## Data Flow

### Trade Intent Lifecycle

```
1. Strategy generates signal
   └─▶ Creates TradeIntent with confidence

2. Meta-Decision Agent evaluates regime
   └─▶ Approves/rejects based on market conditions

3. Capital Allocation assigns budget
   └─▶ Adjusts size based on strategy allocation

4. Risk Agent validates limits
   └─▶ Checks all hard constraints

5. Execution Cost Gate validates profitability
   └─▶ Expected Edge > Total Costs

6. OMS executes (if approved)
   └─▶ Single point of order creation

7. Decision Trace recorded
   └─▶ Full audit trail with explanation
```

### Database Schema (Supabase)

Key tables:
- `orders` — All order records
- `positions` — Open positions
- `trade_intents` — Strategy-generated intents
- `books` — Trading book configurations
- `global_settings` — System-wide settings (kill switch, etc.)
- `audit_events` — Complete audit trail

## Extension Points

### Adding a Strategy

1. Create strategy class implementing `BaseStrategy`
2. Register with Strategy Agent
3. Declare risk parameters and assumptions
4. Submit PR with backtest results

**Cannot bypass:** Risk Agent, Execution Cost Gate, Trading Gate

### Adding a Venue

1. Create adapter implementing `VenueAdapter`
2. Register with Execution Agent
3. Configure fee structure
4. Add health monitoring

### Adding Analytics

1. Create component in `src/components/`
2. Use existing hooks (`usePositions`, `useOrders`, etc.)
3. Follow design system tokens

## Testing Requirements

All PRs must pass:

```bash
# Unit tests
pytest backend/tests/

# Safety tests (required for core changes)
pytest backend/tests/test_risk_engine.py
pytest backend/tests/test_trading_gate.py

# Integration tests
pytest backend/tests/test_execution_flow.py
```

### Safety Test Requirements

Changes to these components require additional testing:
- Trading Gate
- Risk Agent
- OMS Execution
- Kill Switch

## Configuration

### Environment Variables

```env
# Mode
PAPER_TRADING=true  # Default: safe mode

# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Venues (optional, for live trading)
COINBASE_API_KEY=...
MEXC_API_KEY=...
```

### Feature Flags

```typescript
// src/lib/featureFlags.ts
export const FEATURES = {
  LIVE_TRADING: false,      // Requires explicit opt-in
  ADVANCED_MODE: true,
  MEME_MODULE: true,
  DEX_VENUES: false,
};
```

## Performance Considerations

- Decision traces are kept in memory (max 100)
- Heavy computations run in Edge Functions
- Real-time updates via Supabase subscriptions
- Venue health checked every 30 seconds

## Security Model

1. **Authentication:** Supabase Auth with RLS
2. **Authorization:** Role-based (admin, trader, viewer)
3. **API Security:** Service key for backend operations
4. **No client-side secrets:** All sensitive operations via Edge Functions

---

*This architecture prioritizes safety and transparency over speed. If you want to make it faster at the expense of safety, you're in the wrong project.*
