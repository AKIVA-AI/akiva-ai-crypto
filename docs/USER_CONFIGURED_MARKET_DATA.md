# User-Configured Market Data Architecture

## Overview

**Key Insight:** Market data sources are dynamically selected based on each user's configured exchanges, respecting their jurisdiction and preferences.

---

## 🌍 Multi-Jurisdiction Support

### **The Problem:**
- US users → Can only use Coinbase, Kraken, Hyperliquid
- International users → Can use Binance, Bybit, OKX, MEXC
- Each user has different regulatory requirements

### **The Solution:**
Users configure their own exchanges via the **ExchangeAPIManager**, and the system automatically:
1. ✅ Detects which exchanges the user has configured
2. ✅ Creates WebSocket connections only for those exchanges
3. ✅ Routes market data from the user's exchanges
4. ✅ Shows regulatory warnings when appropriate

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CONFIGURATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  US User:                    International User:             │
│  ✅ Coinbase                 ✅ Binance                       │
│  ✅ Kraken                   ✅ Bybit                         │
│  ✅ Hyperliquid              ✅ OKX                           │
│                              ✅ MEXC                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              DYNAMIC MARKET DATA ROUTING                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Fetch user's configured exchanges from DB                │
│  2. Create WebSocket connections for each exchange           │
│  3. Subscribe to all products on each exchange               │
│  4. Merge data streams into unified feed                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   MARKET DATA LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  US User sees:               International User sees:        │
│  • BTC-USD (Coinbase)        • BTCUSDT (Binance)            │
│  • ETH-USD (Kraken)          • ETHUSDT (Bybit)              │
│  • SOL-USD (Coinbase)        • SOLUSDT (OKX)                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Schema (Already Exists!)

### **user_exchange_keys table:**
```sql
CREATE TABLE user_exchange_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  exchange TEXT CHECK (exchange IN (
    'coinbase', 'kraken', 'binance', 
    'bybit', 'okx', 'mexc', 'hyperliquid'
  )),
  label TEXT,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  permissions TEXT[],
  is_active BOOLEAN DEFAULT true,
  is_validated BOOLEAN DEFAULT false,
  ...
);
```

**Key Points:**
- ✅ Each user can configure multiple exchanges
- ✅ API keys are encrypted client-side
- ✅ RLS ensures users only see their own keys
- ✅ Supports all major exchanges

---

## 🔄 Dynamic Market Data Flow

### **Step 1: User Configures Exchanges**
```typescript
// User adds Coinbase via ExchangeAPIManager
await addExchangeKey({
  exchange: 'coinbase',
  label: 'My Coinbase Account',
  apiKey: 'cb_key_...',
  apiSecret: 'cb_secret_...',
  permissions: ['read', 'trade'],
});
```

### **Step 2: System Detects User's Exchanges**
```typescript
// MarketDataContext fetches user's exchanges
const { data: userExchanges } = await supabase
  .from('user_exchange_keys')
  .select('exchange')
  .eq('is_active', true);

// Result: ['coinbase', 'kraken']
```

### **Step 3: Create WebSocket Connections**
```typescript
// Connect to each user's exchange
userExchanges.forEach(exchange => {
  if (exchange === 'coinbase') {
    connectCoinbaseWebSocket();
  } else if (exchange === 'kraken') {
    connectKrakenWebSocket();
  } else if (exchange === 'binance') {
    connectBinanceWebSocket(); // Only if user configured it
  }
  // ... etc
});
```

### **Step 4: Merge Data Streams**
```typescript
// Unified market data feed
const marketData = {
  'BTC-USD': {
    price: 45000,
    source: 'coinbase',
    timestamp: Date.now(),
  },
  'BTCUSDT': {
    price: 45010,
    source: 'binance', // Only if user has Binance configured
    timestamp: Date.now(),
  },
};
```

---

## 🚨 Regulatory Compliance

### **Automatic Warnings:**
```typescript
// Show warning for non-US-compliant exchanges
if (exchange === 'binance' && userLocation === 'US') {
  showWarning('⚠️ Binance is not available in the US');
}
```

