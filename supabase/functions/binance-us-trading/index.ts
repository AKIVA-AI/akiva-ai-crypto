import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BINANCE_US_BASE_URL = 'https://api.binance.us';

// Generate HMAC-SHA256 signature for authenticated requests
async function generateSignature(queryString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Make authenticated request to Binance.US
async function binanceRequest(
  endpoint: string,
  method: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, string> = {}
): Promise<any> {
  const timestamp = Date.now().toString();
  params.timestamp = timestamp;
  
  const queryString = new URLSearchParams(params).toString();
  const signature = await generateSignature(queryString, apiSecret);
  const signedQuery = `${queryString}&signature=${signature}`;
  
  const url = `${BINANCE_US_BASE_URL}${endpoint}?${signedQuery}`;
  
  const response = await fetch(url, {
    method,
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();

    // Mark common auth/permission failures explicitly so we can fall back to simulation.
    if (error.includes('"code":-2015') || error.includes('Invalid API-key')) {
      throw new Error(`BINANCE_US_AUTH_ERROR:${error}`);
    }

    throw new Error(`Binance.US API error: ${error}`);
  }
  
  return response.json();
}

// Public endpoint (no auth required)
async function publicRequest(endpoint: string): Promise<any> {
  const response = await fetch(`${BINANCE_US_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Binance.US public API error: ${response.statusText}`);
  }
  return response.json();
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isBinanceUsAuthError(err: unknown): boolean {
  const msg = getErrorMessage(err);
  return msg.startsWith('BINANCE_US_AUTH_ERROR:') || msg.includes('"code":-2015') || msg.includes('Invalid API-key');
}

async function binanceAuthOrSimulate<T extends Record<string, any>>(
  hasCredentials: boolean,
  simulatedResult: T,
  fn: () => Promise<T>
): Promise<T> {
  if (!hasCredentials) return simulatedResult;

  try {
    return await fn();
  } catch (err) {
    if (isBinanceUsAuthError(err)) {
      const msg = getErrorMessage(err).replace(/^BINANCE_US_AUTH_ERROR:/, '');
      console.warn('[Binance.US] Auth error, falling back to simulation:', msg);
      return { ...simulatedResult, simulated: true, authError: true, warning: msg };
    }

    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('BINANCE_US_API_KEY');
    const apiSecret = Deno.env.get('BINANCE_US_API_SECRET');
    
    const { action, params = {} } = await req.json();
    console.log(`[Binance.US] Action: ${action}`, params);

    let result;
    const hasCredentials = Boolean(apiKey && apiSecret);

    switch (action) {
      // ========== PUBLIC ENDPOINTS ==========
      case 'ticker':
        result = await publicRequest(`/api/v3/ticker/24hr${params.symbol ? `?symbol=${params.symbol}` : ''}`);
        break;

      case 'orderbook':
        if (!params.symbol) throw new Error('Symbol required for orderbook');
        result = await publicRequest(`/api/v3/depth?symbol=${params.symbol}&limit=${params.limit || 20}`);
        break;

      case 'price':
        result = await publicRequest(`/api/v3/ticker/price${params.symbol ? `?symbol=${params.symbol}` : ''}`);
        break;

      case 'exchange_info':
        result = await publicRequest('/api/v3/exchangeInfo');
        break;

      case 'klines':
        if (!params.symbol) throw new Error('Symbol required for klines');
        result = await publicRequest(
          `/api/v3/klines?symbol=${params.symbol}&interval=${params.interval || '1h'}&limit=${params.limit || 100}`
        );
        break;

      // ========== AUTHENTICATED ENDPOINTS ==========
      case 'account': {
        const simulatedAccount = {
          simulated: true,
          balances: [
            { asset: 'BTC', free: '0.5', locked: '0.1' },
            { asset: 'ETH', free: '5.0', locked: '0.0' },
            { asset: 'USD', free: '10000.00', locked: '500.00' },
            { asset: 'USDT', free: '5000.00', locked: '0.00' },
          ],
          canTrade: true,
          canWithdraw: true,
          canDeposit: true,
        };

        result = await binanceAuthOrSimulate(hasCredentials, simulatedAccount, () =>
          binanceRequest('/api/v3/account', 'GET', apiKey!, apiSecret!)
        );
        break;
      }

      case 'open_orders': {
        const simulatedOrders = { simulated: true, orders: [] as any[] };
        result = await binanceAuthOrSimulate(hasCredentials, simulatedOrders, async () => {
          const orderParams: Record<string, string> = {};
          if (params.symbol) orderParams.symbol = params.symbol;
          return await binanceRequest('/api/v3/openOrders', 'GET', apiKey!, apiSecret!, orderParams);
        });
        break;
      }

      case 'all_orders': {
        const simulatedOrders = { simulated: true, orders: [] as any[] };
        result = await binanceAuthOrSimulate(hasCredentials, simulatedOrders, async () => {
          if (!params.symbol) throw new Error('Symbol required for all_orders');
          return await binanceRequest('/api/v3/allOrders', 'GET', apiKey!, apiSecret!, { symbol: params.symbol });
        });
        break;
      }

      case 'place_order': {
        const simulatedOrder = {
          simulated: true,
          orderId: `sim_${Date.now()}`,
          symbol: params.symbol,
          side: params.side,
          type: params.type || 'LIMIT',
          quantity: params.quantity,
          price: params.price,
          status: 'SIMULATED',
          message: 'Order simulated - configure API keys for live trading',
        };

        result = await binanceAuthOrSimulate(hasCredentials, simulatedOrder, async () => {
          const orderParams: Record<string, string> = {
            symbol: params.symbol,
            side: params.side.toUpperCase(),
            type: params.type?.toUpperCase() || 'LIMIT',
            quantity: params.quantity.toString(),
          };

          if (params.type === 'LIMIT' || !params.type) {
            orderParams.timeInForce = params.timeInForce || 'GTC';
            orderParams.price = params.price.toString();
          }

          if (params.stopPrice) {
            orderParams.stopPrice = params.stopPrice.toString();
          }

          return await binanceRequest('/api/v3/order', 'POST', apiKey!, apiSecret!, orderParams);
        });
        break;
      }

      case 'cancel_order': {
        const simulatedCancel = { simulated: true, status: 'CANCELED', orderId: params.orderId };
        result = await binanceAuthOrSimulate(hasCredentials, simulatedCancel, async () => {
          if (!params.symbol || !params.orderId) throw new Error('Symbol and orderId required');
          return await binanceRequest('/api/v3/order', 'DELETE', apiKey!, apiSecret!, {
            symbol: params.symbol,
            orderId: params.orderId,
          });
        });
        break;
      }

      case 'my_trades': {
        const simulatedTrades = { simulated: true, trades: [] as any[] };
        result = await binanceAuthOrSimulate(hasCredentials, simulatedTrades, async () => {
          if (!params.symbol) throw new Error('Symbol required for my_trades');
          return await binanceRequest('/api/v3/myTrades', 'GET', apiKey!, apiSecret!, { symbol: params.symbol });
        });
        break;
      }

      case 'status':
        result = {
          configured: hasCredentials,
          exchange: 'Binance.US',
          usCompliant: true,
          capabilities: {
            spot: true,
            futures: false,
            perpetuals: false,
            margin: false,
            staking: true,
          },
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[Binance.US] Success: ${action}`);
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Binance.US] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
