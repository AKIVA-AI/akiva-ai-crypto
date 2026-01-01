import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Market Data Proxy Edge Function
 * 
 * Proxies requests to Binance and other exchange APIs to avoid CORS issues
 * Also records performance metrics for monitoring
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface TickerData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  timestamp: number;
}

// Log performance metric
async function logMetric(
  supabase: any,
  functionName: string,
  endpoint: string,
  latencyMs: number,
  success: boolean,
  errorMessage?: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from('performance_metrics').insert({
      function_name: functionName,
      endpoint,
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
      metadata: metadata || {},
    });
  } catch (e) {
    console.warn('[Metrics] Failed to log metric:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const startTime = Date.now();
  let success = true;
  let errorMessage: string | undefined;

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Get the endpoint - could be after 'market-data' or just the last part
    let path = pathParts[pathParts.length - 1];

    // Parse body for POST requests
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // Empty body is fine
      }
      
      // For POST requests with symbols in body, default to ticker endpoint
      // This handles supabase.functions.invoke('market-data', { body: { symbols: '...' } })
      if ((path === 'market-data' || path === 'v1') && body.symbols) {
        path = 'ticker';
      } else if ((path === 'market-data' || path === 'v1') && body.symbol) {
        path = 'price';
      }
    }

    console.log(`[MarketData] Request: ${req.method} path=${path}`);

    switch (path) {
      case 'ticker': {
        // Get ticker data for one or more symbols
        const symbolsParam = url.searchParams.get('symbols') || body.symbols as string;
        if (!symbolsParam) {
          return new Response(JSON.stringify({ error: 'symbols parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase());
        const binanceSymbols = symbols.map(s => s.replace('-', '').replace('/', ''));
        
        // Fetch from Binance
        const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`;
        console.log(`[MarketData] Fetching: ${binanceUrl}`);
        
        const response = await fetch(binanceUrl);
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }

        const data = await response.json();
        const tickers: TickerData[] = data.map((t: any) => ({
          symbol: t.symbol,
          price: parseFloat(t.lastPrice),
          change24h: parseFloat(t.priceChangePercent),
          volume24h: parseFloat(t.quoteVolume),
          high24h: parseFloat(t.highPrice),
          low24h: parseFloat(t.lowPrice),
          bid: parseFloat(t.bidPrice),
          ask: parseFloat(t.askPrice),
          timestamp: Date.now(),
        }));

        const latency = Date.now() - startTime;
        await logMetric(supabase, 'market-data', 'ticker', latency, true, undefined, { 
          symbolCount: symbols.length 
        });

        return new Response(JSON.stringify({ 
          tickers,
          source: 'binance',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'price': {
        // Get single price (simpler endpoint)
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const binanceSymbol = symbol.replace('-', '').replace('/', '').toUpperCase();
        const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        
        await logMetric(supabase, 'market-data', 'price', latency, true);

        return new Response(JSON.stringify({
          symbol: data.symbol,
          price: parseFloat(data.price),
          timestamp: Date.now(),
          source: 'binance',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'orderbook': {
        // Get order book depth
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        const limit = parseInt(url.searchParams.get('limit') || '20');
        
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const binanceSymbol = symbol.replace('-', '').replace('/', '').toUpperCase();
        const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${binanceSymbol}&limit=${limit}`);
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        
        await logMetric(supabase, 'market-data', 'orderbook', latency, true, undefined, { symbol });

        return new Response(JSON.stringify({
          symbol: binanceSymbol,
          bids: data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) })),
          asks: data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) })),
          timestamp: Date.now(),
          source: 'binance',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'klines': {
        // Get OHLCV candlestick data
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        const interval = url.searchParams.get('interval') || '1h';
        const limit = parseInt(url.searchParams.get('limit') || '100');
        
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const binanceSymbol = symbol.replace('-', '').replace('/', '').toUpperCase();
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
        );
        
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        
        const candles = data.map((k: any[]) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

        await logMetric(supabase, 'market-data', 'klines', latency, true, undefined, { symbol, interval });

        return new Response(JSON.stringify({
          symbol: binanceSymbol,
          interval,
          candles,
          source: 'binance',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'health': {
        // Health check - also useful for testing connectivity
        const response = await fetch('https://api.binance.com/api/v3/ping');
        const isHealthy = response.ok;
        const latency = Date.now() - startTime;

        await logMetric(supabase, 'market-data', 'health', latency, isHealthy);

        return new Response(JSON.stringify({
          status: isHealthy ? 'healthy' : 'degraded',
          binance: isHealthy,
          latencyMs: latency,
          timestamp: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({
          error: 'Not found',
          available_endpoints: ['ticker', 'price', 'orderbook', 'klines', 'health'],
          usage: {
            ticker: 'GET /ticker?symbols=BTCUSDT,ETHUSDT',
            price: 'GET /price?symbol=BTCUSDT',
            orderbook: 'GET /orderbook?symbol=BTCUSDT&limit=20',
            klines: 'GET /klines?symbol=BTCUSDT&interval=1h&limit=100',
          }
        }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MarketData] Error:', errorMessage);

    const latency = Date.now() - startTime;
    await logMetric(supabase, 'market-data', 'error', latency, false, errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
