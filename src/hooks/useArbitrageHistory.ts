import { useQuery } from '@tanstack/react-query';

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

// Note: The arb_pnl table does not exist in the current schema.
// These hooks return mock data until the table is created.

export function useArbitrageHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['arb-pnl-history', limit],
    queryFn: async (): Promise<ArbPnlRow[]> => {
      // Return empty array since arb_pnl table doesn't exist yet
      // TODO: Implement when arb_pnl table is created
      return [];
    },
    refetchInterval: 10000,
  });
}

export function useArbitrageStats() {
  return useQuery({
    queryKey: ['arb-pnl-stats'],
    queryFn: async () => {
      // Return default stats since arb_pnl table doesn't exist yet
      // TODO: Implement when arb_pnl table is created
      return {
        totalExecutions: 0,
        completedCount: 0,
        failedCount: 0,
        successRate: 0,
        totalProfit: 0,
        totalFees: 0,
        avgSpread: 0,
      };
    },
  });
}
