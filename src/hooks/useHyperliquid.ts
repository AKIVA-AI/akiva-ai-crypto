import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface HyperliquidOrder {
  bookId: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  orderType: 'market' | 'limit';
  strategyId?: string;
}

export interface HyperliquidOrderResult {
  id: string;
  hlOrderId: string;
  status: string;
  filledSize: number;
  avgPrice: number;
  latencyMs: number;
}

export function useHyperliquidHealth() {
  return useQuery({
    queryKey: ['hyperliquid-health'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('hyperliquid', {
        body: { action: 'health_check' },
      });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useHyperliquidMarketData(instruments: string[]) {
  return useQuery({
    queryKey: ['hyperliquid-market-data', instruments],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('hyperliquid', {
        body: { action: 'get_market_data', instruments },
      });
      
      if (error) throw error;
      return data.data;
    },
    refetchInterval: 5000,
    enabled: instruments.length > 0,
  });
}

export function useHyperliquidFundingRates(instruments: string[]) {
  return useQuery({
    queryKey: ['hyperliquid-funding-rates', instruments],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('hyperliquid', {
        body: { action: 'get_funding_rates', instruments },
      });
      
      if (error) throw error;
      return data.fundingRates;
    },
    refetchInterval: 60000,
    enabled: instruments.length > 0,
  });
}

export function useHyperliquidPlaceOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (order: HyperliquidOrder): Promise<{ order: HyperliquidOrderResult; venue: string; mode: string }> => {
      const { data, error } = await supabase.functions.invoke('hyperliquid', {
        body: { action: 'place_order', ...order },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success(
        `HyperLiquid: ${data.order.filledSize} filled @ $${data.order.avgPrice.toFixed(2)}`,
        { description: `Latency: ${data.order.latencyMs}ms | Mode: ${data.mode}` }
      );
    },
    onError: (error) => {
      toast.error(`HyperLiquid order failed: ${error.message}`);
    },
  });
}

export function useHyperliquidPositions() {
  return useQuery({
    queryKey: ['hyperliquid-positions'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('hyperliquid', {
        body: { action: 'get_positions' },
      });
      
      if (error) throw error;
      return data.positions;
    },
    refetchInterval: 10000,
  });
}
