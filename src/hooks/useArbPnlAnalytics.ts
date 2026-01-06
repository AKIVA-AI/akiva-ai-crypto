import { useQuery } from '@tanstack/react-query';

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

// Note: The arb_pnl table does not exist in the current schema.
// This hook returns mock data until the table is created.

export function useArbPnlAnalytics(limit = 200) {
  return useQuery({
    queryKey: ['arb-pnl-analytics', limit],
    queryFn: async () => {
      // Return default analytics since arb_pnl table doesn't exist yet
      // TODO: Implement when arb_pnl table is created
      
      const history: ArbPnlHistoryEntry[] = [];
      
      const stats: ArbPnlStats = {
        tradesExecuted: 0,
        totalProfit: 0,
        totalLoss: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
      };

      return {
        dailyPnL: 0,
        stats,
        history,
      };
    },
    refetchInterval: 10000,
  });
}
