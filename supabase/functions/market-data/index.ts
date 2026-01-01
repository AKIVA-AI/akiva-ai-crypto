import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Market Data Proxy Edge Function
 * 
 * Proxies requests to CoinGecko with in-memory caching to avoid rate limits
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
  high24h: number | null;
  low24h: number | null;
  bid: number;
  ask: number;
  timestamp: number;
}

interface CacheEntry {
  data: TickerData[];
  timestamp: number;
}

// In-memory cache with 30-second TTL
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30000; // 30 seconds

// Rate limit tracking
let lastApiCall = 0;
const MIN_API_INTERVAL_MS = 1500; // Minimum 1.5s between API calls

// Symbol to CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  // Major coins
  'BTC': 'bitcoin', 'BTCUSDT': 'bitcoin', 'BTCUSD': 'bitcoin',
  'ETH': 'ethereum', 'ETHUSDT': 'ethereum', 'ETHUSD': 'ethereum',
  'SOL': 'solana', 'SOLUSDT': 'solana', 'SOLUSD': 'solana',
  'BNB': 'binancecoin', 'BNBUSDT': 'binancecoin',
  'XRP': 'ripple', 'XRPUSDT': 'ripple',
  'ADA': 'cardano', 'ADAUSDT': 'cardano',
  'DOGE': 'dogecoin', 'DOGEUSDT': 'dogecoin',
  'AVAX': 'avalanche-2', 'AVAXUSDT': 'avalanche-2',
  'LINK': 'chainlink', 'LINKUSDT': 'chainlink',
  'MATIC': 'matic-network', 'MATICUSDT': 'matic-network',
  'DOT': 'polkadot', 'DOTUSDT': 'polkadot',
  'UNI': 'uniswap', 'UNIUSDT': 'uniswap',
  'ATOM': 'cosmos', 'ATOMUSDT': 'cosmos',
  'LTC': 'litecoin', 'LTCUSDT': 'litecoin',
  
  // Layer 2 & Scaling
  'ARB': 'arbitrum', 'ARBUSDT': 'arbitrum',
  'OP': 'optimism', 'OPUSDT': 'optimism',
  'IMX': 'immutable-x', 'IMXUSDT': 'immutable-x',
  'STRK': 'starknet', 'STRKUSDT': 'starknet',
  'MANTA': 'manta-network', 'MANTAUSDT': 'manta-network',
  'METIS': 'metis-token', 'METISUSDT': 'metis-token',
  'ZK': 'zksync', 'ZKUSDT': 'zksync',
  
  // DeFi
  'AAVE': 'aave', 'AAVEUSDT': 'aave',
  'CRV': 'curve-dao-token', 'CRVUSDT': 'curve-dao-token',
  'MKR': 'maker', 'MKRUSDT': 'maker',
  'SNX': 'havven', 'SNXUSDT': 'havven',
  'COMP': 'compound-governance-token', 'COMPUSDT': 'compound-governance-token',
  'SUSHI': 'sushi', 'SUSHIUSDT': 'sushi',
  '1INCH': '1inch', '1INCHUSDT': '1inch',
  'LDO': 'lido-dao', 'LDOUSDT': 'lido-dao',
  'RPL': 'rocket-pool', 'RPLUSDT': 'rocket-pool',
  'GMX': 'gmx', 'GMXUSDT': 'gmx',
  'DYDX': 'dydx-chain', 'DYDXUSDT': 'dydx-chain',
  'PENDLE': 'pendle', 'PENDLEUSDT': 'pendle',
  
  // Infrastructure & Smart Contract Platforms
  'NEAR': 'near', 'NEARUSDT': 'near',
  'FTM': 'fantom', 'FTMUSDT': 'fantom',
  'ALGO': 'algorand', 'ALGOUSDT': 'algorand',
  'ICP': 'internet-computer', 'ICPUSDT': 'internet-computer',
  'FIL': 'filecoin', 'FILUSDT': 'filecoin',
  'HBAR': 'hedera-hashgraph', 'HBARUSDT': 'hedera-hashgraph',
  'VET': 'vechain', 'VETUSDT': 'vechain',
  'APT': 'aptos', 'APTUSDT': 'aptos',
  'SUI': 'sui', 'SUIUSDT': 'sui',
  'SEI': 'sei-network', 'SEIUSDT': 'sei-network',
  'INJ': 'injective-protocol', 'INJUSDT': 'injective-protocol',
  'TIA': 'celestia', 'TIAUSDT': 'celestia',
  'STX': 'blockstack', 'STXUSDT': 'blockstack',
  
  // Gaming & Metaverse
  'SAND': 'the-sandbox', 'SANDUSDT': 'the-sandbox',
  'MANA': 'decentraland', 'MANAUSDT': 'decentraland',
  'AXS': 'axie-infinity', 'AXSUSDT': 'axie-infinity',
  'GALA': 'gala', 'GALAUSDT': 'gala',
  'ENJ': 'enjincoin', 'ENJUSDT': 'enjincoin',
  'RONIN': 'ronin', 'RONINUSDT': 'ronin',
  'BEAM': 'beam-2', 'BEAMUSDT': 'beam-2',
  
  // Meme Coins
  'SHIB': 'shiba-inu', 'SHIBUSDT': 'shiba-inu',
  'PEPE': 'pepe', 'PEPEUSDT': 'pepe',
  'FLOKI': 'floki', 'FLOKIUSDT': 'floki',
  'BONK': 'bonk', 'BONKUSDT': 'bonk',
  'WIF': 'dogwifcoin', 'WIFUSDT': 'dogwifcoin',
  
  // AI & Compute
  'FET': 'fetch-ai', 'FETUSDT': 'fetch-ai',
  'RNDR': 'render-token', 'RNDRUSDT': 'render-token',
  'AGIX': 'singularitynet', 'AGIXUSDT': 'singularitynet',
  'TAO': 'bittensor', 'TAOUSDT': 'bittensor',
  'AR': 'arweave', 'ARUSDT': 'arweave',
  'OCEAN': 'ocean-protocol', 'OCEANUSDT': 'ocean-protocol',
  
  // Oracles & Data
  'PYTH': 'pyth-network', 'PYTHUSDT': 'pyth-network',
  'API3': 'api3', 'API3USDT': 'api3',
  'BAND': 'band-protocol', 'BANDUSDT': 'band-protocol',
  
  // Privacy
  'XMR': 'monero', 'XMRUSDT': 'monero',
  'ZEC': 'zcash', 'ZECUSDT': 'zcash',
  
  // Exchange Tokens
  'OKB': 'okb', 'OKBUSDT': 'okb',
  'CRO': 'crypto-com-chain', 'CROUSDT': 'crypto-com-chain',
  'LEO': 'leo-token', 'LEOUSDT': 'leo-token',
  
  // Stablecoins (for reference)
  'USDT': 'tether', 'USDC': 'usd-coin', 'DAI': 'dai',
};

