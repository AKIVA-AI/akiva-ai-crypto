/**
 * Centralized Market Data Provider
 * 
 * Single source of truth for all market data across the app.
 * Prevents duplicate API calls and provides consistent data.
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  toCanonicalSymbol, 
  toApiSymbol as standardToApiSymbol, 
  isSymbolSupported 
} from '@/lib/symbolUtils';

export interface MarketTicker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  timestamp: number;
  dataQuality: 'realtime' | 'delayed' | 'derived' | 'simulated' | 'unavailable';
  isSupported: boolean;
}

interface MarketDataState {
  tickers: Map<string, MarketTicker>;
  isLoading: boolean;
  lastUpdate: number;
  source: string;
  latencyMs: number;
  tradingAllowed: boolean;
  error: string | null;
}

interface MarketDataContextValue extends MarketDataState {
  getTicker: (symbol: string) => MarketTicker | undefined;
  getAllTickers: () => MarketTicker[];
  refresh: () => Promise<void>;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
  isSymbolSupported: (symbol: string) => boolean;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

// Default tracked symbols - only supported ones
const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ARBUSDT', 'OPUSDT',
  'AVAXUSDT', 'LINKUSDT', 'DOGEUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOTUSDT', 'UNIUSDT', 'AAVEUSDT', 'NEARUSDT', 'ATOMUSDT',
];

// Symbol format conversion - use standardized utilities
function toDisplaySymbol(input: string): string {
  return toCanonicalSymbol(input);
}

function toApiSymbol(input: string): string {
  return standardToApiSymbol(input);
}

interface Props {
  children: ReactNode;
  refreshInterval?: number;
}

export function MarketDataProvider({ children, refreshInterval = 5000 }: Props) {
  const [state, setState] = useState<MarketDataState>({
    tickers: new Map(),
    isLoading: true,
    lastUpdate: 0,
    source: '',
    latencyMs: 0,
    tradingAllowed: false,
    error: null,
  });

  // Pinned symbols are ALWAYS tracked and cannot be unsubscribed (prevents "$0" regressions)
  const pinnedSymbols = useRef<Set<string>>(new Set(DEFAULT_SYMBOLS));
  // Dynamic symbols come from mounted screens/widgets
  const dynamicSymbols = useRef<Set<string>>(new Set());

  const getSubscribedApiSymbols = useCallback(() => {
    return new Set([...pinnedSymbols.current, ...dynamicSymbols.current]);
  }, []);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;
  const useWebSocket = useRef(true); // Flag to enable/disable WebSocket
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fallback polling method (used if WebSocket fails)
  const fetchMarketDataPolling = useCallback(async () => {
    const symbols = Array.from(getSubscribedApiSymbols()).join(',');
    if (!symbols) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('market-data', {
        body: { symbols },
        method: 'POST',
      });

      if (error) {
        console.error('[MarketData] Polling API error:', error);
        setState(prev => ({ ...prev, error: error.message, isLoading: false }));
        return;
      }

      if (data?.tickers) {
        const newTickers = new Map<string, MarketTicker>();

        for (const ticker of data.tickers) {
          const displaySymbol = toDisplaySymbol(ticker.symbol);
          const supported = isSymbolSupported(ticker.symbol);
          const hasRealPrice = ticker.price > 0 && ticker.dataQuality !== 'simulated';

          newTickers.set(displaySymbol, {
            symbol: displaySymbol,
            price: ticker.price,
            change24h: ticker.change24h,
            volume24h: ticker.volume24h,
            high24h: ticker.high24h ?? ticker.price,
            low24h: ticker.low24h ?? ticker.price,
            bid: ticker.bid,
            ask: ticker.ask,
            timestamp: ticker.timestamp,
            dataQuality: ticker.dataQuality || 'delayed',
            isSupported: supported && hasRealPrice,
          });
        }

        setState({
          tickers: newTickers,
          isLoading: false,
          lastUpdate: Date.now(),
          source: data.source || 'coingecko-polling',
          latencyMs: data.latencyMs || 0,
          tradingAllowed: data.tradingAllowed ?? true,
          error: null,
        });

        console.log(`[MarketData] Polling updated ${newTickers.size} tickers from ${data.source}`);
      }
    } catch (err) {
      console.error('[MarketData] Polling fetch error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      }));
    }
  }, [getSubscribedApiSymbols]);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (!useWebSocket.current) {
      console.log('[MarketData] WebSocket disabled, using polling fallback');
      return;
    }

    const symbols = Array.from(getSubscribedApiSymbols());
    if (symbols.length === 0) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const symbolsParam = symbols.join(',');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const streamUrl = `${supabaseUrl}/functions/v1/market-data-stream?symbols=${symbolsParam}`;

    console.log(`[MarketData] Connecting to WebSocket stream for ${symbols.length} symbols`);

    const eventSource = new EventSource(streamUrl, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
      },
    } as any);

    eventSource.onopen = () => {
      console.log('[MarketData] WebSocket connected');
      reconnectAttempts.current = 0;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        source: 'binance-websocket',
      }));
    };

    eventSource.onmessage = (event) => {
      try {
        const ticker = JSON.parse(event.data);

        setState(prev => {
          const newTickers = new Map(prev.tickers);
          const displaySymbol = toDisplaySymbol(ticker.symbol);
          const supported = isSymbolSupported(ticker.symbol);
          const hasRealPrice = ticker.price > 0 && ticker.dataQuality !== 'simulated';

          newTickers.set(displaySymbol, {
            symbol: displaySymbol,
            price: ticker.price,
            change24h: ticker.change24h,
            volume24h: ticker.volume24h,
            high24h: ticker.high24h ?? ticker.price,
            low24h: ticker.low24h ?? ticker.price,
            bid: ticker.bid,
            ask: ticker.ask,
            timestamp: ticker.timestamp,
            dataQuality: ticker.dataQuality || 'realtime',
            isSupported: supported && hasRealPrice,
          });

          return {
            ...prev,
            tickers: newTickers,
            lastUpdate: Date.now(),
            tradingAllowed: ticker.dataQuality !== 'simulated',
          };
        });
      } catch (err) {
        console.error('[MarketData] Error parsing WebSocket message:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[MarketData] WebSocket error:', error);
      eventSource.close();

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++;
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current - 1);
        console.log(`[MarketData] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      } else {
        console.warn('[MarketData] WebSocket failed after max attempts, falling back to polling');
        useWebSocket.current = false;

        // Start polling fallback
        fetchMarketDataPolling();
        fallbackIntervalRef.current = setInterval(fetchMarketDataPolling, refreshInterval);

        setState(prev => ({
          ...prev,
          error: 'Using polling fallback (WebSocket unavailable)',
          isLoading: false,
        }));
      }
    };

    eventSourceRef.current = eventSource;
  }, [getSubscribedApiSymbols, fetchMarketDataPolling, refreshInterval]);

  // Initial connection and cleanup
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [connectWebSocket]);

  const getTicker = useCallback((symbol: string): MarketTicker | undefined => {
    // Try both display format and API format
    return state.tickers.get(toDisplaySymbol(symbol)) || state.tickers.get(symbol);
  }, [state.tickers]);

  const getAllTickers = useCallback((): MarketTicker[] => {
    return Array.from(state.tickers.values());
  }, [state.tickers]);

  const refresh = useCallback(async () => {
    // Reconnect WebSocket to force refresh
    connectWebSocket();
  }, [connectWebSocket]);

  const subscribe = useCallback((symbols: string[]) => {
    let changed = false;
    for (const symbol of symbols) {
      const apiSymbol = toApiSymbol(symbol);
      if (pinnedSymbols.current.has(apiSymbol)) continue;
      if (!dynamicSymbols.current.has(apiSymbol)) {
        dynamicSymbols.current.add(apiSymbol);
        changed = true;
      }
    }
    if (changed) {
      connectWebSocket();
    }
  }, [connectWebSocket]);

  const unsubscribe = useCallback((symbols: string[]) => {
    let changed = false;
    for (const symbol of symbols) {
      const apiSymbol = toApiSymbol(symbol);
      if (dynamicSymbols.current.has(apiSymbol)) {
        dynamicSymbols.current.delete(apiSymbol);
        changed = true;
      }
    }
    if (changed) {
      connectWebSocket();
    }
  }, [connectWebSocket]);

  const value: MarketDataContextValue = {
    ...state,
    getTicker,
    getAllTickers,
    refresh,
    subscribe,
    unsubscribe,
    isSymbolSupported,
  };

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketData() {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider');
  }
  return context;
}

/**
 * Hook to get a single ticker with automatic subscription
 */
export function useTicker(symbol: string) {
  const { getTicker, subscribe, unsubscribe } = useMarketData();

  useEffect(() => {
    subscribe([symbol]);
    return () => unsubscribe([symbol]);
  }, [symbol, subscribe, unsubscribe]);

  return getTicker(symbol);
}

/**
 * Hook to get multiple tickers with automatic subscription
 */
export function useTickers(symbols: string[]) {
  const { tickers, subscribe, unsubscribe, isLoading, lastUpdate, source } = useMarketData();

  useEffect(() => {
    subscribe(symbols);
    return () => unsubscribe(symbols);
  }, [symbols.join(','), subscribe, unsubscribe]);

  const result = symbols.map(s => {
    const displaySymbol = s.includes('-') ? s : toDisplaySymbol(s);
    return tickers.get(displaySymbol);
  }).filter(Boolean) as MarketTicker[];

  return { tickers: result, isLoading, lastUpdate, source };
}
