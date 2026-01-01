import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Market Data Proxy Edge Function
 * 
 * Proxies requests to CoinGecko Pro API with in-memory caching
 * Uses Pro API for higher rate limits (500 calls/min vs 10-30 for free)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// API configuration
const COINGECKO_API_KEY = Deno.env.get('COINGECKO_API_KEY');
const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
const COINGECKO_BASE_URL = COINGECKO_API_KEY 
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

// Data quality flags for trading gate enforcement
type DataQuality = 'realtime' | 'delayed' | 'derived' | 'simulated' | 'unavailable';

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
  dataQuality: DataQuality;  // REQUIRED: Block trading on simulated data
}

interface CacheEntry {
  data: TickerData[];
  timestamp: number;
}

// In-memory cache with configurable TTL
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = COINGECKO_API_KEY ? 5000 : 15000; // 5s with Pro, 15s with free

// Request deduplication - prevent multiple in-flight requests for same data
const pendingRequests: Map<string, Promise<TickerData[]>> = new Map();

// Rate limit tracking
let lastApiCall = 0;
const MIN_API_INTERVAL_MS = COINGECKO_API_KEY ? 100 : 1000; // 100ms with Pro, 1s with free

console.log(`[MarketData] Cache TTL: ${CACHE_TTL_MS}ms, Min interval: ${MIN_API_INTERVAL_MS}ms`);
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
  'MATIC': 'polygon-ecosystem-token', 'MATICUSDT': 'polygon-ecosystem-token', // Note: MATIC was rebranded to POL
  'POL': 'polygon-ecosystem-token', 'POLUSDT': 'polygon-ecosystem-token',
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
  
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (COINGECKO_API_KEY) {
    headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
  }
  
  return fetch(url, { headers });
}

