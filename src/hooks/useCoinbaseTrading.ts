import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CoinbaseStatus {
  configured: boolean;
  connected: boolean;
  accountInfo: {
    accountCount: number;
    hasUSD: boolean;
  } | null;
  features: {
    spot: boolean;
    futures: boolean;
    perpetuals: boolean;
    margin: boolean;
  };
  regions: {
    usCompliant: boolean;
    available: string[];
  };
}

interface CoinbaseBalance {
  currency: string;
  available: string;
  hold: string;
  total: string;
}

interface CoinbaseProduct {
  product_id: string;
  base_currency: string;
  quote_currency: string;
  price: number;
  bid: number;
  ask: number;
}

interface PlaceOrderParams {
  book_id?: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  order_type?: 'market' | 'limit';
  strategy_id?: string;
}

interface OrderResult {
  success: boolean;
  order_id: string;
  mode: 'live' | 'simulation';
  venue: string;
  filled_price: number;
  filled_size: number;
  fee: number;
  latency_ms: number;
  slippage_bps: number;
  message: string;
}

export function useCoinbaseStatus() {
  return useQuery({
    queryKey: ['coinbase-status'],
    queryFn: async (): Promise<CoinbaseStatus> => {
      const { data, error } = await supabase.functions.invoke('coinbase-trading/status');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Check every 30 seconds
  });
}

export function useCoinbaseBalances() {
  return useQuery({
    queryKey: ['coinbase-balances'],
    queryFn: async (): Promise<{ balances: CoinbaseBalance[]; simulation?: boolean }> => {
      const { data, error } = await supabase.functions.invoke('coinbase-trading/balances');
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useCoinbaseTicker(productId: string = 'BTC-USD') {
  return useQuery({
    queryKey: ['coinbase-ticker', productId],
    queryFn: async () => {
      // Edge function expects product_id as query param
      const { data, error } = await supabase.functions.invoke(
        `coinbase-trading/ticker?product_id=${productId}`
      );
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}

export function useCoinbaseProducts() {
  return useQuery({
    queryKey: ['coinbase-products'],
    queryFn: async (): Promise<{ products: CoinbaseProduct[] }> => {
      const { data, error } = await supabase.functions.invoke('coinbase-trading/products');
      if (error) throw error;
      return data;
    },
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useCoinbasePlaceOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: PlaceOrderParams): Promise<OrderResult> => {
      const { data, error } = await supabase.functions.invoke('coinbase-trading/place-order', {
        body: params,
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['coinbase-balances'] });
      queryClient.invalidateQueries({ queryKey: ['trading-positions'] });
      queryClient.invalidateQueries({ queryKey: ['trading-orders'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      const icon = result.mode === 'live' ? '🔵' : '📋';
      toast.success(`${icon} ${result.message}`, {
        description: `${result.filled_size} @ $${result.filled_price.toFixed(2)} | Fee: $${result.fee.toFixed(2)}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Coinbase Order Failed', {
        description: error.message,
      });
    },
  });
}

export function useCoinbaseCancelOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('coinbase-trading/cancel-order', {
        body: { order_id: orderId },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coinbase-orders'] });
      toast.success('Order cancelled');
    },
    onError: (error: Error) => {
      toast.error('Failed to cancel order', { description: error.message });
    },
  });
}

export function useCoinbaseOrders(productId?: string) {
  return useQuery({
    queryKey: ['coinbase-orders', productId],
    queryFn: async () => {
      const path = productId 
        ? `coinbase-trading/orders?product_id=${productId}` 
        : 'coinbase-trading/orders';
      const { data, error } = await supabase.functions.invoke(path);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}
