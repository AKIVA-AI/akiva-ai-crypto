import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toApiSymbol, isSymbolSupported } from '@/lib/symbolUtils';

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  lastUpdateId: number;
  timestamp: number;
  isSimulated: boolean;
}

interface UseLiveOrderBookOptions {
  symbol: string;
  depth?: number;
  enabled?: boolean;
}

interface OrderBookResponse {
  symbol: string;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
  timestamp: number;
  source: string;
  dataQuality: string;
  tradingAllowed: boolean;
  warning?: string;
  latencyMs: number;
}

export function useLiveOrderBook({ symbol, depth = 10, enabled = true }: UseLiveOrderBookOptions) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [isSupported, setIsSupported] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrderBook = useCallback(async () => {
    if (!symbol || !enabled) return;

    // Check if symbol is supported
    const supported = isSymbolSupported(symbol);
    setIsSupported(supported);

    if (!supported) {
      setOrderBook(null);
      setError('Symbol not supported');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const apiSymbol = toApiSymbol(symbol);
      
      const { data, error: fetchError } = await supabase.functions.invoke<OrderBookResponse>('market-data', {
        body: { symbol: apiSymbol, endpoint: 'orderbook', depth },
        method: 'POST',
      });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!data || !data.bids || !data.asks) {
        throw new Error('Invalid orderbook response');
      }

      setLatencyMs(data.latencyMs || 0);

      // Process into OrderBook format
      const bids: OrderBookLevel[] = [];
      const asks: OrderBookLevel[] = [];
      
      let bidTotal = 0;
      for (const level of data.bids.slice(0, depth)) {
        bidTotal += level.size;
        bids.push({ price: level.price, size: level.size, total: bidTotal });
      }
      
      let askTotal = 0;
      for (const level of data.asks.slice(0, depth)) {
        askTotal += level.size;
        asks.push({ price: level.price, size: level.size, total: askTotal });
      }
      
      const bestBid = bids[0]?.price || 0;
      const bestAsk = asks[0]?.price || 0;
      const spread = bestAsk - bestBid;
      const midPrice = (bestBid + bestAsk) / 2;
      const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

      setOrderBook({
        bids,
        asks,
        spread,
        spreadPercent,
        midPrice,
        bestBid,
        bestAsk,
        lastUpdateId: Date.now(),
        timestamp: data.timestamp,
        isSimulated: data.dataQuality === 'simulated',
      });

    } catch (err) {
      console.error('[OrderBook] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch orderbook');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, depth, enabled]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled || !symbol) {
      setOrderBook(null);
      return;
    }

    // Fetch immediately
    fetchOrderBook();

    // Poll every 5 seconds (orderbooks derived from prices update slowly anyway)
    pollIntervalRef.current = setInterval(fetchOrderBook, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [symbol, enabled, fetchOrderBook]);

  return {
    orderBook,
    isConnected: orderBook !== null && !error,
    isConnecting: isLoading,
    connectionError: error,
    reconnectAttempts: 0,
    latencyMs,
    isSupported,
    isSimulated: orderBook?.isSimulated ?? true,
    connect: fetchOrderBook,
    disconnect: () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setOrderBook(null);
    },
  };
}
