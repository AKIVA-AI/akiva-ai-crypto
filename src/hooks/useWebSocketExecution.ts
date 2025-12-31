import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface WebSocketOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price?: number;
  status: 'pending' | 'submitted' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledQuantity: number;
  filledPrice: number;
  submittedAt: number;
  filledAt?: number;
  latencyMs?: number;
  venue: string;
}

export interface ExecutionMetrics {
  totalOrders: number;
  filledOrders: number;
  avgLatencyMs: number;
  avgSlippageBps: number;
  fillRate: number;
}

interface UseWebSocketExecutionOptions {
  venue: 'coinbase' | 'kraken' | 'binance_us' | 'hyperliquid';
  enabled?: boolean;
  onFill?: (order: WebSocketOrder) => void;
  onReject?: (order: WebSocketOrder, reason: string) => void;
}

// WebSocket URLs for different venues
const VENUE_WS_URLS: Record<string, string> = {
  coinbase: 'wss://ws-feed.exchange.coinbase.com',
  kraken: 'wss://ws.kraken.com',
  binance_us: 'wss://stream.binance.us:9443/ws',
  hyperliquid: 'wss://api.hyperliquid.xyz/ws',
};

export function useWebSocketExecution({
  venue,
  enabled = true,
  onFill,
  onReject,
}: UseWebSocketExecutionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [orders, setOrders] = useState<Map<string, WebSocketOrder>>(new Map());
  const [metrics, setMetrics] = useState<ExecutionMetrics>({
    totalOrders: 0,
    filledOrders: 0,
    avgLatencyMs: 0,
    avgSlippageBps: 0,
    fillRate: 0,
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const orderQueueRef = useRef<WebSocketOrder[]>([]);
  const queryClient = useQueryClient();

  // Connect to venue WebSocket
  const connect = useCallback(() => {
    if (!enabled || !VENUE_WS_URLS[venue]) return;

    try {
      const ws = new WebSocket(VENUE_WS_URLS[venue]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WSExecution] Connected to ${venue}`);
        setIsConnected(true);
        
        // Subscribe to user orders channel
        if (venue === 'coinbase') {
          ws.send(JSON.stringify({
            type: 'subscribe',
            channels: [{ name: 'user', product_ids: ['BTC-USD', 'ETH-USD'] }],
          }));
        } else if (venue === 'kraken') {
          ws.send(JSON.stringify({
            event: 'subscribe',
            subscription: { name: 'ownTrades' },
          }));
        }
        
        // Process queued orders
        while (orderQueueRef.current.length > 0) {
          const order = orderQueueRef.current.shift();
          if (order) submitOrderInternal(order);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleVenueMessage(data);
        } catch (error) {
          console.error('[WSExecution] Message parse error:', error);
        }
      };

      ws.onclose = () => {
        console.log(`[WSExecution] Disconnected from ${venue}`);
        setIsConnected(false);
        
        // Attempt reconnect
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error(`[WSExecution] Error on ${venue}:`, error);
      };
    } catch (error) {
      console.error('[WSExecution] Connection failed:', error);
    }
  }, [venue, enabled]);

  // Handle venue-specific messages
  const handleVenueMessage = useCallback((data: any) => {
    if (venue === 'coinbase') {
      if (data.type === 'received') {
        updateOrderStatus(data.order_id, 'submitted');
      } else if (data.type === 'match') {
        handleFill(data.order_id, parseFloat(data.size), parseFloat(data.price));
      } else if (data.type === 'done' && data.reason === 'filled') {
        updateOrderStatus(data.order_id, 'filled');
      } else if (data.type === 'done' && data.reason === 'canceled') {
        updateOrderStatus(data.order_id, 'cancelled');
      }
    } else if (venue === 'kraken') {
      if (Array.isArray(data) && data[1] === 'ownTrades') {
        const trades = data[0];
        Object.entries(trades).forEach(([, trade]: [string, any]) => {
          handleFill(trade.ordertxid, parseFloat(trade.vol), parseFloat(trade.price));
        });
      }
    }
  }, [venue]);

  // Update order status
  const updateOrderStatus = useCallback((orderId: string, status: WebSocketOrder['status']) => {
    setOrders(prev => {
      const updated = new Map(prev);
      const order = updated.get(orderId);
      if (order) {
        updated.set(orderId, { ...order, status });
      }
      return updated;
    });
  }, []);

  // Handle fill
  const handleFill = useCallback((orderId: string, size: number, price: number) => {
    setOrders(prev => {
      const updated = new Map(prev);
      const order = updated.get(orderId);
      if (order) {
        const filledAt = Date.now();
        const latencyMs = filledAt - order.submittedAt;
        
        const filledOrder: WebSocketOrder = {
          ...order,
          filledQuantity: order.filledQuantity + size,
          filledPrice: price,
          filledAt,
          latencyMs,
          status: order.filledQuantity + size >= order.quantity ? 'filled' : 'partial',
        };
        
        updated.set(orderId, filledOrder);
        
        // Trigger callback
        if (filledOrder.status === 'filled') {
          onFill?.(filledOrder);
          updateMetrics(filledOrder);
        }
      }
      return updated;
    });
  }, [onFill]);

  // Update execution metrics
  const updateMetrics = useCallback((order: WebSocketOrder) => {
    setMetrics(prev => {
      const totalOrders = prev.totalOrders + 1;
      const filledOrders = order.status === 'filled' ? prev.filledOrders + 1 : prev.filledOrders;
      
      const latencies = order.latencyMs ? [...Array(prev.filledOrders).fill(prev.avgLatencyMs), order.latencyMs] : [];
      const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : prev.avgLatencyMs;
      
      // Calculate slippage if limit order
      const slippageBps = order.type === 'limit' && order.price 
        ? Math.abs((order.filledPrice - order.price) / order.price) * 10000
        : 0;
      
      return {
        totalOrders,
        filledOrders,
        avgLatencyMs,
        avgSlippageBps: (prev.avgSlippageBps * prev.filledOrders + slippageBps) / filledOrders,
        fillRate: filledOrders / totalOrders,
      };
    });
  }, []);

  // Submit order via REST (WebSocket is for receiving updates)
  const submitOrderInternal = useCallback(async (order: WebSocketOrder) => {
    // Use edge function for actual order placement
    const { data, error } = await supabase.functions.invoke(`${venue}-trading/place-order`, {
      body: {
        instrument: order.symbol,
        side: order.side,
        size: order.quantity,
        price: order.price,
        order_type: order.type,
      },
    });

    if (error) {
      updateOrderStatus(order.id, 'rejected');
      onReject?.(order, error.message);
    }
    
    return data;
  }, [venue, onReject]);

  // Submit order (public interface)
  const submitOrder = useCallback(async (params: {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    quantity: number;
    price?: number;
  }): Promise<WebSocketOrder> => {
    const order: WebSocketOrder = {
      id: crypto.randomUUID(),
      ...params,
      status: 'pending',
      filledQuantity: 0,
      filledPrice: 0,
      submittedAt: Date.now(),
      venue,
    };

    setOrders(prev => new Map(prev).set(order.id, order));

    if (isConnected) {
      await submitOrderInternal(order);
    } else {
      orderQueueRef.current.push(order);
    }

    return order;
  }, [venue, isConnected, submitOrderInternal]);

  // Cancel order
  const cancelOrder = useCallback(async (orderId: string) => {
    const { error } = await supabase.functions.invoke(`${venue}-trading/cancel-order`, {
      body: { order_id: orderId },
    });

    if (!error) {
      updateOrderStatus(orderId, 'cancelled');
    }
    
    return !error;
  }, [venue]);

  // Initialize connection
  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => {
      wsRef.current?.close();
    };
  }, [enabled, connect]);

  return {
    isConnected,
    orders: Array.from(orders.values()),
    metrics,
    submitOrder,
    cancelOrder,
    connect,
    disconnect: () => wsRef.current?.close(),
  };
}

// Hook for low-latency market making
export function useMarketMaking(
  symbol: string,
  config: {
    baseSpreadBps: number;
    inventorySkewFactor: number;
    maxInventoryPct: number;
    refreshIntervalMs: number;
  },
  enabled: boolean = false
) {
  const [quotes, setQuotes] = useState<{
    bidPrice: number;
    bidSize: number;
    askPrice: number;
    askSize: number;
  } | null>(null);
  const [inventory, setInventory] = useState(0);
  const [pnl, setPnl] = useState(0);

  const { submitOrder, cancelOrder, orders, isConnected } = useWebSocketExecution({
    venue: 'coinbase',
    enabled,
    onFill: (order) => {
      // Update inventory on fill
      const delta = order.side === 'buy' ? order.filledQuantity : -order.filledQuantity;
      setInventory(prev => prev + delta);
      
      // Track P&L
      const fillValue = order.filledQuantity * order.filledPrice;
      const pnlDelta = order.side === 'buy' ? -fillValue : fillValue;
      setPnl(prev => prev + pnlDelta);
      
      toast.success(`MM Fill: ${order.side} ${order.filledQuantity} @ ${order.filledPrice}`);
    },
  });

  // Calculate optimal quotes based on inventory
  const calculateQuotes = useCallback((midPrice: number) => {
    const halfSpread = midPrice * (config.baseSpreadBps / 10000 / 2);
    
    // Skew quotes based on inventory
    const inventorySkew = inventory * config.inventorySkewFactor * halfSpread;
    
    const bidPrice = midPrice - halfSpread - inventorySkew;
    const askPrice = midPrice + halfSpread - inventorySkew;
    
    // Size based on inventory limits
    const maxPosition = 1; // In base currency
    const baseSize = 0.01;
    
    const bidSize = Math.max(0, Math.min(baseSize, maxPosition * (1 + config.maxInventoryPct / 100) - inventory));
    const askSize = Math.max(0, Math.min(baseSize, inventory + maxPosition * (1 + config.maxInventoryPct / 100)));
    
    return { bidPrice, bidSize, askPrice, askSize };
  }, [inventory, config]);

  return {
    quotes,
    inventory,
    pnl,
    isConnected,
    orders,
    setQuotes: (midPrice: number) => setQuotes(calculateQuotes(midPrice)),
    submitOrder,
    cancelOrder,
  };
}
