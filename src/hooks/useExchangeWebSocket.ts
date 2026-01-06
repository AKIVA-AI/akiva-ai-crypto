/**
 * useExchangeWebSocket - Hook for managing individual exchange WebSocket connections
 * 
 * Handles exchange-specific WebSocket protocols and message formats.
 * Each exchange has different message structures and subscription methods.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebSocketManager } from './useWebSocketManager';

export interface ExchangeTickerData {
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

interface UseExchangeWebSocketOptions {
  exchange: string;
  wsUrl: string;
  symbols: string[];
  enabled?: boolean;
  onTicker?: (ticker: ExchangeTickerData) => void;
}

// Map our symbol format to exchange-specific format
const toExchangeSymbol = (symbol: string, exchange: string): string => {
  switch (exchange) {
    case 'binance':
    case 'bybit':
    case 'okx':
    case 'mexc':
      // BTC-USDT -> BTCUSDT
      return symbol.replace('-', '').toUpperCase();
    
    case 'coinbase':
    case 'kraken':
      // BTC-USDT -> BTC-USDT (already correct)
      return symbol.toUpperCase();
    
    case 'hyperliquid':
      // BTC-USDT -> BTC/USDT
      return symbol.replace('-', '/').toUpperCase();
    
    default:
      return symbol.toUpperCase();
  }
};

// Parse exchange-specific message format
const parseExchangeMessage = (data: any, exchange: string): ExchangeTickerData | null => {
  try {
    switch (exchange) {
      case 'binance':
        return parseBinanceMessage(data);
      
      case 'coinbase':
        return parseCoinbaseMessage(data);
      
      case 'kraken':
        return parseKrakenMessage(data);
      
      case 'bybit':
        return parseBybitMessage(data);
      
      case 'okx':
        return parseOKXMessage(data);
      
      default:
        console.warn(`[ExchangeWS] Unknown exchange: ${exchange}`);
        return null;
    }
  } catch (error) {
    console.error(`[ExchangeWS] Failed to parse ${exchange} message:`, error);
    return null;
  }
};

// Binance message parser
const parseBinanceMessage = (data: any): ExchangeTickerData | null => {
  if (data.e !== '24hrTicker') return null;
  
  return {
    symbol: data.s.replace(/USDT$/, '-USDT'), // BTCUSDT -> BTC-USDT
    price: parseFloat(data.c),
    change24h: parseFloat(data.p),
    volume24h: parseFloat(data.v),
    high24h: parseFloat(data.h),
    low24h: parseFloat(data.l),
    bid: parseFloat(data.b),
    ask: parseFloat(data.a),
    timestamp: data.E,
  };
};

// Coinbase message parser
const parseCoinbaseMessage = (data: any): ExchangeTickerData | null => {
  if (data.type !== 'ticker') return null;
  
  return {
    symbol: data.product_id,
    price: parseFloat(data.price),
    change24h: parseFloat(data.price) - parseFloat(data.open_24h),
    volume24h: parseFloat(data.volume_24h),
    high24h: parseFloat(data.high_24h),
    low24h: parseFloat(data.low_24h),
    bid: parseFloat(data.best_bid),
    ask: parseFloat(data.best_ask),
    timestamp: new Date(data.time).getTime(),
  };
};

// Kraken message parser
const parseKrakenMessage = (data: any): ExchangeTickerData | null => {
  // Kraken uses array format: [channelID, data, channelName, pair]
  if (!Array.isArray(data) || data[2] !== 'ticker') return null;
  
  const ticker = data[1];
  return {
    symbol: data[3],
    price: parseFloat(ticker.c[0]),
    change24h: parseFloat(ticker.c[0]) - parseFloat(ticker.o[0]),
    volume24h: parseFloat(ticker.v[1]),
    high24h: parseFloat(ticker.h[1]),
    low24h: parseFloat(ticker.l[1]),
    bid: parseFloat(ticker.b[0]),
    ask: parseFloat(ticker.a[0]),
    timestamp: Date.now(),
  };
};

// Bybit message parser
const parseBybitMessage = (data: any): ExchangeTickerData | null => {
  if (data.topic !== 'tickers') return null;
  
  const ticker = data.data;
  return {
    symbol: ticker.symbol.replace(/USDT$/, '-USDT'),
    price: parseFloat(ticker.lastPrice),
    change24h: parseFloat(ticker.price24hPcnt) * parseFloat(ticker.lastPrice),
    volume24h: parseFloat(ticker.volume24h),
    high24h: parseFloat(ticker.highPrice24h),
    low24h: parseFloat(ticker.lowPrice24h),
    bid: parseFloat(ticker.bid1Price),
    ask: parseFloat(ticker.ask1Price),
    timestamp: ticker.time,
  };
};

// OKX message parser
const parseOKXMessage = (data: any): ExchangeTickerData | null => {
  if (!data.data || data.data.length === 0) return null;
  
  const ticker = data.data[0];
  return {
    symbol: ticker.instId.replace('-', '-'),
    price: parseFloat(ticker.last),
    change24h: parseFloat(ticker.last) - parseFloat(ticker.open24h),
    volume24h: parseFloat(ticker.vol24h),
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    bid: parseFloat(ticker.bidPx),
    ask: parseFloat(ticker.askPx),
    timestamp: parseInt(ticker.ts),
  };
};

export function useExchangeWebSocket({
  exchange,
  wsUrl,
  symbols,
  enabled = true,
  onTicker,
}: UseExchangeWebSocketOptions) {
  const [tickerCount, setTickerCount] = useState(0);

  const handleMessage = useCallback((data: any) => {
    const ticker = parseExchangeMessage(data, exchange);
    if (ticker) {
      setTickerCount(prev => prev + 1);
      onTicker?.(ticker);
    }
  }, [exchange, onTicker]);

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && symbols.length > 0,
    maxReconnectAttempts: 10,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    onMessage: handleMessage,
    onConnect: () => console.log(`[${exchange}] WebSocket connected`),
    onDisconnect: () => console.log(`[${exchange}] WebSocket disconnected`),
  });

  return {
    ...wsState,
    tickerCount,
  };
}