### **UI Indicators:**
```tsx
<ExchangeBadge exchange="coinbase">
  🔵 Coinbase <Badge>US Compliant</Badge>
</ExchangeBadge>

<ExchangeBadge exchange="binance">
  🟡 Binance <Badge variant="warning">Not available in US</Badge>
</ExchangeBadge>
```

---

## 🎯 Implementation Plan

### **Phase 1: Multi-Exchange WebSocket Manager**
Create a unified WebSocket manager that:
1. Fetches user's configured exchanges
2. Creates connections for each exchange
3. Handles reconnection and failover
4. Merges data streams

**File:** `src/contexts/MultiExchangeMarketData.tsx`

### **Phase 2: Exchange-Specific Streams**
Create WebSocket implementations for each exchange:
- ✅ `coinbase-market-stream` (already started)
- 🔄 `kraken-market-stream`
- 🔄 `binance-market-stream`
- 🔄 `bybit-market-stream`
- 🔄 `okx-market-stream`

### **Phase 3: Smart Routing**
Route requests based on user's configuration:
```typescript
function getMarketDataSource(symbol: string, purpose: string) {
  const userExchanges = getUserConfiguredExchanges();
  
  if (purpose === 'trading') {
    // Use the exchange where user is trading
    return userExchanges.find(e => e.hasSymbol(symbol));
  }
  
  if (purpose === 'display') {
    // Use any exchange that has the symbol
    return userExchanges[0];
  }
}
```

---

## 📋 Example Scenarios

### **Scenario 1: US User**
```
User configures: Coinbase + Kraken
System creates: Coinbase WS + Kraken WS
User sees: ~300 USD pairs (Coinbase + Kraken combined)
Trading: Routes to configured exchange
```

### **Scenario 2: International User**
```
User configures: Binance + Bybit + OKX
System creates: Binance WS + Bybit WS + OKX WS
User sees: 1,000+ USDT pairs (all exchanges combined)
Trading: Routes to configured exchange
```

### **Scenario 3: Mixed User (VPN/Travel)**
```
User configures: Coinbase + Binance
System shows: ⚠️ Warning on Binance if in US
User can: Disable Binance when in US, enable when traveling
Trading: Only routes to compliant exchanges
```

---

## ✅ Benefits

1. ✅ **Jurisdiction-Aware** - Respects each user's location
2. ✅ **User-Controlled** - Users choose their exchanges
3. ✅ **Comprehensive Coverage** - Access to all exchanges
4. ✅ **Regulatory Compliant** - Shows warnings appropriately
5. ✅ **Flexible** - Users can add/remove exchanges anytime
6. ✅ **Optimal Routing** - Uses best exchange for each purpose

---

## 🔧 Technical Details

### **Fetching User's Exchanges:**
```typescript
async function getUserExchanges(userId: string) {
  const { data } = await supabase
    .from('user_exchange_keys')
    .select('exchange, is_active, is_validated')
    .eq('user_id', userId)
    .eq('is_active', true);
  
  return data.map(k => k.exchange);
}
```

### **Creating Dynamic WebSocket:**
```typescript
function createExchangeWebSocket(exchange: string) {
  const wsUrls = {
    coinbase: 'wss://advanced-trade-ws.coinbase.com',
    kraken: 'wss://ws.kraken.com',
    binance: 'wss://stream.binance.com:9443/ws',
    bybit: 'wss://stream.bybit.com/v5/public/spot',
    okx: 'wss://ws.okx.com:8443/ws/v5/public',
  };
  
  return new WebSocket(wsUrls[exchange]);
}
```

---

## 🚀 Next Steps

1. **Implement MultiExchangeMarketData context**
2. **Create exchange-specific WebSocket streams**
3. **Add regulatory warnings to UI**
4. **Test with different user configurations**

This architecture gives you:
- ✅ Global market access
- ✅ Regulatory compliance
- ✅ User control
- ✅ Optimal performance

