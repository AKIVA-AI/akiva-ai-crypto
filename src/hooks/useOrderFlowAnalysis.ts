import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWebSocketManager } from './useWebSocketManager';

export interface Trade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
  isAggressive: boolean; // Taker side
}

export interface OrderFlowMetrics {
  buyVolume: number;
  sellVolume: number;
  netDelta: number;
  imbalanceRatio: number;
  vwapBuy: number;
  vwapSell: number;
  vwap: number;
  aggressiveBuyRatio: number;
  aggressiveSellRatio: number;
  largeTradeCount: number;
  tradeIntensity: number; // trades per second
  momentum: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
}

export interface OrderFlowConfig {
  imbalanceThreshold: number; // 0.6 = 60% dominance
  lookbackTrades: number; // Number of trades to analyze
  largeTradeThreshold: number; // USD value
  signalDecayMs: number;
  aggressiveWeight: number;
  passiveWeight: number;
}

const DEFAULT_CONFIG: OrderFlowConfig = {
  imbalanceThreshold: 0.6,
  lookbackTrades: 500,
  largeTradeThreshold: 10000,
  signalDecayMs: 30000,
  aggressiveWeight: 2.0,
  passiveWeight: 1.0,
};

// Map our symbols to Binance format
const toBinanceSymbol = (symbol: string): string => {
  return symbol.replace('-', '').replace('/', '').toLowerCase();
};

interface BinanceTradeMessage {
  e: string; // event type
  E: number; // event time
  s: string; // symbol
  t: number; // trade id
  p: string; // price
  q: string; // quantity
  T: number; // trade time
  m: boolean; // is buyer maker (false = aggressive buy)
}

