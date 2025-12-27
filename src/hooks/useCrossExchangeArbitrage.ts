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

// Scan for opportunities
export function useArbitrageScan(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD'],
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

// Convenience hook for real-time monitoring
export function useArbitrageMonitor(enabled: boolean = true) {
  const scan = useArbitrageScan(['BTC/USD', 'ETH/USD', 'SOL/USD'], 0.05, enabled);
  const status = useArbitrageStatus();

  return {
    opportunities: scan.data?.opportunities || [],
    isScanning: scan.isLoading,
    lastScan: scan.data?.timestamp,
    status: status.data,
    refetch: scan.refetch,
  };
}
