import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Kraken API URLs
const KRAKEN_API_URL = 'https://api.kraken.com';
const KRAKEN_FUTURES_URL = 'https://futures.kraken.com';

interface KrakenCredentials {
  apiKey: string;
  apiSecret: string;
}

interface OrderRequest {
  pair: string;
  type: 'buy' | 'sell';
  ordertype: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  volume: string;
  price?: string;
  leverage?: string;
}

// Generate Kraken API signature
async function generateKrakenSignature(
  path: string,
  nonce: string,
  postData: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  
  // SHA256 hash of nonce + postData
  const sha256Data = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(nonce + postData)
  );
  
  // Decode base64 secret
  const decodedSecret = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
  
  // Create path + sha256 message
  const pathBytes = encoder.encode(path);
  const message = new Uint8Array(pathBytes.length + sha256Data.byteLength);
  message.set(pathBytes, 0);
  message.set(new Uint8Array(sha256Data), pathBytes.length);
  
  // HMAC-SHA512 sign
  const key = await crypto.subtle.importKey(
    'raw',
    decodedSecret,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, message);
  
  // Base64 encode
  const signatureBytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  return btoa(binary);
}

// Make authenticated request to Kraken
async function krakenPrivateRequest(
  credentials: KrakenCredentials,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<any> {
  const nonce = Date.now().toString();
  const postData = new URLSearchParams({ nonce, ...params }).toString();
  const path = `/0/private/${endpoint}`;
  
  const signature = await generateKrakenSignature(
    path,
    nonce,
    postData,
    credentials.apiSecret
  );
  
  const response = await fetch(`${KRAKEN_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'API-Key': credentials.apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });
  
  const data = await response.json();
  
  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error: ${data.error.join(', ')}`);
  }
  
  return data.result;
}

// Make public request to Kraken
async function krakenPublicRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const queryString = new URLSearchParams(params).toString();
  const url = `${KRAKEN_API_URL}/0/public/${endpoint}${queryString ? '?' + queryString : ''}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error: ${data.error.join(', ')}`);
  }
  
  return data.result;
}

// Get account balance
async function getBalance(credentials: KrakenCredentials): Promise<any> {
  return krakenPrivateRequest(credentials, 'Balance');
}

// Get open orders
async function getOpenOrders(credentials: KrakenCredentials): Promise<any> {
  return krakenPrivateRequest(credentials, 'OpenOrders');
}

// Get trade history
async function getTradeHistory(credentials: KrakenCredentials): Promise<any> {
  return krakenPrivateRequest(credentials, 'TradesHistory');
}

// Place an order
async function placeOrder(credentials: KrakenCredentials, order: OrderRequest): Promise<any> {
  const params: Record<string, string> = {
    pair: order.pair,
    type: order.type,
    ordertype: order.ordertype,
    volume: order.volume,
  };
  
  if (order.price) params.price = order.price;
  if (order.leverage) params.leverage = order.leverage;
  
  return krakenPrivateRequest(credentials, 'AddOrder', params);
}

// Cancel an order
async function cancelOrder(credentials: KrakenCredentials, txid: string): Promise<any> {
  return krakenPrivateRequest(credentials, 'CancelOrder', { txid });
}

// Get ticker (public)
async function getTicker(pair: string): Promise<any> {
  return krakenPublicRequest('Ticker', { pair });
}

// Get order book (public)
async function getOrderBook(pair: string, count = '25'): Promise<any> {
  return krakenPublicRequest('Depth', { pair, count });
}

// Get tradeable asset pairs (public)
async function getAssetPairs(): Promise<any> {
  return krakenPublicRequest('AssetPairs');
}

// Get OHLC data (public)
async function getOHLC(pair: string, interval = '60'): Promise<any> {
  return krakenPublicRequest('OHLC', { pair, interval });
}

