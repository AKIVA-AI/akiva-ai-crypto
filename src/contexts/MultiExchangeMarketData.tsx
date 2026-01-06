/**
 * MultiExchangeMarketData Context
 * 
 * Manages WebSocket connections to multiple exchanges based on user configuration.
 * Provides unified market data with exchange source information.
 * 
 * Features:
 * - Dynamic exchange detection from user_exchange_keys table
 * - Multiple WebSocket connections (one per exchange)
 * - Merged data streams with source attribution
 * - Automatic reconnection and failover
 * - Regulatory compliance warnings
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useExchangeKeys } from '@/hooks/useExchangeKeys';
import { useExchangeWebSocket, ExchangeTickerData } from '@/hooks/useExchangeWebSocket';

export interface ExchangePrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
  timestamp: number;
  exchange: string; // Source exchange
  exchangeColor: string; // UI color for badge
}

export interface ExchangeConnection {
  exchange: string;
  isConnected: boolean;
  isConnecting: boolean;
  latencyMs: number | null;
  messageCount: number;
  lastUpdate: number | null;
  error: string | null;
}

interface MultiExchangeMarketDataState {
  prices: Map<string, ExchangePrice>;
  exchanges: ExchangeConnection[];
  isLoading: boolean;
  error: string | null;
}

interface MultiExchangeMarketDataContextValue extends MultiExchangeMarketDataState {
  getPrice: (symbol: string) => ExchangePrice | undefined;
  getAllPrices: () => ExchangePrice[];
  getPricesByExchange: (exchange: string) => ExchangePrice[];
  getBestPrice: (symbol: string, side: 'buy' | 'sell') => ExchangePrice | undefined;
  reconnectExchange: (exchange: string) => void;
  reconnectAll: () => void;
}

const MultiExchangeMarketDataContext = createContext<MultiExchangeMarketDataContextValue | null>(null);

// Exchange configuration with WebSocket URLs and colors
const EXCHANGE_CONFIG = {
  coinbase: {
    name: 'Coinbase Advanced',
    wsUrl: 'wss://advanced-trade-ws.coinbase.com',
    color: '#0052FF',
    icon: '🔵',
    usCompliant: true,
  },
  kraken: {
    name: 'Kraken',
    wsUrl: 'wss://ws.kraken.com',
    color: '#5741D9',
    icon: '🟣',
    usCompliant: true,
  },
  binance: {
    name: 'Binance',
    wsUrl: 'wss://stream.binance.com:9443/ws',
    color: '#F3BA2F',
    icon: '🟡',
    usCompliant: false,
  },
  bybit: {
    name: 'Bybit',
    wsUrl: 'wss://stream.bybit.com/v5/public/spot',
    color: '#F7A600',
    icon: '🟠',
    usCompliant: false,
  },
  okx: {
    name: 'OKX',
    wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
    color: '#000000',
    icon: '⚫',
    usCompliant: false,
  },
  hyperliquid: {
    name: 'Hyperliquid',
    wsUrl: 'wss://api.hyperliquid.xyz/ws',
    color: '#00D4FF',
    icon: '🔷',
    usCompliant: true,
  },
  mexc: {
    name: 'MEXC',
    wsUrl: 'wss://wbs.mexc.com/ws',
    color: '#00C087',
    icon: '🟢',
    usCompliant: false,
  },
} as const;

interface Props {
  children: React.ReactNode;
}

export function MultiExchangeMarketDataProvider({ children }: Props) {
  const [state, setState] = useState<MultiExchangeMarketDataState>({
    prices: new Map(),
    exchanges: [],
    isLoading: true,
    error: null,
  });

  // Fetch user's configured exchanges
  const { keys: exchangeKeys, isLoading: keysLoading } = useExchangeKeys();

  // Get list of active exchanges
  const activeExchanges = useMemo(() => {
    if (!exchangeKeys) return [];
    return exchangeKeys
      .filter(key => key.is_active && key.is_validated)
      .map(key => key.exchange);
  }, [exchangeKeys]);

  // Handle incoming ticker data from any exchange
  const handleTicker = useCallback((ticker: ExchangeTickerData, exchange: string) => {
    setState(prev => {
      const newPrices = new Map(prev.prices);
      const config = EXCHANGE_CONFIG[exchange as keyof typeof EXCHANGE_CONFIG];

      newPrices.set(ticker.symbol, {
        ...ticker,
        exchange,
        exchangeColor: config?.color || '#000000',
      });

      return {
        ...prev,
        prices: newPrices,
      };
    });
  }, []);

  // Create WebSocket connections for each active exchange
  // For now, we'll start with Coinbase as a proof of concept
  const coinbaseEnabled = activeExchanges.includes('coinbase');
  const coinbaseWs = useExchangeWebSocket({
    exchange: 'coinbase',
    wsUrl: EXCHANGE_CONFIG.coinbase.wsUrl,
    symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'], // TODO: Make this dynamic
    enabled: coinbaseEnabled,
    onTicker: (ticker) => handleTicker(ticker, 'coinbase'),
  });

  const krakenEnabled = activeExchanges.includes('kraken');
  const krakenWs = useExchangeWebSocket({
    exchange: 'kraken',
    wsUrl: EXCHANGE_CONFIG.kraken.wsUrl,
    symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'], // TODO: Make this dynamic
    enabled: krakenEnabled,
    onTicker: (ticker) => handleTicker(ticker, 'kraken'),
  });

  const binanceEnabled = activeExchanges.includes('binance');
  const binanceWs = useExchangeWebSocket({
    exchange: 'binance',
    wsUrl: EXCHANGE_CONFIG.binance.wsUrl,
    symbols: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'], // TODO: Make this dynamic
    enabled: binanceEnabled,
    onTicker: (ticker) => handleTicker(ticker, 'binance'),
  });

  // Update exchange connection states
  useEffect(() => {
    const exchanges: ExchangeConnection[] = [];

    if (coinbaseEnabled) {
      exchanges.push({
        exchange: 'coinbase',
        isConnected: coinbaseWs.isConnected,
        isConnecting: coinbaseWs.isConnecting,
        latencyMs: coinbaseWs.latencyMs,
        messageCount: coinbaseWs.tickerCount,
        lastUpdate: coinbaseWs.lastConnectedAt,
        error: coinbaseWs.error,
      });
    }

    if (krakenEnabled) {
      exchanges.push({
        exchange: 'kraken',
        isConnected: krakenWs.isConnected,
        isConnecting: krakenWs.isConnecting,
        latencyMs: krakenWs.latencyMs,
        messageCount: krakenWs.tickerCount,
        lastUpdate: krakenWs.lastConnectedAt,
        error: krakenWs.error,
      });
    }

    if (binanceEnabled) {
      exchanges.push({
        exchange: 'binance',
        isConnected: binanceWs.isConnected,
        isConnecting: binanceWs.isConnecting,
        latencyMs: binanceWs.latencyMs,
        messageCount: binanceWs.tickerCount,
        lastUpdate: binanceWs.lastConnectedAt,
        error: binanceWs.error,
      });
    }

    setState(prev => ({
      ...prev,
      exchanges,
      isLoading: keysLoading || exchanges.some(e => e.isConnecting),
    }));
  }, [
    coinbaseEnabled, coinbaseWs,
    krakenEnabled, krakenWs,
    binanceEnabled, binanceWs,
    keysLoading,
  ]);

  const getPrice = useCallback((symbol: string): ExchangePrice | undefined => {
    return state.prices.get(symbol);
  }, [state.prices]);

  const getAllPrices = useCallback((): ExchangePrice[] => {
    return Array.from(state.prices.values());
  }, [state.prices]);

  const getPricesByExchange = useCallback((exchange: string): ExchangePrice[] => {
    return Array.from(state.prices.values()).filter(p => p.exchange === exchange);
  }, [state.prices]);

  const getBestPrice = useCallback((symbol: string, side: 'buy' | 'sell'): ExchangePrice | undefined => {
    const prices = Array.from(state.prices.values()).filter(p => p.symbol === symbol);
    if (prices.length === 0) return undefined;

    if (side === 'buy') {
      // Best buy price = lowest ask
      return prices.reduce((best, current) => 
        current.ask < best.ask ? current : best
      );
    } else {
      // Best sell price = highest bid
      return prices.reduce((best, current) => 
        current.bid > best.bid ? current : best
      );
    }
  }, [state.prices]);

  const reconnectExchange = useCallback((exchange: string) => {
    console.log(`[MultiExchange] Reconnecting ${exchange}...`);
    switch (exchange) {
      case 'coinbase':
        coinbaseWs.connect();
        break;
      case 'kraken':
        krakenWs.connect();
        break;
      case 'binance':
        binanceWs.connect();
        break;
    }
  }, [coinbaseWs, krakenWs, binanceWs]);

  const reconnectAll = useCallback(() => {
    console.log('[MultiExchange] Reconnecting all exchanges...');
    if (coinbaseEnabled) coinbaseWs.connect();
    if (krakenEnabled) krakenWs.connect();
    if (binanceEnabled) binanceWs.connect();
  }, [coinbaseEnabled, coinbaseWs, krakenEnabled, krakenWs, binanceEnabled, binanceWs]);

  const value: MultiExchangeMarketDataContextValue = {
    ...state,
    getPrice,
    getAllPrices,
    getPricesByExchange,
    getBestPrice,
    reconnectExchange,
    reconnectAll,
  };

  return (
    <MultiExchangeMarketDataContext.Provider value={value}>
      {children}
    </MultiExchangeMarketDataContext.Provider>
  );
}

export function useMultiExchangeMarketData() {
  const context = useContext(MultiExchangeMarketDataContext);
  if (!context) {
    throw new Error('useMultiExchangeMarketData must be used within a MultiExchangeMarketDataProvider');
  }
  return context;
}

