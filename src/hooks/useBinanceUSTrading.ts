import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const invokeBinanceUS = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke('binance-us-trading', {
    body: { action, params },
  });

  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data.data;
};

// Status hook
export function useBinanceUSStatus() {
  return useQuery({
    queryKey: ['binance-us', 'status'],
    queryFn: () => invokeBinanceUS('status'),
    staleTime: 60 * 1000,
  });
}

// Account hook
export function useBinanceUSAccount() {
  return useQuery({
    queryKey: ['binance-us', 'account'],
    queryFn: () => invokeBinanceUS('account'),
    staleTime: 10 * 1000,
  });
}

// Price hook
export function useBinanceUSPrice(symbol?: string) {
  return useQuery({
    queryKey: ['binance-us', 'price', symbol],
    queryFn: () => invokeBinanceUS('price', { symbol }),
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000,
  });
}

// Ticker hook
export function useBinanceUSTicker(symbol?: string) {
  return useQuery({
    queryKey: ['binance-us', 'ticker', symbol],
    queryFn: () => invokeBinanceUS('ticker', { symbol }),
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}

// Order book hook
export function useBinanceUSOrderBook(symbol: string, limit: number = 20) {
  return useQuery({
    queryKey: ['binance-us', 'orderbook', symbol, limit],
    queryFn: () => invokeBinanceUS('orderbook', { symbol, limit }),
    staleTime: 2 * 1000,
    refetchInterval: 2 * 1000,
    enabled: !!symbol,
  });
}

// Open orders hook
export function useBinanceUSOpenOrders(symbol?: string) {
  return useQuery({
    queryKey: ['binance-us', 'open_orders', symbol],
    queryFn: () => invokeBinanceUS('open_orders', { symbol }),
    staleTime: 5 * 1000,
  });
}

// Place order mutation
export function useBinanceUSPlaceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      symbol: string;
      side: 'BUY' | 'SELL';
      type?: 'LIMIT' | 'MARKET' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT_LIMIT';
      quantity: number;
      price?: number;
      stopPrice?: number;
      timeInForce?: 'GTC' | 'IOC' | 'FOK';
    }) => invokeBinanceUS('place_order', params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['binance-us', 'account'] });
      queryClient.invalidateQueries({ queryKey: ['binance-us', 'open_orders'] });
      
      if (data.simulated) {
        toast.info('Order simulated', { description: 'Configure API keys for live trading' });
      } else {
        toast.success('Order placed', { description: `Order ${data.orderId} submitted` });
      }
    },
    onError: (error: Error) => {
      toast.error('Order failed', { description: error.message });
    },
  });
}

// Cancel order mutation
export function useBinanceUSCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { symbol: string; orderId: string }) =>
      invokeBinanceUS('cancel_order', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-us', 'open_orders'] });
      toast.success('Order canceled');
    },
    onError: (error: Error) => {
      toast.error('Cancel failed', { description: error.message });
    },
  });
}

// Klines/candles hook
export function useBinanceUSKlines(symbol: string, interval: string = '1h', limit: number = 100) {
  return useQuery({
    queryKey: ['binance-us', 'klines', symbol, interval, limit],
    queryFn: () => invokeBinanceUS('klines', { symbol, interval, limit }),
    staleTime: 60 * 1000,
    enabled: !!symbol,
  });
}

// My trades hook
export function useBinanceUSMyTrades(symbol: string) {
  return useQuery({
    queryKey: ['binance-us', 'my_trades', symbol],
    queryFn: () => invokeBinanceUS('my_trades', { symbol }),
    staleTime: 30 * 1000,
    enabled: !!symbol,
  });
}

// Exchange info hook
export function useBinanceUSExchangeInfo() {
  return useQuery({
    queryKey: ['binance-us', 'exchange_info'],
    queryFn: () => invokeBinanceUS('exchange_info'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
