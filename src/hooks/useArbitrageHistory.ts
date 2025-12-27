import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ArbitrageExecution {
  id: string;
  opportunity_id: string;
  symbol: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  spread_percent: number;
  gross_profit: number;
  trading_fees: number;
  withdrawal_fee: number;
  slippage: number;
  net_profit: number;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'simulated';
  buy_order_id?: string;
  sell_order_id?: string;
  executed_at?: string;
  completed_at?: string;
  error_message?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useArbitrageHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['arbitrage-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arbitrage_executions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as ArbitrageExecution[];
    },
    refetchInterval: 10000,
  });
}

export function useArbitrageStats() {
  return useQuery({
    queryKey: ['arbitrage-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arbitrage_executions')
        .select('*');

      if (error) throw error;

      const executions = data as ArbitrageExecution[];
      const completed = executions.filter(e => e.status === 'completed' || e.status === 'simulated');
      const failed = executions.filter(e => e.status === 'failed');
      
      const totalProfit = completed.reduce((sum, e) => sum + e.net_profit, 0);
      const totalFees = completed.reduce((sum, e) => sum + e.trading_fees + e.withdrawal_fee, 0);
      const avgSpread = completed.length > 0 
        ? completed.reduce((sum, e) => sum + e.spread_percent, 0) / completed.length 
        : 0;

      return {
        totalExecutions: executions.length,
        completedCount: completed.length,
        failedCount: failed.length,
        successRate: executions.length > 0 ? (completed.length / executions.length) * 100 : 0,
        totalProfit,
        totalFees,
        avgSpread,
      };
    },
  });
}

export function useRecordArbitrageExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (execution: Omit<ArbitrageExecution, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('arbitrage_executions')
        .insert(execution)
        .select()
        .single();

      if (error) throw error;
      return data as ArbitrageExecution;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage-history'] });
      queryClient.invalidateQueries({ queryKey: ['arbitrage-stats'] });
      
      if (data.status === 'simulated') {
        toast.info('Trade simulated', {
          description: `${data.symbol}: $${data.net_profit.toFixed(2)} potential profit`,
        });
      } else if (data.status === 'completed') {
        toast.success('Arbitrage executed', {
          description: `${data.symbol}: $${data.net_profit.toFixed(2)} profit`,
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to record execution', { description: error.message });
    },
  });
}

export function useUpdateArbitrageExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ArbitrageExecution> }) => {
      const { data, error } = await supabase
        .from('arbitrage_executions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ArbitrageExecution;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage-history'] });
      queryClient.invalidateQueries({ queryKey: ['arbitrage-stats'] });
    },
  });
}
