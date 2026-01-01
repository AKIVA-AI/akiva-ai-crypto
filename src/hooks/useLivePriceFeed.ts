import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useWebSocketManager } from './useWebSocketManager';
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

// REST API fallback for when WebSocket is blocked
async function fetchPricesREST(symbols: string[]): Promise<Map<string, LivePrice>> {
  const prices = new Map<string, LivePrice>();
  
  try {
    // Fetch 24hr ticker data for all symbols at once
    const binanceSymbols = symbols.map(s => toBinanceSymbol(s).toUpperCase());
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[LivePriceFeed] REST API failed:', response.status);
      return prices;
    }
    
    const data = await response.json();
    
    for (const ticker of data) {
      const symbol = fromBinanceSymbol(ticker.symbol);
      prices.set(symbol, {
        symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.quoteVolume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        bid: parseFloat(ticker.bidPrice),
        ask: parseFloat(ticker.askPrice),
        timestamp: Date.now(),
      });
    }
    
    console.log(`[LivePriceFeed] REST fallback fetched ${prices.size} prices`);
  } catch (error) {
    console.error('[LivePriceFeed] REST API error:', error);
  }
  
  return prices;
}

export function useLivePriceFeed({ symbols, enabled = true }: UseLivePriceFeedOptions) {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());
  const [usingFallback, setUsingFallback] = useState(false);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsFailCountRef = useRef(0);

  // Build WebSocket URL for all symbols
  const wsUrl = useMemo(() => {
    if (symbols.length === 0) return '';
    const streams = symbols.map(s => `${toBinanceSymbol(s)}@ticker`).join('/');
    return `wss://stream.binance.com:9443/stream?streams=${streams}`;
  }, [symbols]);

  const handleMessage = useCallback((message: BinanceTickerMessage) => {
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

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && symbols.length > 0 && !usingFallback,
    maxReconnectAttempts: 3, // Reduce attempts before fallback
    initialBackoffMs: 1000,
    maxBackoffMs: 5000,
    onMessage: handleMessage,
    onConnect: () => {
      console.log('[LivePriceFeed] Connected to Binance WebSocket');
      wsFailCountRef.current = 0;
      setUsingFallback(false);
    },
    onDisconnect: () => {
      console.log('[LivePriceFeed] Disconnected from Binance WebSocket');
      wsFailCountRef.current++;
      
      // Switch to REST fallback after 3 failed attempts
      if (wsFailCountRef.current >= 3) {
        console.log('[LivePriceFeed] Switching to REST API fallback');
        setUsingFallback(true);
      }
    },
  });

  // REST API fallback polling
  useEffect(() => {
    if (!enabled || symbols.length === 0) return;
    
    // Start REST polling immediately and also when WS fails
    const pollPrices = async () => {
      const newPrices = await fetchPricesREST(symbols);
      if (newPrices.size > 0) {
        setPrices(newPrices);
      }
    };
    
    // Always do an initial fetch for immediate data
    pollPrices();
    
    // If using fallback, poll every 2 seconds
    if (usingFallback || !wsState.isConnected) {
      fallbackIntervalRef.current = setInterval(pollPrices, 2000);
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

  return {
    prices,
    isConnected: wsState.isConnected || usingFallback,
    isConnecting: wsState.isConnecting,
    connectionError: wsState.error,
    reconnectAttempts: wsState.reconnectAttempts,
    latencyMs: wsState.latencyMs,
    lastConnectedAt: wsState.lastConnectedAt,
    usingFallback,
    getPrice,
    getAllPrices,
    connect,
    disconnect: wsState.disconnect,
    resetReconnect: wsState.resetReconnectAttempts,
  };
}
