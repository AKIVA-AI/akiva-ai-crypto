import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ArbPnlRow {
  id: string;
  intent_id: string;
  gross_pnl: number;
  fees: number;
  slippage: number;
  net_pnl: number;
  tenant_id: string;
  ts: string;
}

export function useArbitrageHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['arb-pnl-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arb_pnl')
        .select('*')
        .order('ts', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Type guard to ensure data is valid ArbPnlRow[]
      return (data || []).filter((item): item is ArbPnlRow => 
        item && 
        typeof item.id === 'string' &&
        typeof item.intent_id === 'string' &&
        typeof item.gross_pnl === 'number' &&
        typeof item.fees === 'number' &&
        typeof item.slippage === 'number' &&
        typeof item.net_pnl === 'number' &&
        typeof item.tenant_id === 'string' &&
        typeof item.ts === 'string'
      );
    },
    refetchInterval: 10000,
  });
}

export function useArbitrageStats() {
  return useQuery({
    queryKey: ['arb-pnl-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arb_pnl')
        .select('net_pnl');

      if (error) throw error;

      const executions = data as Pick<ArbPnlRow, 'net_pnl'>[];
      const completed = executions.filter((e) => e.net_pnl !== 0);
      const wins = completed.filter((e) => e.net_pnl > 0);
      const losses = completed.filter((e) => e.net_pnl < 0);

      const totalProfit = wins.reduce((sum, e) => sum + e.net_pnl, 0);
      const totalLoss = losses.reduce((sum, e) => sum + Math.abs(e.net_pnl), 0);

      return {
        totalExecutions: executions.length,
        completedCount: completed.length,
        failedCount: losses.length,
        successRate: executions.length > 0 ? (wins.length / executions.length) * 100 : 0,
        totalProfit,
        totalFees: 0,
        avgSpread: 0,
      };
    },
  });
}
