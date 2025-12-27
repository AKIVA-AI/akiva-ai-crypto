import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const invokeArbitrage = async (action: string, params: Record<string, any> = {}) => {
  const { data, error } = await supabase.functions.invoke('cross-exchange-arbitrage', {
    body: { action, params },
  });

  if (error) throw error;
  if (!data.success) throw new Error(data.error);
  return data.data;
};

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

// Scan for opportunities - now includes all 5 pairs
export function useArbitrageScan(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'],
  minSpreadPercent: number = 0.1,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['arbitrage', 'scan', symbols, minSpreadPercent],
    queryFn: () => invokeArbitrage('scan', { symbols, minSpreadPercent }),
    staleTime: 5 * 1000,
    refetchInterval: enabled ? 10 * 1000 : false,
    enabled,
  });
}

// Get prices for a symbol across exchanges
export function useArbitragePrices(symbol: string) {
  return useQuery({
    queryKey: ['arbitrage', 'prices', symbol],
    queryFn: () => invokeArbitrage('prices', { symbol }),
    staleTime: 2 * 1000,
    refetchInterval: 5 * 1000,
    enabled: !!symbol,
  });
}

// Get arbitrage system status
export function useArbitrageStatus() {
  return useQuery({
    queryKey: ['arbitrage', 'status'],
    queryFn: () => invokeArbitrage('status'),
    staleTime: 60 * 1000,
  });
}

