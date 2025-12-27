import { useState, useCallback, useMemo } from 'react';
import { useWebSocketManager } from './useWebSocketManager';
import type { OrderBookData } from '@/types';

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
}

interface UseLiveOrderBookOptions {
  symbol: string;
  depth?: number;
  enabled?: boolean;
}

// Map our symbols to Binance format
const toBinanceSymbol = (symbol: string): string => {
  return symbol.replace('-', '').replace('/', '').toLowerCase();
};

export function useLiveOrderBook({ symbol, depth = 10, enabled = true }: UseLiveOrderBookOptions) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);

  const processOrderBook = useCallback((data: OrderBookData): OrderBook => {
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    
    let bidTotal = 0;
    const bidData = data.bids || data.b || [];
    for (const [price, size] of bidData.slice(0, depth)) {
      const priceNum = parseFloat(price);
      const sizeNum = parseFloat(size);
      bidTotal += sizeNum;
      bids.push({ price: priceNum, size: sizeNum, total: bidTotal });
    }
    
    let askTotal = 0;
    const askData = data.asks || data.a || [];
    for (const [price, size] of askData.slice(0, depth)) {
      const priceNum = parseFloat(price);
      const sizeNum = parseFloat(size);
      askTotal += sizeNum;
      asks.push({ price: priceNum, size: sizeNum, total: askTotal });
    }
    
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;
    
    return {
      bids,
      asks,
      spread,
      spreadPercent,
      midPrice,
      bestBid,
      bestAsk,
      lastUpdateId: data.lastUpdateId || data.u || Date.now(),
      timestamp: Date.now(),
    };
  }, [depth]);

  const handleMessage = useCallback((data: OrderBookData) => {
    setOrderBook(processOrderBook(data));
  }, [processOrderBook]);

  // Build WebSocket URL
  const wsUrl = useMemo(() => {
    if (!symbol) return '';
    const binanceSymbol = toBinanceSymbol(symbol);
    return `wss://stream.binance.com:9443/ws/${binanceSymbol}@depth${depth}@100ms`;
  }, [symbol, depth]);

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && !!symbol,
    maxReconnectAttempts: 10,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    onMessage: handleMessage,
    onConnect: () => console.log(`[OrderBook] Connected for ${symbol}`),
    onDisconnect: () => console.log(`[OrderBook] Disconnected for ${symbol}`),
  });

  return {
    orderBook,
    isConnected: wsState.isConnected,
    isConnecting: wsState.isConnecting,
    connectionError: wsState.error,
    reconnectAttempts: wsState.reconnectAttempts,
    latencyMs: wsState.latencyMs,
    connect: wsState.connect,
    disconnect: wsState.disconnect,
  };
}
