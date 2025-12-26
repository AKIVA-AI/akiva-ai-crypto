import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PlaceOrderParams {
  book_id: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  order_type?: 'market' | 'limit';
  strategy_id?: string;
  venue_id?: string;
}

interface OrderResult {
  success: boolean;
  order: any;
  paper_mode: boolean;
  message: string;
}

interface TradingOverview {
  aum: number;
  exposure: number;
  unrealizedPnl: number;
  openPositions: number;
  recentOrders: number;
  paperMode: boolean;
  killSwitch: boolean;
}

interface ApiHealth {
  status: string;
  timestamp: string;
  paper_mode: boolean;
  kill_switch: boolean;
  enabled_venues: number;
  open_positions: number;
  version: string;
}

export function useTradingOverview() {
  return useQuery({
    queryKey: ['trading-overview'],
    queryFn: async (): Promise<TradingOverview> => {
      const { data, error } = await supabase.functions.invoke('trading-api/overview');
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}

export function useTradingHealth() {
  return useQuery({
    queryKey: ['trading-health'],
    queryFn: async (): Promise<ApiHealth> => {
      const { data, error } = await supabase.functions.invoke('trading-api/health');
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useTradingPositions(bookId?: string) {
  return useQuery({
    queryKey: ['trading-positions', bookId],
    queryFn: async () => {
      const path = bookId ? `trading-api/positions?book_id=${bookId}` : 'trading-api/positions';
      const { data, error } = await supabase.functions.invoke(path);
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000,
  });
}

export function useTradingOrders(status?: string, limit = 50) {
  return useQuery({
    queryKey: ['trading-orders', status, limit],
    queryFn: async () => {
      let path = `trading-api/orders?limit=${limit}`;
      if (status) path += `&status=${status}`;
      const { data, error } = await supabase.functions.invoke(path);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}

export function useTradingVenues() {
  return useQuery({
    queryKey: ['trading-venues'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('trading-api/venues');
      if (error) throw error;
      return data;
    },
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: PlaceOrderParams): Promise<OrderResult> => {
      const { data, error } = await supabase.functions.invoke('trading-api/place-order', {
        body: params,
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['trading-positions'] });
      queryClient.invalidateQueries({ queryKey: ['trading-orders'] });
      queryClient.invalidateQueries({ queryKey: ['trading-overview'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      toast.success(result.message, {
        description: result.paper_mode 
          ? 'This was a paper trade (simulated)'
          : 'Order submitted to venue',
      });
    },
    onError: (error: Error) => {
      toast.error('Order Failed', {
        description: error.message,
      });
    },
  });
}
