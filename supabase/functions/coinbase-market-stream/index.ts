import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Coinbase Market Data WebSocket Stream
 * 
 * Features:
 * - Dynamically fetches ALL available products from Coinbase API
 * - Subscribes to real-time WebSocket for all USD pairs
 * - Auto-detects new coins when Coinbase adds them (refreshes hourly)
 * - US regulatory compliant (Coinbase Advanced Trade)
 * - Streams data via Server-Sent Events (SSE)
 */

const COINBASE_API = "https://api.coinbase.com";
const COINBASE_WS = "wss://advanced-trade-ws.coinbase.com";

// CORS headers for SSE streaming
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Cache for available products (refreshed hourly)
let availableProducts: string[] = [];
let lastProductRefresh = 0;
const PRODUCT_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

// Active WebSocket connection
let coinbaseWs: WebSocket | null = null;
const subscribers = new Set<ReadableStreamDefaultController>();
const latestPrices = new Map<string, any>();

/**
 * Fetch all available products from Coinbase API
 * Filters for USD pairs only
 */
async function fetchAvailableProducts(): Promise<string[]> {
  try {
    console.log('[Coinbase] Fetching available products...');
    
    const response = await fetch(`${COINBASE_API}/api/v3/brokerage/market/products`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Coinbase API error: ${response.status}`);
    }

    const data = await response.json();
    const products = data.products || [];
    
    // Filter for USD pairs that are tradable
    const usdPairs = products
      .filter((p: any) => 
        p.quote_currency_id === 'USD' && 
        p.status === 'online' &&
        !p.trading_disabled
      )
      .map((p: any) => p.product_id);

    console.log(`[Coinbase] Found ${usdPairs.length} tradable USD pairs`);
    return usdPairs;
  } catch (error) {
    console.error('[Coinbase] Failed to fetch products:', error);
    return [];
  }
}

/**
 * Get available products (with caching and auto-refresh)
 */
async function getAvailableProducts(): Promise<string[]> {
  const now = Date.now();
  
  // Refresh if cache is empty or expired
  if (availableProducts.length === 0 || now - lastProductRefresh > PRODUCT_REFRESH_INTERVAL) {
    availableProducts = await fetchAvailableProducts();
    lastProductRefresh = now;
  }
  
  return availableProducts;
}

/**
 * Connect to Coinbase WebSocket and subscribe to all products
 */
async function connectCoinbaseWebSocket(products: string[]) {
  if (coinbaseWs && coinbaseWs.readyState === WebSocket.OPEN) {
    console.log('[Coinbase] WebSocket already connected');
    return;
  }

  try {
    console.log(`[Coinbase] Connecting to WebSocket for ${products.length} products...`);
    
    coinbaseWs = new WebSocket(COINBASE_WS);

    coinbaseWs.onopen = () => {
      console.log('[Coinbase] WebSocket connected');
      
      // Subscribe to ticker channel for all products
      const subscribeMessage = {
        type: 'subscribe',
        product_ids: products,
        channel: 'ticker',
      };
      
      coinbaseWs?.send(JSON.stringify(subscribeMessage));
      console.log(`[Coinbase] Subscribed to ${products.length} products`);
    };

    coinbaseWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle ticker updates
        if (data.channel === 'ticker' && data.events) {
          for (const tickerEvent of data.events) {
            const ticker = tickerEvent.tickers?.[0];
            if (!ticker) continue;

            const productId = ticker.product_id;
            const price = parseFloat(ticker.price);
            
            if (!productId || isNaN(price)) continue;

            // Store latest price
            latestPrices.set(productId, {
              symbol: productId,
              price: price,
              volume_24h: parseFloat(ticker.volume_24_h || '0'),
              price_percent_change_24h: parseFloat(ticker.price_percent_chg_24_h || '0'),
              best_bid: parseFloat(ticker.best_bid || '0'),
              best_ask: parseFloat(ticker.best_ask || '0'),
              timestamp: new Date().toISOString(),
            });

            // Broadcast to all subscribers
            const message = `data: ${JSON.stringify({ type: 'ticker', data: latestPrices.get(productId) })}\n\n`;
            subscribers.forEach(controller => {
              try {
                controller.enqueue(new TextEncoder().encode(message));
              } catch (e) {
                console.error('[Coinbase] Failed to send to subscriber:', e);
              }
            });
          }
        }
      } catch (error) {
        console.error('[Coinbase] Error processing message:', error);
      }
    };

    coinbaseWs.onerror = (error) => {
      console.error('[Coinbase] WebSocket error:', error);
    };

    coinbaseWs.onclose = () => {
      console.log('[Coinbase] WebSocket closed, reconnecting in 5s...');
      coinbaseWs = null;
      setTimeout(() => connectCoinbaseWebSocket(products), 5000);
    };
  } catch (error) {
    console.error('[Coinbase] Failed to connect WebSocket:', error);
  }
}

