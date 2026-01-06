import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExchangeBalance {
  exchange: string;
  currency: string;
  available: number;
  total: number;
  timestamp: number;
}

export interface BalanceSummary {
  balances: ExchangeBalance[];
  summary: Record<string, { usdAvailable: number; assets: ExchangeBalance[] }>;
  totalUsdAvailable: number;
  timestamp: number;
  exchangesConnected: {
    coinbase: boolean;
    kraken: boolean;
    binance_us: boolean;
  };
}

export interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  volume: number;
  confidence: number;
  timestamp: number;
  costs?: {
    tradingFees: number;
    withdrawalFee: number;
    slippage: number;
    totalCost: number;
    netProfit: number;
  };
}

// Note: The arb_spreads and spot_quotes tables do not exist in the current schema.
// These hooks return mock data until the tables are created.

export function useArbitrageScan(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'],
  minSpreadPercent: number = 0.1,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['arb-spreads-scan', symbols, minSpreadPercent],
    queryFn: async () => {
      // Return empty data since arb_spreads/spot_quotes tables don't exist yet
      // TODO: Implement when arb_spreads and spot_quotes tables are created
      return {
        opportunities: [] as ArbitrageOpportunity[],
        timestamp: Date.now(),
      };
    },
    staleTime: 5 * 1000,
    refetchInterval: enabled ? 10 * 1000 : false,
    enabled,
  });
}

export function useArbitragePrices(symbol: string) {
  return useQuery({
    queryKey: ['arb-prices', symbol],
    queryFn: async () => {
      // Return empty data since spot_quotes table doesn't exist yet
      // TODO: Implement when spot_quotes table is created
      return [];
    },
    staleTime: 2 * 1000,
    refetchInterval: 5 * 1000,
    enabled: !!symbol,
  });
}

export function useArbitrageStatus() {
  return useQuery({
    queryKey: ['arb-status'],
    queryFn: async () => {
      // Return default status since arb_spreads table doesn't exist yet
      // TODO: Implement when arb_spreads table is created
      return {
        isRunning: false,
        activeStrategies: [] as string[],
        totalOpportunities: 0,
        actionableOpportunities: 0,
        lastScanAt: new Date().toISOString(),
        profitToday: 0,
        profitAllTime: 0,
      };
    },
    staleTime: 60 * 1000,
  });
}

export function useTestArbitrageExecution() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Execution is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Test execution unavailable', { description: error.message });
    },
  });
}

export function useAnalyzeOpportunity() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Analysis is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Analysis unavailable', { description: error.message });
    },
  });
}

export function useExecuteArbitrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      throw new Error('Execution is handled by the backend OMS.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arb-spreads-scan'] });
    },
    onError: (error: Error) => {
      toast.error('Execution unavailable', { description: error.message });
    },
  });
}

export function useArbitrageMonitor(enabled: boolean = true) {
  const scan = useArbitrageScan(['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'], 0.05, enabled);
  const status = useArbitrageStatus();

  return {
    opportunities: scan.data?.opportunities || [],
    isScanning: scan.isLoading,
    lastScan: scan.data?.timestamp,
    status: status.data,
    refetch: scan.refetch,
  };
}

export function useAutoExecuteArbitrage() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Auto-execution is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Auto-execute unavailable', { description: error.message });
    },
  });
}

export function useKillSwitch() {
  return {
    isActive: false,
    reason: '',
    activatedAt: undefined,
    activate: () => undefined,
    deactivate: () => undefined,
    isLoading: false,
  };
}

export function useDailyPnLLimits() {
  return {
    dailyPnL: 0,
    dailyPnLLimit: 0,
    dailyPnLDate: '',
    limitBreached: false,
    percentUsed: 0,
    setLimit: () => undefined,
    resetPnL: () => undefined,
    isLoading: false,
  };
}

export function usePnLAnalytics() {
  return {
    dailyPnL: 0,
    dailyPnLLimit: 0,
    percentUsed: 0,
    stats: undefined,
    history: [],
    positionSizing: undefined,
    warningAlertsSent: { at70: false, at90: false },
    isLoading: false,
    refetch: () => undefined,
  };
}

export function usePositionSizing() {
  return {
    rules: undefined,
    currentSize: 0,
    pnlPercentUsed: 0,
    updateRules: { mutate: () => undefined, isPending: false },
    isLoading: false,
  };
}

export function useExchangeBalances(enabled: boolean = true) {
  return useQuery<BalanceSummary>({
    queryKey: ['arb-balances'],
    queryFn: async () => {
      return {
        balances: [],
        summary: {},
        totalUsdAvailable: 0,
        timestamp: Date.now(),
        exchangesConnected: {
          coinbase: false,
          kraken: false,
          binance_us: false,
        },
      };
    },
    enabled,
  });
}
