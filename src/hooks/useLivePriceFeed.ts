import { useState, useCallback, useMemo } from 'react';
import { useWebSocketManager, WebSocketState } from './useWebSocketManager';
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

export function useLivePriceFeed({ symbols, enabled = true }: UseLivePriceFeedOptions) {
  const [prices, setPrices] = useState<Map<string, LivePrice>>(new Map());

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
    }
  }, []);

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && symbols.length > 0,
    maxReconnectAttempts: 10,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    onMessage: handleMessage,
    onConnect: () => console.log('[LivePriceFeed] Connected to Binance'),
    onDisconnect: () => console.log('[LivePriceFeed] Disconnected from Binance'),
  });

  const getPrice = useCallback((symbol: string): LivePrice | undefined => {
    return prices.get(symbol);
  }, [prices]);

  const getAllPrices = useCallback((): LivePrice[] => {
    return Array.from(prices.values());
  }, [prices]);

  return {
    prices,
    isConnected: wsState.isConnected,
    isConnecting: wsState.isConnecting,
    connectionError: wsState.error,
    reconnectAttempts: wsState.reconnectAttempts,
    latencyMs: wsState.latencyMs,
    lastConnectedAt: wsState.lastConnectedAt,
    getPrice,
    getAllPrices,
    connect: wsState.connect,
    disconnect: wsState.disconnect,
    resetReconnect: wsState.resetReconnectAttempts,
  };
}