function getCoingeckoId(symbol: string): string | null {
  const clean = symbol.replace('-', '').replace('/', '').toUpperCase();
  return COINGECKO_IDS[clean] || null;
}

function getCacheKey(coinIds: string[]): string {
  return [...coinIds].sort().join(',');
}

function getFromCache(coinIds: string[]): TickerData[] | null {
  const key = getCacheKey(coinIds);
  const entry = cache.get(key);
  
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    console.log(`[MarketData] Cache hit for ${key}`);
    return entry.data;
  }
  
  return null;
}

function setCache(coinIds: string[], data: TickerData[]): void {
  const key = getCacheKey(coinIds);
  cache.set(key, { data, timestamp: Date.now() });
  
  // Clean old entries (keep cache small)
  if (cache.size > 50) {
    const oldest = [...cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 25);
    oldest.forEach(([k]) => cache.delete(k));
  }
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < MIN_API_INTERVAL_MS) {
    const waitTime = MIN_API_INTERVAL_MS - timeSinceLastCall;
    console.log(`[MarketData] Rate limiting: waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCall = Date.now();
  return fetch(url, { headers: { 'Accept': 'application/json' } });
}

// Fetch detailed data from CoinGecko markets endpoint with caching
async function fetchDetailedFromCoinGecko(coinIds: string[]): Promise<TickerData[]> {
  // Check cache first
  const cached = getFromCache(coinIds);
  if (cached) {
    return cached;
  }
  
  const ids = coinIds.join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  
  console.log(`[MarketData] CoinGecko markets fetch: ${url}`);
  const response = await rateLimitedFetch(url);
  
  if (!response.ok) {
    // On rate limit, try to return stale cache data
    if (response.status === 429) {
      const key = getCacheKey(coinIds);
      const staleEntry = cache.get(key);
      if (staleEntry) {
        console.log(`[MarketData] Rate limited, returning stale cache data`);
        return staleEntry.data;
      }
    }
    throw new Error(`CoinGecko markets API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  const tickers = data.map((coin: any) => {
    const symbol = Object.entries(COINGECKO_IDS).find(([_, v]) => v === coin.id)?.[0] || coin.symbol.toUpperCase();
    return {
      symbol: symbol.includes('USDT') ? symbol : `${symbol}USDT`,
      price: coin.current_price || 0,
      change24h: coin.price_change_percentage_24h || 0,
      volume24h: coin.total_volume || 0,
      high24h: coin.high_24h || coin.current_price,
      low24h: coin.low_24h || coin.current_price,
      bid: coin.current_price * 0.999,
      ask: coin.current_price * 1.001,
      timestamp: new Date(coin.last_updated).getTime(),
    };
  });
  
  // Store in cache
  setCache(coinIds, tickers);
  
  return tickers;
}

// Fetch from CoinGecko simple price endpoint (lighter, for single prices)
async function fetchFromCoinGecko(coinIds: string[]): Promise<TickerData[]> {
  const cached = getFromCache(coinIds);
  if (cached) {
    return cached;
  }
  
  const ids = coinIds.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
  
  console.log(`[MarketData] CoinGecko simple fetch: ${url}`);
  const response = await rateLimitedFetch(url);
  
  if (!response.ok) {
    if (response.status === 429) {
      const key = getCacheKey(coinIds);
      const staleEntry = cache.get(key);
      if (staleEntry) {
        console.log(`[MarketData] Rate limited, returning stale cache data`);
        return staleEntry.data;
      }
    }
    throw new Error(`CoinGecko API error: ${response.status}`);
  }
  
  const data = await response.json();
  const tickers: TickerData[] = [];
  
  for (const [id, info] of Object.entries(data)) {
    const coinInfo = info as any;
    const symbol = Object.entries(COINGECKO_IDS).find(([_, v]) => v === id)?.[0] || id.toUpperCase();
    
    tickers.push({
      symbol: symbol.includes('USDT') ? symbol : `${symbol}USDT`,
      price: coinInfo.usd || 0,
      change24h: coinInfo.usd_24h_change || 0,
      volume24h: coinInfo.usd_24h_vol || 0,
      high24h: null,
      low24h: null,
      bid: coinInfo.usd * 0.999,
      ask: coinInfo.usd * 1.001,
      timestamp: (coinInfo.last_updated_at || Math.floor(Date.now() / 1000)) * 1000,
    });
  }
  
  setCache(coinIds, tickers);
  return tickers;
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

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
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
      if ((path === 'market-data' || path === 'v1') && body.symbols) {
        path = 'ticker';
      } else if ((path === 'market-data' || path === 'v1') && body.symbol) {
        path = 'price';
      }
    }

    console.log(`[MarketData] Request: ${req.method} path=${path}`);

    switch (path) {
      case 'ticker': {
        const symbolsParam = url.searchParams.get('symbols') || body.symbols as string;
        if (!symbolsParam) {
          return new Response(JSON.stringify({ error: 'symbols parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase());
        
        // Map to CoinGecko IDs
        const coinIds = symbols
          .map(s => getCoingeckoId(s))
          .filter((id): id is string => id !== null);
        
        if (coinIds.length === 0) {
          const mockTickers = symbols.map(s => ({
            symbol: s,
            price: 0,
            change24h: 0,
            volume24h: 0,
            high24h: null,
            low24h: null,
            bid: 0,
            ask: 0,
            timestamp: Date.now(),
          }));
          
          return new Response(JSON.stringify({ 
            tickers: mockTickers,
            source: 'mock',
            latencyMs: Date.now() - startTime,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const tickers = await fetchDetailedFromCoinGecko([...new Set(coinIds)]);
        const latency = Date.now() - startTime;
        
        await logMetric(supabase, 'market-data', 'ticker', latency, true, undefined, { 
          symbolCount: symbols.length,
          source: 'coingecko'
        });

        return new Response(JSON.stringify({ 
          tickers,
          source: 'coingecko',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'price': {
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const coinId = getCoingeckoId(symbol);
        if (!coinId) {
          return new Response(JSON.stringify({
            symbol: symbol.toUpperCase(),
            price: 0,
            timestamp: Date.now(),
            source: 'mock',
            latencyMs: Date.now() - startTime,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const tickers = await fetchFromCoinGecko([coinId]);
        const ticker = tickers[0];
        const latency = Date.now() - startTime;
        
        await logMetric(supabase, 'market-data', 'price', latency, true);

        return new Response(JSON.stringify({
          symbol: ticker?.symbol || symbol.toUpperCase(),
          price: ticker?.price || 0,
          timestamp: Date.now(),
          source: 'coingecko',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'orderbook': {
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const coinId = getCoingeckoId(symbol);
        let price = 0;
        
        if (coinId) {
          const tickers = await fetchFromCoinGecko([coinId]);
          price = tickers[0]?.price || 0;
        }

        const latency = Date.now() - startTime;
        
        const bids = [];
        const asks = [];
        for (let i = 0; i < 10; i++) {
          bids.push({ price: price * (1 - 0.001 * (i + 1)), size: Math.random() * 10 });
          asks.push({ price: price * (1 + 0.001 * (i + 1)), size: Math.random() * 10 });
        }
        
        await logMetric(supabase, 'market-data', 'orderbook', latency, true, undefined, { symbol });

        return new Response(JSON.stringify({
          symbol: symbol.toUpperCase(),
          bids,
          asks,
          timestamp: Date.now(),
          source: 'simulated',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'klines': {
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        const interval = url.searchParams.get('interval') || '1h';
        
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const coinId = getCoingeckoId(symbol);
        if (!coinId) {
          return new Response(JSON.stringify({
            symbol: symbol.toUpperCase(),
            interval,
            candles: [],
            source: 'mock',
            latencyMs: Date.now() - startTime,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const daysMap: Record<string, number> = {
          '1m': 1, '5m': 1, '15m': 1, '30m': 1, '1h': 1,
          '4h': 7, '1d': 30, '1w': 90
        };
        const days = daysMap[interval] || 1;

        const chartUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
        console.log(`[MarketData] CoinGecko chart fetch: ${chartUrl}`);
        
        const response = await rateLimitedFetch(chartUrl);
        if (!response.ok) {
          throw new Error(`CoinGecko chart API error: ${response.status}`);
        }

        const data = await response.json();
        const latency = Date.now() - startTime;
        
        const prices = data.prices || [];
        const candles = prices.map((p: [number, number], i: number) => {
          const price = p[1];
          const prevPrice = prices[i - 1]?.[1] || price;
          return {
            time: p[0],
            open: prevPrice,
            high: Math.max(price, prevPrice) * 1.001,
            low: Math.min(price, prevPrice) * 0.999,
            close: price,
            volume: (data.total_volumes?.[i]?.[1] || 0) / prices.length,
          };
        });

        await logMetric(supabase, 'market-data', 'klines', latency, true, undefined, { symbol, interval });

        return new Response(JSON.stringify({
          symbol: symbol.toUpperCase(),
          interval,
          candles,
          source: 'coingecko',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'health': {
        return new Response(JSON.stringify({
          status: 'healthy',
          cacheSize: cache.size,
          latencyMs: Date.now() - startTime,
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
            ticker: 'POST with body { symbols: "BTCUSDT,ETHUSDT" }',
            price: 'POST with body { symbol: "BTCUSDT" }',
            orderbook: 'GET /orderbook?symbol=BTCUSDT&limit=20',
            klines: 'GET /klines?symbol=BTCUSDT&interval=1h&limit=100',
          }
        }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('[MarketData] Error:', error);
    const latency = Date.now() - startTime;
    
    await logMetric(supabase, 'market-data', 'error', latency, false, String(error));

    return new Response(JSON.stringify({ 
      error: String(error),
      latencyMs: latency,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