// Test arbitrage execution flow
export function useTestArbitrageExecution() {
  return useMutation({
    mutationFn: () => invokeArbitrage('test'),
    onSuccess: (data) => {
      toast.success('Test execution completed', {
        description: `Net profit: $${data.netProfit?.toFixed(2) || '0.00'}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Test failed', { description: error.message });
    },
  });
}

// Analyze specific opportunity
export function useAnalyzeOpportunity() {
  return useMutation({
    mutationFn: (opportunity: ArbitrageOpportunity) =>
      invokeArbitrage('analyze', { opportunity }),
    onError: (error: Error) => {
      toast.error('Analysis failed', { description: error.message });
    },
  });
}

// Execute arbitrage trade
export function useExecuteArbitrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (opportunity: ArbitrageOpportunity) =>
      invokeArbitrage('execute', { opportunity }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      
      if (data.status === 'SIMULATED') {
        toast.info('Trade simulated', {
          description: `Potential profit: $${data.realizedProfit?.toFixed(2) || 'N/A'}`,
        });
      } else {
        toast.success('Arbitrage executed', {
          description: `Realized profit: $${data.realizedProfit?.toFixed(2)}`,
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Execution failed', { description: error.message });
    },
  });
}

// Convenience hook for real-time monitoring - now includes all 5 pairs
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

// Auto-execute settings interface
export interface AutoExecuteSettings {
  enabled: boolean;
  minProfitThreshold: number; // Minimum profit in USD
  maxPositionSize: number; // Maximum position size
  cooldownMs: number; // Cooldown between trades
}

// Hook for auto-execute functionality
export function useAutoExecuteArbitrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Omit<AutoExecuteSettings, 'enabled'>) =>
      invokeArbitrage('auto-execute', {
        minProfitThreshold: settings.minProfitThreshold,
        maxPositionSize: settings.maxPositionSize,
        cooldownMs: settings.cooldownMs,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      
      if (data.executed > 0) {
        toast.success('Auto-execute trade completed', {
          description: `Net profit: $${data.trades[0]?.netProfit?.toFixed(2) || 'N/A'}`,
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Auto-execute failed', { description: error.message });
    },
  });
}

// Kill switch hook
export function useKillSwitch() {
  const queryClient = useQueryClient();

  const activate = useMutation({
    mutationFn: (reason: string) =>
      invokeArbitrage('kill-switch', { action: 'activate', reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      toast.error('Kill switch activated', {
        description: 'All arbitrage trading has been halted',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to activate kill switch', { description: error.message });
    },
  });

  const deactivate = useMutation({
    mutationFn: () =>
      invokeArbitrage('kill-switch', { action: 'deactivate' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      toast.success('Kill switch deactivated', {
        description: 'Arbitrage trading resumed',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to deactivate kill switch', { description: error.message });
    },
  });

  const status = useQuery({
    queryKey: ['arbitrage', 'kill-switch'],
    queryFn: () => invokeArbitrage('kill-switch', {}),
    staleTime: 5000,
    refetchInterval: 10000,
  });

  return {
    isActive: status.data?.active || false,
    reason: status.data?.reason || '',
    activatedAt: status.data?.activatedAt,
    activate,
    deactivate,
    isLoading: status.isLoading,
  };
}

// Daily P&L limits hook
export function useDailyPnLLimits() {
  const queryClient = useQueryClient();

  const setLimit = useMutation({
    mutationFn: (limit: number) =>
      invokeArbitrage('pnl-limits', { setLimit: limit }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      toast.success('Daily P&L limit updated', {
        description: `New limit: $${data.dailyPnLLimit}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to set P&L limit', { description: error.message });
    },
  });

  const resetPnL = useMutation({
    mutationFn: () =>
      invokeArbitrage('pnl-limits', { reset: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      toast.success('Daily P&L reset');
    },
    onError: (error: Error) => {
      toast.error('Failed to reset P&L', { description: error.message });
    },
  });

  const status = useQuery({
    queryKey: ['arbitrage', 'pnl-limits'],
    queryFn: () => invokeArbitrage('pnl-limits', {}),
    staleTime: 5000,
    refetchInterval: 10000,
  });

  return {
    dailyPnL: status.data?.dailyPnL || 0,
    dailyPnLLimit: status.data?.dailyPnLLimit || -500,
    dailyPnLDate: status.data?.dailyPnLDate || '',
    limitBreached: status.data?.limitBreached || false,
    percentUsed: status.data?.percentUsed || 0,
    setLimit,
    resetPnL,
    isLoading: status.isLoading,
  };
}

// P&L Analytics hook
export interface PnLHistoryEntry {
  timestamp: number;
  pnl: number;
  tradeId: string;
  symbol: string;
}

export interface DailyStats {
  tradesExecuted: number;
  totalProfit: number;
  totalLoss: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  peakPnL: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export interface PositionSizingRules {
  baseSize: number;
  minSize: number;
  maxSize: number;
  scaleDownAt70Percent: boolean;
  scaleDownAt90Percent: boolean;
  currentSize?: number;
}

export function usePnLAnalytics() {
  const queryClient = useQueryClient();

  const analytics = useQuery({
    queryKey: ['arbitrage', 'analytics'],
    queryFn: () => invokeArbitrage('analytics', {}),
    staleTime: 5000,
    refetchInterval: 10000,
  });

  return {
    dailyPnL: analytics.data?.dailyPnL || 0,
    dailyPnLLimit: analytics.data?.dailyPnLLimit || -500,
    percentUsed: analytics.data?.percentUsed || 0,
    stats: analytics.data?.stats as DailyStats | undefined,
    history: (analytics.data?.history || []) as PnLHistoryEntry[],
    positionSizing: analytics.data?.positionSizing as PositionSizingRules | undefined,
    warningAlertsSent: analytics.data?.warningAlertsSent || { at70: false, at90: false },
    isLoading: analytics.isLoading,
    refetch: analytics.refetch,
  };
}

// Position sizing hook
export function usePositionSizing() {
  const queryClient = useQueryClient();

  const updateRules = useMutation({
    mutationFn: (rules: Partial<PositionSizingRules>) =>
      invokeArbitrage('position-sizing', rules),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage'] });
      toast.success('Position sizing updated', {
        description: `Current size: ${data.currentSize.toFixed(4)}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update position sizing', { description: error.message });
    },
  });

  const status = useQuery({
    queryKey: ['arbitrage', 'position-sizing'],
    queryFn: () => invokeArbitrage('position-sizing', {}),
    staleTime: 10000,
  });

  return {
    rules: status.data?.positionSizingRules as PositionSizingRules | undefined,
    currentSize: status.data?.currentSize || 0.1,
    pnlPercentUsed: status.data?.pnlPercentUsed || 0,
    updateRules,
    isLoading: status.isLoading,
  };
}