// Get staking info (private)
async function getStakingAssets(credentials: KrakenCredentials): Promise<any> {
  return krakenPrivateRequest(credentials, 'Staking/Assets');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Kraken credentials
    const apiKey = Deno.env.get('KRAKEN_API_KEY');
    const apiSecret = Deno.env.get('KRAKEN_API_SECRET');
    
    const hasCredentials = apiKey && apiSecret;
    const credentials: KrakenCredentials | null = hasCredentials 
      ? { apiKey, apiSecret } 
      : null;

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    let body: any = {};
    if (req.method !== 'GET') {
      const raw = await req.text();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = {};
        }
      }
    }

    switch (path) {
      case 'status': {
        let connected = false;
        let accountInfo = null;
        
        if (credentials) {
          try {
            const balance = await getBalance(credentials);
            connected = true;
            accountInfo = {
              currencies: Object.keys(balance).length,
              hasUSD: 'ZUSD' in balance || 'USD' in balance,
            };
          } catch (error) {
            console.error('Kraken connection test failed:', error);
          }
        }
        
        return new Response(JSON.stringify({
          configured: hasCredentials,
          connected,
          accountInfo,
          features: {
            spot: true,
            futures: true, // Kraken Futures available
            perpetuals: false, // Not available in US
            margin: true,
            staking: true,
            options: false,
          },
          regions: {
            usCompliant: true,
            available: ['US', 'EU', 'UK', 'CA', 'AU', 'JP'],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'balances': {
        if (!credentials) {
          return new Response(JSON.stringify({ 
            error: 'Kraken credentials not configured',
            simulation: true,
            balances: {
              'ZUSD': '10000.00',
              'XXBT': '0.5',
              'XETH': '5.0',
            }
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const balance = await getBalance(credentials);
        
        return new Response(JSON.stringify({ balances: balance }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'ticker': {
        const pair = url.searchParams.get('pair') || 'XXBTZUSD';
        
        try {
          const ticker = await getTicker(pair);
          const pairData = ticker[Object.keys(ticker)[0]];
          
          return new Response(JSON.stringify({
            pair,
            ask: parseFloat(pairData.a[0]),
            bid: parseFloat(pairData.b[0]),
            last: parseFloat(pairData.c[0]),
            volume_24h: parseFloat(pairData.v[1]),
            high_24h: parseFloat(pairData.h[1]),
            low_24h: parseFloat(pairData.l[1]),
            vwap_24h: parseFloat(pairData.p[1]),
            trades_24h: parseInt(pairData.t[1]),
            timestamp: new Date().toISOString(),
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Failed to get ticker' }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
      }

      case 'orderbook': {
        const pair = url.searchParams.get('pair') || 'XXBTZUSD';
        const count = url.searchParams.get('count') || '25';
        
        const orderBook = await getOrderBook(pair, count);
        const pairData = orderBook[Object.keys(orderBook)[0]];
        
        return new Response(JSON.stringify({
          pair,
          asks: pairData.asks.map((a: string[]) => ({
            price: parseFloat(a[0]),
            volume: parseFloat(a[1]),
            timestamp: parseInt(a[2]),
          })),
          bids: pairData.bids.map((b: string[]) => ({
            price: parseFloat(b[0]),
            volume: parseFloat(b[1]),
            timestamp: parseInt(b[2]),
          })),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'pairs': {
        const pairs = await getAssetPairs();
        
        // Filter to common USD pairs
        const usdPairs = Object.entries(pairs)
          .filter(([key]) => key.endsWith('USD') || key.endsWith('ZUSD'))
          .map(([key, value]: [string, any]) => ({
            pair: key,
            base: value.base,
            quote: value.quote,
            wsname: value.wsname,
            lot_decimals: value.lot_decimals,
            pair_decimals: value.pair_decimals,
            margin_call: value.margin_call,
            margin_stop: value.margin_stop,
          }));
        
        return new Response(JSON.stringify({ pairs: usdPairs }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'place-order': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405, 
            headers: corsHeaders 
          });
        }

        const { book_id, pair, type, ordertype, volume, price, leverage, strategy_id } = body;

        if (!pair || !type || !ordertype || !volume) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        // Check global settings
        const { data: settings } = await supabase
          .from('global_settings')
          .select('global_kill_switch, paper_trading_mode')
          .single();

        if (settings?.global_kill_switch) {
          return new Response(JSON.stringify({ error: 'Trading halted - kill switch active' }), { 
            status: 403, 
            headers: corsHeaders 
          });
        }

        const isPaperMode = settings?.paper_trading_mode ?? true;
        const startTime = Date.now();

        let orderResult: any;
        let mode: 'live' | 'simulation' = 'simulation';

        // Get current price for simulation
        let currentPrice = 0;
        try {
          const ticker = await getTicker(pair);
          const pairData = ticker[Object.keys(ticker)[0]];
          currentPrice = parseFloat(pairData.c[0]);
        } catch {
          currentPrice = parseFloat(price || '0');
        }

        if (!isPaperMode && credentials) {
          try {
            orderResult = await placeOrder(credentials, {
              pair,
              type,
              ordertype,
              volume,
              price,
              leverage,
            });
            mode = 'live';
            console.log('Live Kraken order placed:', orderResult);
          } catch (error) {
            console.error('Kraken order error:', error);
            mode = 'simulation';
          }
        }

        // Simulate fill
        const latencyMs = Date.now() - startTime;
        const slippageBps = ordertype === 'market' ? Math.random() * 8 : 0;
        const slippage = currentPrice * (slippageBps / 10000) * (type === 'buy' ? 1 : -1);
        const fillPrice = currentPrice + slippage;
        const fee = parseFloat(volume) * fillPrice * 0.0026; // Kraken ~0.26% taker fee

        const orderId = orderResult?.txid?.[0] || crypto.randomUUID();

        // Record order
        if (book_id) {
          await supabase.from('orders').insert({
            id: orderId,
            book_id,
            strategy_id: strategy_id || null,
            instrument: pair,
            side: type,
            size: parseFloat(volume),
            price: currentPrice,
            status: mode === 'live' ? 'open' : 'filled',
            filled_size: parseFloat(volume),
            filled_price: fillPrice,
            slippage: slippageBps,
            latency_ms: latencyMs,
          });

          await supabase.from('fills').insert({
            order_id: orderId,
            instrument: pair,
            side: type,
            size: parseFloat(volume),
            price: fillPrice,
            fee,
          });

          await supabase.from('audit_events').insert({
            action: 'kraken_order_placed',
            resource_type: 'order',
            resource_id: orderId,
            book_id,
            after_state: { order: orderResult, mode, venue: 'kraken' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          order_id: orderId,
          mode,
          venue: 'kraken',
          filled_price: fillPrice,
          filled_size: parseFloat(volume),
          fee,
          latency_ms: latencyMs,
          slippage_bps: slippageBps,
          message: mode === 'live' 
            ? 'Order submitted to Kraken' 
            : 'Order simulated (paper trading mode)',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'orders': {
        if (!credentials) {
          return new Response(JSON.stringify({ 
            error: 'Credentials not configured',
            orders: {} 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const orders = await getOpenOrders(credentials);
        
        return new Response(JSON.stringify(orders), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'cancel-order': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405, 
            headers: corsHeaders 
          });
        }

        if (!credentials) {
          return new Response(JSON.stringify({ error: 'Credentials not configured' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        const { txid } = body;
        if (!txid) {
          return new Response(JSON.stringify({ error: 'Missing txid' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        const result = await cancelOrder(credentials, txid);
        
        return new Response(JSON.stringify({ success: true, result }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'staking': {
        if (!credentials) {
          return new Response(JSON.stringify({ error: 'Credentials not configured' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        try {
          const stakingAssets = await getStakingAssets(credentials);
          return new Response(JSON.stringify({ assets: stakingAssets }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Staking not available' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }
      }

      default:
        return new Response(JSON.stringify({ 
          error: 'Not found',
          available_endpoints: [
            'status',
            'balances',
            'ticker',
            'orderbook',
            'pairs',
            'place-order',
            'orders',
            'cancel-order',
            'staking',
          ],
        }), { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error('Kraken trading error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