// Fetch detailed data from CoinGecko markets endpoint with caching and deduplication
async function fetchCoinGeckoTickers(coinIds: string[]): Promise<TickerData[]> {
  const cacheKey = getCacheKey(coinIds);
  
  // Check cache first
  const cached = getFromCache(coinIds);
  if (cached) {
    return cached;
  }
  
  // Check if request is already in flight (deduplication)
  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) {
    console.log(`[MarketData] Deduplicating request for ${cacheKey}`);
    return pendingRequest;
  }
  
  // Create the actual fetch promise
  const fetchPromise = (async () => {
    try {
      const ids = coinIds.join(',');
      const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
      
      console.log(`[MarketData] CoinGecko markets fetch: ${url.replace(COINGECKO_API_KEY || '', '***')}`);
      const response = await rateLimitedFetch(url);
      
      if (!response.ok) {
        // On rate limit, try to return stale cache data
        if (response.status === 429) {
          const staleEntry = cache.get(cacheKey);
          if (staleEntry) {
            console.log(`[MarketData] Rate limited, returning stale cache data`);
            return staleEntry.data;
          }
        }
        throw new Error(`CoinGecko markets API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const tickers: TickerData[] = data.map((coin: any) => {
        const symbol = Object.entries(COINGECKO_IDS).find(([_, v]) => v === coin.id)?.[0] || coin.symbol.toUpperCase();
        
        // Determine data quality based on data freshness
        const lastUpdated = new Date(coin.last_updated).getTime();
        const ageMs = Date.now() - lastUpdated;
        let dataQuality: DataQuality = 'realtime';
        if (ageMs > 60000) dataQuality = 'delayed';  // >1 minute old
        if (ageMs > 300000) dataQuality = 'derived'; // >5 minutes old
        
        return {
          symbol: symbol.includes('USDT') ? symbol : `${symbol}USDT`,
          price: coin.current_price || 0,
          change24h: coin.price_change_percentage_24h || 0,
          volume24h: coin.total_volume || 0,
          high24h: coin.high_24h || coin.current_price,
          low24h: coin.low_24h || coin.current_price,
          bid: coin.current_price * 0.999,
          ask: coin.current_price * 1.001,
          timestamp: lastUpdated,
          dataQuality,
        };
      });
      
      // Store in cache
      setCache(coinIds, tickers);
      return tickers;
    } finally {
      // Clean up pending request
      pendingRequests.delete(cacheKey);
    }
  })();
  
  // Store in pending requests for deduplication
  pendingRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// Fetch from CoinGecko simple price endpoint (lighter, for single prices)
async function fetchFromCoinGecko(coinIds: string[]): Promise<TickerData[]> {
  const cached = getFromCache(coinIds);
  if (cached) {
    return cached;
  }
  
  const ids = coinIds.join(',');
  const url = `${COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
  
  console.log(`[MarketData] CoinGecko simple fetch`);
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
    
    // Determine data quality based on data freshness
    const lastUpdatedAt = coinInfo.last_updated_at ? coinInfo.last_updated_at * 1000 : Date.now();
    const ageMs = Date.now() - lastUpdatedAt;
    let dataQuality: DataQuality = 'realtime';
    if (ageMs > 60000) dataQuality = 'delayed';
    if (ageMs > 300000) dataQuality = 'derived';
    
    tickers.push({
      symbol: symbol.includes('USDT') ? symbol : `${symbol}USDT`,
      price: coinInfo.usd || 0,
      change24h: coinInfo.usd_24h_change || 0,
      volume24h: coinInfo.usd_24h_vol || 0,
      high24h: null,
      low24h: null,
      bid: coinInfo.usd * 0.999,
      ask: coinInfo.usd * 1.001,
      timestamp: lastUpdatedAt,
      dataQuality,
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
      
      // For POST requests, check endpoint or infer from body params
      if (path === 'market-data' || path === 'v1') {
        if (body.endpoint) {
          path = body.endpoint as string;
        } else if (body.symbols) {
          path = 'ticker';
        } else if (body.symbol && body.interval) {
          path = 'klines';
        } else if (body.symbol) {
          path = 'price';
        }
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
          // Return simulated data with explicit quality flag
          // Trading systems MUST check dataQuality and reject simulated data
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
            dataQuality: 'simulated' as DataQuality,  // CRITICAL: Mark as simulated
          }));
          
          return new Response(JSON.stringify({ 
            tickers: mockTickers,
            source: 'mock',
            dataQuality: 'simulated',  // Top-level flag for easy checking
            tradingAllowed: false,     // Explicit: DO NOT TRADE on this data
            latencyMs: Date.now() - startTime,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const tickers = await fetchCoinGeckoTickers([...new Set(coinIds)]);
        const latency = Date.now() - startTime;
        
        await logMetric(supabase, 'market-data', 'ticker', latency, true, undefined, { 
          symbolCount: symbols.length,
          source: 'coingecko'
        });

        // Determine overall data quality (worst of all tickers)
        const overallQuality = tickers.some(t => t.dataQuality === 'simulated') ? 'simulated'
          : tickers.some(t => t.dataQuality === 'derived') ? 'derived'
          : tickers.some(t => t.dataQuality === 'delayed') ? 'delayed'
          : 'realtime';
        
        return new Response(JSON.stringify({ 
          tickers,
          source: 'coingecko',
          dataQuality: overallQuality,
          tradingAllowed: overallQuality !== 'simulated',  // Block trading on simulated
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
            dataQuality: 'simulated',
            tradingAllowed: false,
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
          dataQuality: ticker?.dataQuality || 'realtime',
          tradingAllowed: ticker?.dataQuality !== 'simulated',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'orderbook': {
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        const depth = parseInt(url.searchParams.get('depth') || body.depth as string || '10', 10);
        
        if (!symbol) {
          return new Response(JSON.stringify({ error: 'symbol parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const coinId = getCoingeckoId(symbol);
        let price = 0;
        let dataQuality: DataQuality = 'simulated';
        
        if (coinId) {
          const tickers = await fetchFromCoinGecko([coinId]);
          if (tickers[0] && tickers[0].price > 0) {
            price = tickers[0].price;
            dataQuality = 'derived'; // Orderbook derived from real price
          }
        }

        const latency = Date.now() - startTime;
        
        // Generate realistic orderbook spread based on price
        // ~0.1% spread for major coins is typical
        const spreadPercent = 0.001;
        const bids = [];
        const asks = [];
        
        for (let i = 0; i < depth; i++) {
          const bidPrice = price * (1 - spreadPercent * (i + 0.5));
          const askPrice = price * (1 + spreadPercent * (i + 0.5));
          // Varying sizes - larger near mid price
          const bidSize = (10 - i * 0.5) * (0.5 + Math.random() * 0.5);
          const askSize = (10 - i * 0.5) * (0.5 + Math.random() * 0.5);
          bids.push({ price: bidPrice, size: bidSize });
          asks.push({ price: askPrice, size: askSize });
        }
        
        await logMetric(supabase, 'market-data', 'orderbook', latency, true, undefined, { symbol });

        return new Response(JSON.stringify({
          symbol: symbol.toUpperCase(),
          bids,
          asks,
          timestamp: Date.now(),
          source: price > 0 ? 'coingecko' : 'simulated',
          dataQuality,
          tradingAllowed: dataQuality !== 'simulated',
          warning: dataQuality === 'simulated' 
            ? 'This is simulated orderbook data - DO NOT use for live trading'
            : 'Orderbook derived from market price - spread and depth are approximated',
          latencyMs: latency,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'klines': {
        const symbol = url.searchParams.get('symbol') || body.symbol as string;
        const interval = url.searchParams.get('interval') || body.interval as string || '1h';
        
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

        // CoinGecko OHLC endpoint supports: 1, 7, 14, 30, 90, 180, 365, max days
        // Map our timeframes to appropriate days parameter
        // NOTE: CoinGecko OHLC granularity depends on days:
        //   1-2 days = 30 min candles
        //   3-30 days = 4 hour candles  
        //   31+ days = 4 day candles
        const daysMap: Record<string, number> = {
          '1h': 1,    // Returns 30 min candles (close enough for 1h view)
          '4h': 14,   // Returns 4 hour candles
          '1d': 90,   // Returns 4 day candles, but more data points
          '1w': 180,  // Returns 4 day candles
        };
        const days = daysMap[interval] || 7;

        // Use OHLC endpoint for proper candlestick data
        const ohlcUrl = `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
        console.log(`[MarketData] CoinGecko OHLC fetch for ${symbol} (${interval}, ${days} days)`);
        
        const response = await rateLimitedFetch(ohlcUrl);
        if (!response.ok) {
          console.error(`[MarketData] CoinGecko OHLC API error: ${response.status}`);
          throw new Error(`CoinGecko OHLC API error: ${response.status}`);
        }

        const ohlcData = await response.json();
        const latency = Date.now() - startTime;
        
        // CoinGecko OHLC format: [timestamp, open, high, low, close]
        const candles = (ohlcData || []).map((c: [number, number, number, number, number]) => ({
          time: c[0],      // timestamp in ms
          open: c[1],      // open price
          high: c[2],      // high price
          low: c[3],       // low price
          close: c[4],     // close price
          volume: 0,       // CoinGecko OHLC doesn't include volume
        }));

        // Fetch volume data separately from market_chart endpoint
        try {
          const volumeUrl = `${COINGECKO_BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
          const volumeResponse = await rateLimitedFetch(volumeUrl);
          if (volumeResponse.ok) {
            const volumeData = await volumeResponse.json();
            const volumes = volumeData.total_volumes || [];
            
            // Match volumes to candles by closest timestamp
            candles.forEach((candle: any) => {
              const closestVolume = volumes.reduce((closest: [number, number] | null, v: [number, number]) => {
                if (!closest) return v;
                return Math.abs(v[0] - candle.time) < Math.abs(closest[0] - candle.time) ? v : closest;
              }, null);
              if (closestVolume) {
                candle.volume = closestVolume[1] / (volumes.length || 1); // Approximate per-candle volume
              }
            });
          }
        } catch (volumeErr) {
          console.warn('[MarketData] Failed to fetch volume data:', volumeErr);
          // Continue without volume - candles still valid
        }

        await logMetric(supabase, 'market-data', 'klines', latency, true, undefined, { 
          symbol, 
          interval,
          candleCount: candles.length 
        });

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
