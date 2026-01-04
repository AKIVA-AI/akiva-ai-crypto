import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useWebSocketManager } from './useWebSocketManager';
import { supabase } from '@/integrations/supabase/client';
import type { BinanceTickerMessage } from '@/types';

export interface LivePrice {
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

interface UseLivePriceFeedOptions {
  symbols: string[];
  enabled?: boolean;
}

// Map our symbols to Binance format
const toBinanceSymbol = (symbol: string): string => {
  return symbol.replace('-', '').toLowerCase();
};

// Map Binance symbol back to our format
const fromBinanceSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('USDT')) {
    return upper.replace('USDT', '-USDT');
  }
  if (upper.endsWith('BTC')) {
    return upper.replace('BTC', '-BTC');
  }
  return upper;
};

interface FetchResult {
  prices: Map<string, LivePrice>;
  source: string;
  latencyMs: number;
}

// REST API fallback using Edge Function proxy (avoids CORS issues)
async function fetchPricesREST(symbols: string[]): Promise<FetchResult> {
  const prices = new Map<string, LivePrice>();
  let source = 'unknown';
  let latencyMs = 0;
  
  try {
    // Use our Edge Function proxy to fetch market data
    const binanceSymbols = symbols.map(s => toBinanceSymbol(s).toUpperCase()).join(',');
    
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: { symbols: binanceSymbols },
      method: 'POST',
    });
    
    if (error) {
      console.warn('[LivePriceFeed] Edge function error:', error);
      return { prices, source: 'error', latencyMs: 0 };
    }
    
    source = data?.source || 'coingecko';
    latencyMs = data?.latencyMs || 0;
    
    if (data?.tickers) {
      for (const ticker of data.tickers) {
        const symbol = fromBinanceSymbol(ticker.symbol);
        prices.set(symbol, {
          symbol,
          price: ticker.price,
          change24h: ticker.change24h,
          volume24h: ticker.volume24h,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          bid: ticker.bid,
          ask: ticker.ask,
          timestamp: ticker.timestamp,
        });
      }
      console.log(`[LivePriceFeed] Proxy fetched ${prices.size} prices from ${source} in ${latencyMs}ms`);
    }
  } catch (error) {
    console.error('[LivePriceFeed] Proxy error:', error);
  }
  
  return { prices, source, latencyMs };
}

export function useLivePriceFeed({ symbols, enabled = true }: UseLivePriceFeedOptions) {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [usingFallback, setUsingFallback] = useState(false);
  const [dataSource, setDataSource] = useState<string>('');
  const [apiLatency, setApiLatency] = useState<number>(0);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsFailCountRef = useRef(0);

  // Build WebSocket URL for all symbols
  const wsUrl = useMemo(() => {
    if (symbols.length === 0) return '';
    const streams = symbols.map(s => `${toBinanceSymbol(s)}@ticker`).join('/');
    return `wss://stream.binance.com:9443/stream?streams=${streams}`;
  }, [symbols]);

  const handleMessage = useCallback((rawData: unknown) => {
    const message = rawData as BinanceTickerMessage;
    if (message.data) {
      const ticker = message.data;
      const symbol = fromBinanceSymbol(ticker.s);
      
      setPrices(prev => {
        const newPrices = new Map(prev);
        newPrices.set(symbol, {
          symbol,
          price: parseFloat(ticker.c),
          change24h: parseFloat(ticker.P),
          volume24h: parseFloat(ticker.q),
          high24h: parseFloat(ticker.h),
          low24h: parseFloat(ticker.l),
          bid: parseFloat(ticker.b),
          ask: parseFloat(ticker.a),
          timestamp: ticker.E,
        });
        return newPrices;
      });
      
      // Reset fail count on successful message
      wsFailCountRef.current = 0;
    }
  }, []);

  const handleWsConnect = useCallback(() => {
    console.log('[LivePriceFeed] Connected to Binance WebSocket');
    wsFailCountRef.current = 0;
    setUsingFallback(false);
  }, []);

  const handleWsDisconnect = useCallback(() => {
    console.log('[LivePriceFeed] Disconnected from Binance WebSocket');
    wsFailCountRef.current++;

    // Switch to REST fallback after 3 failed attempts
    if (wsFailCountRef.current >= 3) {
      console.log('[LivePriceFeed] Switching to REST API fallback');
      setUsingFallback(true);
    }
  }, []);

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && symbols.length > 0 && !usingFallback,
    maxReconnectAttempts: 3, // Reduce attempts before fallback
    initialBackoffMs: 1000,
    maxBackoffMs: 5000,
    onMessage: handleMessage,
    onConnect: handleWsConnect,
    onDisconnect: handleWsDisconnect,
  });

  // REST API fallback polling
  useEffect(() => {
    if (!enabled || symbols.length === 0) return;
    
    // Start REST polling immediately and also when WS fails
    const pollPrices = async () => {
      const result = await fetchPricesREST(symbols);
      if (result.prices.size > 0) {
        setPrices(result.prices);
        setDataSource(result.source);
        setApiLatency(result.latencyMs);
      }
    };
    
    // Always do an initial fetch for immediate data
    pollPrices();
    
    // If using fallback, poll every 10 seconds to avoid rate limits
    if (usingFallback || !wsState.isConnected) {
      fallbackIntervalRef.current = setInterval(pollPrices, 10000);
    }
    
    return () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [enabled, symbols, usingFallback, wsState.isConnected]);

  const getPrice = useCallback((symbol: string): LivePrice | undefined => {
    return prices.get(symbol);
  }, [prices]);

  const getAllPrices = useCallback((): LivePrice[] => {
    return Array.from(prices.values());
  }, [prices]);

  const connect = useCallback(() => {
    setUsingFallback(false);
    wsFailCountRef.current = 0;
    wsState.connect();
  }, [wsState]);

  const forceRefresh = useCallback(async () => {
    const result = await fetchPricesREST(symbols);
    if (result.prices.size > 0) {
      setPrices(result.prices);
      setDataSource(result.source);
      setApiLatency(result.latencyMs);
    }
  }, [symbols]);

  return {
    prices,
    isConnected: wsState.isConnected || usingFallback,
    isConnecting: wsState.isConnecting,
    connectionError: wsState.error,
    reconnectAttempts: wsState.reconnectAttempts,
    latencyMs: wsState.latencyMs,
    lastConnectedAt: wsState.lastConnectedAt,
    usingFallback,
    dataSource,
    apiLatency,
    getPrice,
    getAllPrices,
    connect,
    forceRefresh,
    disconnect: wsState.disconnect,
    resetReconnect: wsState.resetReconnectAttempts,
  };
}
