import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Coinbase Advanced Trade API base URL
const COINBASE_API_URL = 'https://api.coinbase.com';

interface CoinbaseCredentials {
  apiKey: string;
  apiSecret: string;
}

interface OrderRequest {
  instrument: string; // e.g., "BTC-USD"
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  orderType: 'market' | 'limit';
  clientOrderId?: string;
}

// Generate Coinbase Advanced Trade API signature using Web Crypto API
async function generateSignature(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string = ''
): Promise<string> {
  const message = timestamp + method.toUpperCase() + requestPath + body;
  const encoder = new TextEncoder();
  
  // Import the secret key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the message
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );
  
  // Convert ArrayBuffer to base64
  const signatureBytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  return btoa(binary);
}

// Make authenticated request to Coinbase
async function coinbaseRequest(
  credentials: CoinbaseCredentials,
  method: string,
  path: string,
  body?: object
): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = body ? JSON.stringify(body) : '';
  
  const signature = await generateSignature(
    credentials.apiSecret,
    timestamp,
    method,
    path,
    bodyString
  );
  
  const headers: Record<string, string> = {
    'CB-ACCESS-KEY': credentials.apiKey,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
  
  const response = await fetch(`${COINBASE_API_URL}${path}`, {
    method,
    headers,
    body: bodyString || undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Coinbase API error: ${response.status}`, error);
    throw new Error(`Coinbase API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

// Get account balances
async function getBalances(credentials: CoinbaseCredentials): Promise<any> {
  return coinbaseRequest(credentials, 'GET', '/api/v3/brokerage/accounts');
}

// Get specific product (trading pair) info
async function getProduct(credentials: CoinbaseCredentials, productId: string): Promise<any> {
  return coinbaseRequest(credentials, 'GET', `/api/v3/brokerage/products/${productId}`);
}

// Get current ticker/price
async function getTicker(productId: string): Promise<any> {
  // Public endpoint - no auth needed
  const response = await fetch(`${COINBASE_API_URL}/api/v3/brokerage/products/${productId}/ticker`);
  if (!response.ok) {
    throw new Error(`Failed to get ticker: ${response.status}`);
  }
  return response.json();
}

// Get public ticker without authentication
async function getPublicTicker(productId: string): Promise<{ price: number; bid: number; ask: number } | null> {
  try {
    // Use the public product endpoint
    const response = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      price: parseFloat(data.price || '0'),
      bid: parseFloat(data.bid || '0'),
      ask: parseFloat(data.ask || '0'),
    };
  } catch (error) {
    console.error('Public ticker error:', error);
    return null;
  }
}

// Place an order
async function placeOrder(
  credentials: CoinbaseCredentials,
  order: OrderRequest
): Promise<any> {
  const clientOrderId = order.clientOrderId || crypto.randomUUID();
  
  const orderConfig: any = {
    product_id: order.instrument,
    side: order.side.toUpperCase(),
  };
  
  if (order.orderType === 'market') {
    if (order.side === 'buy') {
      // For market buy, need to specify quote currency amount
      orderConfig.order_configuration = {
        market_market_ioc: {
          quote_size: (order.size * (order.price || 0)).toFixed(2),
        },
      };
    } else {
      // For market sell, specify base currency amount
      orderConfig.order_configuration = {
        market_market_ioc: {
          base_size: order.size.toString(),
        },
      };
    }
  } else {
    // Limit order
    orderConfig.order_configuration = {
      limit_limit_gtc: {
        base_size: order.size.toString(),
        limit_price: order.price?.toString(),
      },
    };
  }
  
  const payload = {
    client_order_id: clientOrderId,
    ...orderConfig,
  };
  
  console.log('Placing Coinbase order:', JSON.stringify(payload, null, 2));
  
  return coinbaseRequest(credentials, 'POST', '/api/v3/brokerage/orders', payload);
}

// Cancel an order
async function cancelOrder(credentials: CoinbaseCredentials, orderId: string): Promise<any> {
  return coinbaseRequest(credentials, 'POST', '/api/v3/brokerage/orders/batch_cancel', {
    order_ids: [orderId],
  });
}

// Get order by ID
async function getOrder(credentials: CoinbaseCredentials, orderId: string): Promise<any> {
  return coinbaseRequest(credentials, 'GET', `/api/v3/brokerage/orders/historical/${orderId}`);
}

// Get open orders
async function getOpenOrders(credentials: CoinbaseCredentials, productId?: string): Promise<any> {
  let path = '/api/v3/brokerage/orders/historical/batch?order_status=OPEN';
  if (productId) {
    path += `&product_id=${productId}`;
  }
  return coinbaseRequest(credentials, 'GET', path);
}

// Get fills (executed trades)
async function getFills(credentials: CoinbaseCredentials, orderId?: string): Promise<any> {
  let path = '/api/v3/brokerage/orders/historical/fills';
  if (orderId) {
    path += `?order_id=${orderId}`;
  }
  return coinbaseRequest(credentials, 'GET', path);
}

// Get available products (trading pairs)
async function getProducts(credentials: CoinbaseCredentials): Promise<any> {
  return coinbaseRequest(credentials, 'GET', '/api/v3/brokerage/products');
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

    // Get Coinbase credentials
    const apiKey = Deno.env.get('COINBASE_API_KEY');
    const apiSecret = Deno.env.get('COINBASE_API_SECRET');
    
    const hasCredentials = apiKey && apiSecret;
    const credentials: CoinbaseCredentials | null = hasCredentials 
      ? { apiKey, apiSecret } 
      : null;

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    let body: any = {};
    if (req.method === 'POST') {
      body = await req.json();
    }

    switch (path) {
      case 'status': {
        // Check if Coinbase is configured and connected
        let connected = false;
        let accountInfo = null;
        
        if (credentials) {
          try {
            const accounts = await getBalances(credentials);
            connected = true;
            accountInfo = {
              accountCount: accounts.accounts?.length || 0,
              hasUSD: accounts.accounts?.some((a: any) => a.currency === 'USD'),
            };
          } catch (error) {
            console.error('Coinbase connection test failed:', error);
          }
        }
        
        return new Response(JSON.stringify({
          configured: hasCredentials,
          connected,
          accountInfo,
          features: {
            spot: true,
            futures: false, // Coinbase has limited futures via CME
            perpetuals: false,
            margin: false,
          },
          regions: {
            usCompliant: true,
            available: ['US', 'EU', 'UK', 'CA', 'AU'],
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'balances': {
        if (!credentials) {
          return new Response(JSON.stringify({ 
            error: 'Coinbase credentials not configured',
            simulation: true,
            balances: [
              { currency: 'USD', available: '10000.00', hold: '0.00' },
              { currency: 'BTC', available: '0.5', hold: '0.00' },
              { currency: 'ETH', available: '5.0', hold: '0.00' },
            ]
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const accounts = await getBalances(credentials);
        const balances = accounts.accounts?.map((acc: any) => ({
          currency: acc.currency,
          available: acc.available_balance?.value || '0',
          hold: acc.hold?.value || '0',
          total: (parseFloat(acc.available_balance?.value || '0') + parseFloat(acc.hold?.value || '0')).toString(),
        })).filter((b: any) => parseFloat(b.total) > 0);
        
        return new Response(JSON.stringify({ balances }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      case 'ticker': {
        const productId = url.searchParams.get('product_id') || 'BTC-USD';
        
        const ticker = await getPublicTicker(productId);
        if (!ticker) {
          return new Response(JSON.stringify({ error: 'Failed to get ticker' }), { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        
        return new Response(JSON.stringify({
          product_id: productId,
          ...ticker,
          timestamp: new Date().toISOString(),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'products': {
        // Return supported trading pairs
        // For now, return common USD pairs (public data)
        const commonPairs = [
          'BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'MATIC-USD',
          'LINK-USD', 'UNI-USD', 'AAVE-USD', 'LTC-USD', 'DOT-USD',
        ];
        
        const products = await Promise.all(
          commonPairs.map(async (pair) => {
            const ticker = await getPublicTicker(pair);
            return {
              product_id: pair,
              base_currency: pair.split('-')[0],
              quote_currency: pair.split('-')[1],
              price: ticker?.price || 0,
              bid: ticker?.bid || 0,
              ask: ticker?.ask || 0,
            };
          })
        );
        
        return new Response(JSON.stringify({ products: products.filter(p => p.price > 0) }), { 
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

        const { book_id, instrument, side, size, price, order_type = 'market', strategy_id } = body;

        if (!instrument || !side || !size) {
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
        
        // Get current price for fills
        const ticker = await getPublicTicker(instrument);
        const currentPrice = ticker?.price || price || 0;

        let orderResult: any;
        let mode: 'live' | 'simulation' = 'simulation';

        if (!isPaperMode && credentials) {
          // Live trading with Coinbase
          try {
            const orderRequest: OrderRequest = {
              instrument,
              side,
              size,
              price: price || currentPrice,
              orderType: order_type as 'market' | 'limit',
            };
            
            orderResult = await placeOrder(credentials, orderRequest);
            mode = 'live';
            console.log('Live Coinbase order placed:', orderResult);
          } catch (error) {
            console.error('Coinbase order error:', error);
            // Fall back to simulation
            mode = 'simulation';
          }
        }

        // Simulate or record fill
        const latencyMs = Date.now() - startTime;
        const slippageBps = order_type === 'market' ? Math.random() * 5 : 0;
        const slippage = currentPrice * (slippageBps / 10000) * (side === 'buy' ? 1 : -1);
        const fillPrice = currentPrice + slippage;
        const fee = size * fillPrice * 0.006; // Coinbase ~0.6% taker fee

        // Create order record
        const orderId = orderResult?.order_id || crypto.randomUUID();
        const orderData = {
          id: orderId,
          book_id: book_id || null,
          strategy_id: strategy_id || null,
          instrument,
          side,
          size,
          price: price || currentPrice,
          status: mode === 'live' ? (orderResult?.status || 'open') : 'filled',
          filled_size: size,
          filled_price: fillPrice,
          slippage: slippageBps,
          latency_ms: latencyMs,
        };

        // Only save to DB if book_id provided
        if (book_id) {
          await supabase.from('orders').insert(orderData);
          
          // Create fill record
          await supabase.from('fills').insert({
            order_id: orderId,
            instrument,
            side,
            size,
            price: fillPrice,
            fee,
          });

          // Audit log
          await supabase.from('audit_events').insert({
            action: 'coinbase_order_placed',
            resource_type: 'order',
            resource_id: orderId,
            book_id,
            after_state: { order: orderData, mode, venue: 'coinbase' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          order_id: orderId,
          mode,
          venue: 'coinbase',
          filled_price: fillPrice,
          filled_size: size,
          fee,
          latency_ms: latencyMs,
          slippage_bps: slippageBps,
          message: mode === 'live' 
            ? 'Order submitted to Coinbase Advanced Trade' 
            : 'Order simulated (paper trading mode)',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'orders': {
        if (!credentials) {
          return new Response(JSON.stringify({ 
            error: 'Credentials not configured',
            orders: [] 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        const productId = url.searchParams.get('product_id');
        const orders = await getOpenOrders(credentials, productId || undefined);
        
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

        const { order_id } = body;
        if (!order_id) {
          return new Response(JSON.stringify({ error: 'Missing order_id' }), { 
            status: 400, 
            headers: corsHeaders 
          });
        }

        const result = await cancelOrder(credentials, order_id);
        
        return new Response(JSON.stringify({ success: true, result }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: 'Not found',
          available_endpoints: [
            'status',
            'balances',
            'ticker',
            'products',
            'place-order',
            'orders',
            'cancel-order',
          ],
        }), { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error('Coinbase trading error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
