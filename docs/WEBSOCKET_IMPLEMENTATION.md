# WebSocket Market Data Implementation

## Overview

The market data system has been upgraded from polling to WebSocket-based real-time streaming for better performance and reduced API costs.

## Architecture

### Components

1. **Edge Function: `market-data-stream`**
   - Location: `supabase/functions/market-data-stream/index.ts`
   - Maintains persistent WebSocket connections to Binance
   - Streams real-time price updates via Server-Sent Events (SSE)
   - Handles multiple symbol subscriptions efficiently

2. **Context: `MarketDataContext`**
   - Location: `src/contexts/MarketDataContext.tsx`
   - Connects to the edge function via EventSource (SSE)
   - Manages WebSocket lifecycle and reconnection
   - Falls back to polling if WebSocket fails

## How It Works

### WebSocket Flow

```
Frontend (MarketDataContext)
    ↓ EventSource connection
Edge Function (market-data-stream)
    ↓ WebSocket connection
Binance WebSocket API
    ↓ Real-time ticker updates
Edge Function
    ↓ SSE stream
Frontend (updates state)
```

### Data Format

Binance ticker data is transformed to our standard format:

```typescript
{
  symbol: 'BTCUSDT',
  price: 45000.00,
  change24h: 2.5,
  volume24h: 1234567890,
  high24h: 46000.00,
  low24h: 44000.00,
  bid: 44999.50,
  ask: 45000.50,
  timestamp: 1234567890,
  dataQuality: 'realtime'
}
```

## Features

### 1. Real-Time Updates
- Sub-second latency for price updates
- No polling overhead
- Efficient bandwidth usage

### 2. Automatic Reconnection
- Exponential backoff strategy
- Max 5 reconnection attempts
- Graceful degradation to polling

### 3. Fallback Mechanism
- Automatically switches to polling if WebSocket fails
- Uses existing `market-data` edge function
- Seamless user experience

### 4. Multi-Symbol Support
- Single WebSocket connection per symbol
- Efficient resource management
- Automatic cleanup when symbols are unsubscribed

## Configuration

### Environment Variables
No additional environment variables required. Uses existing Supabase configuration.

### Reconnection Settings
```typescript
MAX_RECONNECT_ATTEMPTS = 5
RECONNECT_DELAY = 3000ms (with exponential backoff)
```

### Fallback Polling
```typescript
refreshInterval = 5000ms (default)
```

## Deployment

### 1. Deploy Edge Function
```bash
supabase functions deploy market-data-stream
```

### 2. Test Connection
```bash
curl "https://YOUR_PROJECT.supabase.co/functions/v1/market-data-stream?symbols=BTCUSDT,ETHUSDT" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### 3. Monitor Logs
```bash
supabase functions logs market-data-stream
```

## Monitoring

### Console Logs

**Connection:**
```
[MarketData] Connecting to WebSocket stream for 15 symbols
[WebSocket] Connected to BTCUSDT
[MarketData] WebSocket connected
```

**Updates:**
```
[MarketData] Received update for BTCUSDT: $45000.00
```

**Errors:**
```
[MarketData] WebSocket error: [error details]
[MarketData] Reconnecting in 3000ms (attempt 1/5)
```

**Fallback:**
```
[MarketData] WebSocket failed after max attempts, falling back to polling
[MarketData] Polling updated 15 tickers from coingecko-polling
```

## Troubleshooting

### Issue: WebSocket not connecting
**Solution:** Check Supabase edge function deployment and logs

### Issue: Frequent reconnections
**Solution:** Check network stability and Binance API status

### Issue: Falling back to polling
**Solution:** This is expected behavior if WebSocket fails. Check edge function logs for errors.

### Issue: Missing price updates
**Solution:** Verify symbol is supported in `SYMBOL_MAP` in edge function

## Performance Comparison

| Metric | Polling (Old) | WebSocket (New) |
|--------|--------------|-----------------|
| Latency | 5-15 seconds | <1 second |
| API Calls | 12/minute | 0 (after connection) |
| Bandwidth | High | Low |
| Rate Limits | Frequent | None |
| Data Quality | Delayed | Real-time |

## Future Enhancements

1. **Multi-Exchange Support**: Add Coinbase, Kraken WebSocket streams
2. **Order Book Streaming**: Real-time order book depth updates
3. **Trade Streaming**: Live trade feed for volume analysis
4. **Compression**: Enable WebSocket compression for bandwidth optimization
5. **Metrics**: Add Prometheus metrics for monitoring

## Related Files

- `supabase/functions/market-data-stream/index.ts` - WebSocket edge function
- `src/contexts/MarketDataContext.tsx` - Frontend WebSocket client
- `supabase/functions/market-data/index.ts` - Fallback polling function (kept for compatibility)
- `src/lib/symbolUtils.ts` - Symbol format utilities

