import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TradeOrder {
  bookId: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  orderType: 'market' | 'limit';
  venue: string;
  strategyId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderResult {
  id: string;
  status: string;
  filledSize: number;
  filledPrice: number;
  fee: number;
  latencyMs: number;
  slippage: number;
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (order: TradeOrder): Promise<{ order: OrderResult; mode: string }> => {
      const { data, error } = await supabase.functions.invoke('live-trading', {
        body: { action: 'place_order', order },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success(
        `Order filled: ${data.order.filledSize} @ $${data.order.filledPrice.toFixed(2)}`,
        { description: `Mode: ${data.mode} | Latency: ${data.order.latencyMs}ms` }
      );
    },
    onError: (error) => {
      toast.error(`Order rejected: ${error.message}`);
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke('live-trading', {
        body: { action: 'cancel_order', orderId },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order cancelled');
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });
}

export function useClosePosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ positionId, percentage = 100 }: { positionId: string; percentage?: number }) => {
      const { data, error } = await supabase.functions.invoke('live-trading', {
        body: { action: 'close_position', positionId, percentage },
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(
        `Position closed: ${data.closedSize} @ $${data.closedPrice.toFixed(2)}`
      );
    },
    onError: (error) => {
      toast.error(`Failed to close position: ${error.message}`);
    },
  });
}
