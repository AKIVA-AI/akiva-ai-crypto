import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ArbPnlEntry {
  id: string;
  intent_id: string;
  net_pnl: number;
  gross_pnl: number;
  fees: number;
  slippage: number;
  ts: string;
}

export interface ArbPnlHistoryEntry {
  timestamp: number;
  pnl: number;
  tradeId: string;
  symbol: string;
}

export interface ArbPnlStats {
  tradesExecuted: number;
  totalProfit: number;
  totalLoss: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
}

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const computeMaxDrawdown = (pnlSeries: number[]) => {
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;

  pnlSeries.forEach((pnl) => {
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  return maxDrawdown;
};

export function useArbPnlAnalytics(limit = 200) {
  return useQuery({
    queryKey: ['arb-pnl-analytics', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('arb_pnl')
        .select('id, intent_id, net_pnl, gross_pnl, fees, slippage, ts')
        .order('ts', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Type guard to ensure data is valid ArbPnlEntry[]
      const entries = (data || []).filter((item): item is ArbPnlEntry => 
        item && 
        typeof item.id === 'string' &&
        typeof item.intent_id === 'string' &&
        typeof item.net_pnl === 'number' &&
        typeof item.gross_pnl === 'number' &&
        typeof item.fees === 'number' &&
        typeof item.slippage === 'number' &&
        typeof item.ts === 'string'
      ).slice().reverse();
      const pnlSeries = entries.map((entry) => entry.net_pnl);
      const totalProfit = entries
        .filter((entry) => entry.net_pnl > 0)
        .reduce((sum, entry) => sum + entry.net_pnl, 0);
      const totalLoss = entries
        .filter((entry) => entry.net_pnl < 0)
        .reduce((sum, entry) => sum + Math.abs(entry.net_pnl), 0);
      const winCount = entries.filter((entry) => entry.net_pnl > 0).length;
      const lossCount = entries.filter((entry) => entry.net_pnl < 0).length;
      const tradesExecuted = entries.length;
      const winRate = tradesExecuted > 0 ? (winCount / tradesExecuted) * 100 : 0;
      const avgWin = winCount > 0 ? totalProfit / winCount : 0;
      const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : Infinity;
      const maxDrawdown = computeMaxDrawdown(pnlSeries);

      const dailyPnL = entries
        .filter((entry) => new Date(entry.ts) >= startOfToday())
        .reduce((sum, entry) => sum + entry.net_pnl, 0);

      const history: ArbPnlHistoryEntry[] = entries.map((entry) => ({
        timestamp: new Date(entry.ts).getTime(),
        pnl: entry.net_pnl,
        tradeId: entry.intent_id ?? entry.id,
        symbol: 'ARB',
      }));

      const stats: ArbPnlStats = {
        tradesExecuted,
        totalProfit,
        totalLoss,
        winCount,
        lossCount,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
        maxDrawdown,
      };

      return {
        dailyPnL,
        stats,
        history,
      };
    },
    refetchInterval: 10000,
  });
}