export function useOrderFlowAnalysis(
  symbol: string,
  config: Partial<OrderFlowConfig> = {},
  enabled: boolean = true
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<OrderFlowMetrics | null>(null);
  const lastCalculationRef = useRef<number>(0);

  // Calculate metrics from trade tape
  const calculateMetrics = useCallback((tradeList: Trade[]): OrderFlowMetrics => {
    if (tradeList.length === 0) {
      return {
        buyVolume: 0,
        sellVolume: 0,
        netDelta: 0,
        imbalanceRatio: 0.5,
        vwapBuy: 0,
        vwapSell: 0,
        vwap: 0,
        aggressiveBuyRatio: 0,
        aggressiveSellRatio: 0,
        largeTradeCount: 0,
        tradeIntensity: 0,
        momentum: 'neutral',
        strength: 0,
        signal: 'neutral',
      };
    }

    let buyVolume = 0;
    let sellVolume = 0;
    let buyVolumePrice = 0;
    let sellVolumePrice = 0;
    let aggressiveBuys = 0;
    let aggressiveSells = 0;
    let largeTradeCount = 0;
    let totalVolume = 0;
    let totalVolumePrice = 0;

    const now = Date.now();
    const recentTrades = tradeList.slice(-mergedConfig.lookbackTrades);

    for (const trade of recentTrades) {
      const tradeValue = trade.price * trade.size;
      const weight = trade.isAggressive ? mergedConfig.aggressiveWeight : mergedConfig.passiveWeight;
      const weightedVolume = trade.size * weight;

      totalVolume += trade.size;
      totalVolumePrice += tradeValue;

      if (tradeValue >= mergedConfig.largeTradeThreshold) {
        largeTradeCount++;
      }

      if (trade.side === 'buy') {
        buyVolume += weightedVolume;
        buyVolumePrice += trade.price * weightedVolume;
        if (trade.isAggressive) aggressiveBuys++;
      } else {
        sellVolume += weightedVolume;
        sellVolumePrice += trade.price * weightedVolume;
        if (trade.isAggressive) aggressiveSells++;
      }
    }

    const totalWeightedVolume = buyVolume + sellVolume;
    const imbalanceRatio = totalWeightedVolume > 0 ? buyVolume / totalWeightedVolume : 0.5;
    const netDelta = buyVolume - sellVolume;
    
    const vwapBuy = buyVolume > 0 ? buyVolumePrice / buyVolume : 0;
    const vwapSell = sellVolume > 0 ? sellVolumePrice / sellVolume : 0;
    const vwap = totalVolume > 0 ? totalVolumePrice / totalVolume : 0;

    const buyCount = recentTrades.filter(t => t.side === 'buy').length;
    const sellCount = recentTrades.filter(t => t.side === 'sell').length;
    const aggressiveBuyRatio = buyCount > 0 ? aggressiveBuys / buyCount : 0;
    const aggressiveSellRatio = sellCount > 0 ? aggressiveSells / sellCount : 0;

    // Calculate trade intensity
    const timeSpan = recentTrades.length > 1 
      ? (recentTrades[recentTrades.length - 1].timestamp - recentTrades[0].timestamp) / 1000
      : 1;
    const tradeIntensity = recentTrades.length / Math.max(timeSpan, 1);

    // Determine momentum and signal
    let momentum: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let signal: OrderFlowMetrics['signal'] = 'neutral';
    let strength = 0;

    if (imbalanceRatio >= mergedConfig.imbalanceThreshold) {
      momentum = 'bullish';
      strength = Math.min(100, ((imbalanceRatio - 0.5) / 0.5) * 100);
      
      if (imbalanceRatio >= 0.75 && aggressiveBuyRatio >= 0.6) {
        signal = 'strong_buy';
      } else if (imbalanceRatio >= 0.6) {
        signal = 'buy';
      }
    } else if (imbalanceRatio <= (1 - mergedConfig.imbalanceThreshold)) {
      momentum = 'bearish';
      strength = Math.min(100, ((0.5 - imbalanceRatio) / 0.5) * 100);
      
      if (imbalanceRatio <= 0.25 && aggressiveSellRatio >= 0.6) {
        signal = 'strong_sell';
      } else if (imbalanceRatio <= 0.4) {
        signal = 'sell';
      }
    }

    return {
      buyVolume,
      sellVolume,
      netDelta,
      imbalanceRatio,
      vwapBuy,
      vwapSell,
      vwap,
      aggressiveBuyRatio,
      aggressiveSellRatio,
      largeTradeCount,
      tradeIntensity,
      momentum,
      strength,
      signal,
    };
  }, [mergedConfig]);

  // Handle incoming trade data
  const handleMessage = useCallback((data: BinanceTradeMessage) => {
    if (data.e !== 'trade') return;

    const newTrade: Trade = {
      id: data.t.toString(),
      price: parseFloat(data.p),
      size: parseFloat(data.q),
      side: data.m ? 'sell' : 'buy', // m = true means buyer is maker, so seller is taker (aggressive sell)
      timestamp: data.T,
      isAggressive: true, // Binance trade stream only shows taker trades
    };

    setTrades(prev => {
      const updated = [...prev, newTrade].slice(-mergedConfig.lookbackTrades * 2);
      
      // Throttle calculations to every 100ms
      const now = Date.now();
      if (now - lastCalculationRef.current >= 100) {
        lastCalculationRef.current = now;
        setMetrics(calculateMetrics(updated));
      }
      
      return updated;
    });
  }, [mergedConfig.lookbackTrades, calculateMetrics]);

  // Build WebSocket URL for trade stream
  const wsUrl = useMemo(() => {
    if (!symbol) return '';
    const binanceSymbol = toBinanceSymbol(symbol);
    return `wss://stream.binance.com:9443/ws/${binanceSymbol}@trade`;
  }, [symbol]);

  const wsState = useWebSocketManager({
    url: wsUrl,
    enabled: enabled && !!symbol,
    maxReconnectAttempts: 10,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    onMessage: handleMessage,
    onConnect: () => {
      console.log(`[OrderFlow] Connected for ${symbol}`);
      setTrades([]);
    },
    onDisconnect: () => console.log(`[OrderFlow] Disconnected for ${symbol}`),
  });

  // Recalculate metrics periodically even without new trades
  useEffect(() => {
    const interval = setInterval(() => {
      if (trades.length > 0) {
        setMetrics(calculateMetrics(trades));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [trades, calculateMetrics]);

  // Clear old trades periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - mergedConfig.signalDecayMs * 2;
      setTrades(prev => prev.filter(t => t.timestamp > cutoff));
    }, 10000);
    return () => clearInterval(cleanupInterval);
  }, [mergedConfig.signalDecayMs]);

  return {
    trades: trades.slice(-100), // Return last 100 for display
    metrics,
    isConnected: wsState.isConnected,
    isConnecting: wsState.isConnecting,
    connectionError: wsState.error,
    latencyMs: wsState.latencyMs,
    tradeCount: trades.length,
  };
}

// Hook to get cumulative delta (CVD)
export function useCumulativeVolumeDelta(symbol: string, enabled: boolean = true) {
  const { trades, metrics, isConnected } = useOrderFlowAnalysis(symbol, {}, enabled);
  const [cvdHistory, setCvdHistory] = useState<{ timestamp: number; cvd: number; price: number }[]>([]);

  useEffect(() => {
    if (!metrics) return;
    
    setCvdHistory(prev => {
      const newPoint = {
        timestamp: Date.now(),
        cvd: metrics.netDelta,
        price: metrics.vwap,
      };
      return [...prev.slice(-300), newPoint]; // Keep last 5 minutes at 1s intervals
    });
  }, [metrics?.netDelta, metrics?.vwap]);

  // Detect divergence between price and CVD
  const divergence = useMemo(() => {
    if (cvdHistory.length < 10) return null;
    
    const recent = cvdHistory.slice(-10);
    const priceChange = recent[recent.length - 1].price - recent[0].price;
    const cvdChange = recent[recent.length - 1].cvd - recent[0].cvd;
    
    // Price up but CVD down = bearish divergence
    if (priceChange > 0 && cvdChange < 0) {
      return { type: 'bearish', strength: Math.abs(cvdChange) / 1000 };
    }
    // Price down but CVD up = bullish divergence
    if (priceChange < 0 && cvdChange > 0) {
      return { type: 'bullish', strength: Math.abs(cvdChange) / 1000 };
    }
    return null;
  }, [cvdHistory]);

  return {
    cvdHistory,
    currentCvd: metrics?.netDelta || 0,
    divergence,
    isConnected,
  };
}
