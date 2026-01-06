import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Market Data WebSocket Stream
 *
 * Maintains persistent WebSocket connections to Binance for real-time price updates.
 * Clients connect via Server-Sent Events (SSE) to receive streaming price data.
 */

// Simple CORS headers for SSE streaming
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Binance WebSocket base URL
const BINANCE_WS_BASE = "wss://stream.binance.com:9443/ws";

// Active WebSocket connections per symbol
const activeStreams = new Map<string, WebSocket>();
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();
const latestPrices = new Map<string, any>();

// Symbol mapping (same as market-data function)
const SYMBOL_MAP: Record<string, string> = {
  'BTCUSDT': 'btcusdt', 'ETHUSDT': 'ethusdt', 'SOLUSDT': 'solusdt',
  'ARBUSDT': 'arbusdt', 'OPUSDT': 'opusdt', 'AVAXUSDT': 'avaxusdt',
  'LINKUSDT': 'linkusdt', 'DOGEUSDT': 'dogeusdt', 'XRPUSDT': 'xrpusdt',
  'ADAUSDT': 'adausdt', 'DOTUSDT': 'dotusdt', 'UNIUSDT': 'uniusdt',
  'AAVEUSDT': 'aaveusdt', 'NEARUSDT': 'nearusdt', 'ATOMUSDT': 'atomusdt',
  'BNBUSDT': 'bnbusdt', 'MATICUSDT': 'maticusdt', 'POLUSDT': 'polusdt',
  'LTCUSDT': 'ltcusdt', 'IMXUSDT': 'imxusdt', 'STRKUSDT': 'strkusdt',
  'MANTAUSDT': 'mantausdt', 'METISUSDT': 'metisusdt', 'ZKUSDT': 'zkusdt',
  'CRVUSDT': 'crvusdt', 'MKRUSDT': 'mkrusdt', 'SNXUSDT': 'snxusdt',
  'COMPUSDT': 'compusdt', 'SUSHIUSDT': 'sushiusdt', 'LDOUSDT': 'ldousdt',
  'RPLUSDT': 'rplusdt', 'GMXUSDT': 'gmxusdt', 'DYDXUSDT': 'dydxusdt',
  'PENDLEUSDT': 'pendleusdt', 'FTMUSDT': 'ftmusdt', 'ALGOUSDT': 'algousdt',
  'ICPUSDT': 'icpusdt', 'FILUSDT': 'filusdt', 'HBARUSDT': 'hbarusdt',
  'VETUSDT': 'vetusdt',
};

function getBinanceSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol.toUpperCase()] || symbol.toLowerCase();
}

function connectToSymbol(symbol: string) {
  if (activeStreams.has(symbol)) {
    return; // Already connected
  }

  const binanceSymbol = getBinanceSymbol(symbol);
  const wsUrl = `${BINANCE_WS_BASE}/${binanceSymbol}@ticker`;
  
  console.log(`[WebSocket] Connecting to ${symbol} at ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log(`[WebSocket] Connected to ${symbol}`);
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Transform Binance ticker to our format
      const ticker = {
        symbol: symbol.toUpperCase(),
        price: parseFloat(data.c), // Current price
        change24h: parseFloat(data.P), // 24h price change percentage
        volume24h: parseFloat(data.v), // 24h volume
        high24h: parseFloat(data.h), // 24h high
        low24h: parseFloat(data.l), // 24h low
        bid: parseFloat(data.b), // Best bid
        ask: parseFloat(data.a), // Best ask
        timestamp: data.E, // Event time
        dataQuality: 'realtime' as const,
      };
      
      latestPrices.set(symbol, ticker);
      
      // Broadcast to all subscribers
      const subs = subscribers.get(symbol);
      if (subs) {
        const message = `data: ${JSON.stringify(ticker)}\n\n`;
        subs.forEach(controller => {
          try {
            controller.enqueue(new TextEncoder().encode(message));
          } catch (err) {
            console.error(`[WebSocket] Error sending to subscriber:`, err);
          }
        });
      }
    } catch (err) {
      console.error(`[WebSocket] Error parsing message for ${symbol}:`, err);
    }
  };
  
  ws.onerror = (error) => {
    console.error(`[WebSocket] Error for ${symbol}:`, error);
  };
  
  ws.onclose = () => {
    console.log(`[WebSocket] Disconnected from ${symbol}`);
    activeStreams.delete(symbol);
    
    // Reconnect if there are still subscribers
    if (subscribers.has(symbol) && subscribers.get(symbol)!.size > 0) {
      console.log(`[WebSocket] Reconnecting to ${symbol}...`);
      setTimeout(() => connectToSymbol(symbol), 5000);
    }
  };
  
  activeStreams.set(symbol, ws);
}

function disconnectFromSymbol(symbol: string) {
  const ws = activeStreams.get(symbol);
  if (ws) {
    ws.close();
    activeStreams.delete(symbol);
    console.log(`[WebSocket] Closed connection to ${symbol}`);
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const symbols = url.searchParams.get('symbols')?.split(',') || [];
  
  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: 'symbols parameter required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register subscriber for each symbol
      symbols.forEach(symbol => {
        const upperSymbol = symbol.toUpperCase();
        
        if (!subscribers.has(upperSymbol)) {
          subscribers.set(upperSymbol, new Set());
        }
        subscribers.get(upperSymbol)!.add(controller);
        
        // Connect to WebSocket if not already connected
        connectToSymbol(upperSymbol);
        
        // Send latest price immediately if available
        const latest = latestPrices.get(upperSymbol);
        if (latest) {
          const message = `data: ${JSON.stringify(latest)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
        }
      });
      
      // Send keepalive every 30 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);
    },
    cancel() {
      // Clean up when client disconnects
      symbols.forEach(symbol => {
        const upperSymbol = symbol.toUpperCase();
        const subs = subscribers.get(upperSymbol);
        if (subs) {
          subs.delete(this as any);
          if (subs.size === 0) {
            subscribers.delete(upperSymbol);
            disconnectFromSymbol(upperSymbol);
          }
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

