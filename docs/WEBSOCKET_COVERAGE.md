# WebSocket Coverage Analysis

## Current Status

### ✅ Real-Time WebSocket Coverage (41 coins)

**Major Coins:**
- BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, MATIC/POL, DOT, UNI, ATOM, LTC

**Layer 2 & Scaling:**
- ARB, OP, IMX, STRK, MANTA, METIS, ZK

**DeFi:**
- AAVE, CRV, MKR, SNX, COMP, SUSHI, LDO, RPL, GMX, DYDX, PENDLE

**Infrastructure:**
- NEAR, FTM, ALGO, ICP, FIL, HBAR, VET

### ⚠️ NOT Covered by WebSocket (60+ coins)

**Meme Coins:**
- SHIB, PEPE, FLOKI, BONK, WIF

**AI & Compute:**
- FET, RNDR, AGIX, TAO, AR, OCEAN

**Gaming & Metaverse:**
- SAND, MANA, AXS, GALA, ENJ, RONIN, BEAM

**New Layer 1s:**
- APT, SUI, SEI, INJ, TIA, STX

**Oracles & Data:**
- PYTH, API3, BAND

**Privacy:**
- XMR, ZEC

**Exchange Tokens:**
- OKB, CRO, LEO

**Others:**
- 1INCH

---

## The Problem

### Current Architecture Issue:

```
User subscribes to: [BTC, ETH, SHIB, PEPE]
                           ↓
WebSocket tries to connect to ALL symbols
                           ↓
SHIB & PEPE not in SYMBOL_MAP
                           ↓
WebSocket connection fails
                           ↓
Falls back to POLLING for ALL symbols (including BTC & ETH!)
```

**Result:** Even supported coins lose real-time updates if ANY unsupported coin is requested.

---

## Solutions

### Option 1: Expand SYMBOL_MAP (Recommended)

Add all Binance-supported coins to the WebSocket map.

**Binance supports most popular coins including:**
- ✅ SHIB, PEPE, FLOKI, BONK, WIF (meme coins)
- ✅ FET, RNDR, AGIX, TAO, AR (AI coins)
- ✅ SAND, MANA, AXS, GALA (gaming)
- ✅ APT, SUI, SEI, INJ, TIA (new L1s)
- ❌ XMR (privacy - not on Binance)
- ❌ Some smaller tokens

**Action:** Update `SYMBOL_MAP` in `market-data-stream/index.ts` to include ~80 coins.

### Option 2: Hybrid Approach (Best Long-Term)

Split the data fetching:
1. **WebSocket** for symbols in SYMBOL_MAP
2. **Polling** for symbols NOT in SYMBOL_MAP
3. Merge results in frontend

**Pros:**
- Best of both worlds
- Supported coins get real-time updates
- Unsupported coins still work (via polling)

**Cons:**
- More complex implementation
- Requires refactoring MarketDataContext

### Option 3: Keep Current + Document (Simplest)

Keep current implementation but clearly document:
- Which coins are real-time (WebSocket)
- Which coins are delayed (polling fallback)
- Show data quality indicator in UI

---

## Recommendation

**For now:** Use **Option 1** - Expand SYMBOL_MAP

**Why:**
1. Quick to implement (just add more symbols)
2. Binance supports 80%+ of your coins
3. Maintains simple architecture
4. Users get real-time for most coins

**Later:** Migrate to **Option 2** - Hybrid approach for complete coverage

---

## Action Items

### Immediate (Option 1):

1. **Expand SYMBOL_MAP** to include all Binance-supported coins:
   ```typescript
   // Add to market-data-stream/index.ts
   'SHIBUSDT': 'shibusdt',
   'PEPEUSDT': 'pepeusdt',
   'FLOKIUSDT': 'flokiusdt',
   'BONKUSDT': 'bonkusdt',
   'WIFUSDT': 'wifusdt',
   'FETUSDT': 'fetusdt',
   'RNDRUSDT': 'rndrusdt',
   // ... etc
   ```

2. **Test** each symbol on Binance WebSocket
3. **Document** which coins are NOT available on Binance
4. **Keep polling fallback** for unsupported coins

### Future (Option 2):

1. Refactor MarketDataContext to support hybrid mode
2. Check each symbol against SYMBOL_MAP
3. Use WebSocket for supported, polling for unsupported
4. Merge results seamlessly

---

## Testing

To verify which coins Binance supports, test each symbol:

```bash
# Test if Binance has a ticker for a symbol
curl "https://api.binance.com/api/v3/ticker/24hr?symbol=SHIBUSDT"
```

If it returns data, add it to SYMBOL_MAP. If it returns error, keep it in polling fallback.

---

## Summary

**Current Coverage:** 41 coins with real-time WebSocket  
**Total Coins:** 100+ coins in CoinGecko  
**Coverage Rate:** ~40%

**Recommendation:** Expand to 80+ coins (80% coverage) by adding all Binance-supported symbols to SYMBOL_MAP.

