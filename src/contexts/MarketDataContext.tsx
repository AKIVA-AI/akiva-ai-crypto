/**
 * Centralized Market Data Provider
 * 
 * Single source of truth for all market data across the app.
 * Prevents duplicate API calls and provides consistent data.
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

// Default tracked symbols
const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ARBUSDT', 'OPUSDT',
  'AVAXUSDT', 'MATICUSDT', 'LINKUSDT', 'DOGEUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOTUSDT', 'UNIUSDT', 'AAVEUSDT', 'NEARUSDT', 'ATOMUSDT',
];

// Symbol format conversion
function toDisplaySymbol(input: string): string {
  const upper = input.toUpperCase().replace('/', '-');

  // If already in display format, just normalize any accidental double-dashes
  if (upper.includes('-')) return upper.replace(/--+/g, '-');

  if (upper.endsWith('USDT')) return upper.replace('USDT', '-USDT');
  if (upper.endsWith('BTC')) return upper.replace('BTC', '-BTC');
  return upper;
}

function toApiSymbol(input: string): string {
  // Remove common separators and normalize case
  return input.toUpperCase().replace(/[-/]/g, '');
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

  const fetchInProgress = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 2000; // Minimum 2 seconds between fetches

  const fetchMarketData = useCallback(async (force = false) => {
    // Prevent duplicate fetches
    if (fetchInProgress.current) {
      console.log('[MarketData] Fetch already in progress, skipping');
      return;
    }

    // Rate limit
    const now = Date.now();
    if (!force && now - lastFetchTime.current < MIN_FETCH_INTERVAL) {
      console.log('[MarketData] Rate limited, skipping fetch');
      return;
    }

    fetchInProgress.current = true;
    lastFetchTime.current = now;

    try {
      const symbols = Array.from(getSubscribedApiSymbols()).join(',');
      if (!symbols) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const { data, error } = await supabase.functions.invoke('market-data', {
        body: { symbols },
        method: 'POST',
      });

      if (error) {
        console.error('[MarketData] API error:', error);
        setState(prev => ({ ...prev, error: error.message, isLoading: false }));
        return;
      }

      if (data?.tickers) {
        const newTickers = new Map<string, MarketTicker>();

        for (const ticker of data.tickers) {
          const displaySymbol = toDisplaySymbol(ticker.symbol);
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
          });
        }

        setState({
          tickers: newTickers,
          isLoading: false,
          lastUpdate: Date.now(),
          source: data.source || 'unknown',
          latencyMs: data.latencyMs || 0,
          tradingAllowed: data.tradingAllowed ?? true,
          error: null,
        });

        console.log(`[MarketData] Updated ${newTickers.size} tickers from ${data.source}`);
      }
    } catch (err) {
      console.error('[MarketData] Fetch error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unknown error',
        isLoading: false,
      }));
    } finally {
      fetchInProgress.current = false;
    }
  }, [getSubscribedApiSymbols]);

  // Initial fetch and interval setup
  useEffect(() => {
    // Initial fetch
    fetchMarketData(true);

    // Set up refresh interval
    intervalRef.current = setInterval(() => {
      fetchMarketData();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchMarketData, refreshInterval]);

  const getTicker = useCallback((symbol: string): MarketTicker | undefined => {
    // Try both display format and API format
    return state.tickers.get(toDisplaySymbol(symbol)) || state.tickers.get(symbol);
  }, [state.tickers]);

  const getAllTickers = useCallback((): MarketTicker[] => {
    return Array.from(state.tickers.values());
  }, [state.tickers]);

  const refresh = useCallback(async () => {
    await fetchMarketData(true);
  }, [fetchMarketData]);

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
      fetchMarketData(true);
    }
  }, [fetchMarketData]);

  const unsubscribe = useCallback((symbols: string[]) => {
    for (const symbol of symbols) {
      dynamicSymbols.current.delete(toApiSymbol(symbol));
    }
  }, []);

  const value: MarketDataContextValue = {
    ...state,
    getTicker,
    getAllTickers,
    refresh,
    subscribe,
    unsubscribe,
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
