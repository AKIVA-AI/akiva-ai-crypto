/**
 * useArbitrage - Unified Arbitrage Hook
 * 
 * CONSOLIDATES:
 * - useArbitrageEngine.ts (status, opportunities, control)
 * - useCrossExchangeArbitrage.ts (cross-exchange arb)
 * - useFundingArbitrage.ts (funding rate arb)
 * 
 * Provides a single interface for all arbitrage operations:
 * - Cross-exchange price arbitrage
 * - Funding rate arbitrage
 * - Engine control (start/stop)
 * - Real-time opportunity monitoring
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { arbitrageApi, ArbitrageOpportunity, FundingRate } from '@/lib/apiClient';

// ============================================================================
// TYPES
// ============================================================================

export type ArbitrageType = 'cross_exchange' | 'funding' | 'statistical' | 'triangular';

export interface ArbitrageOpportunityUnified {
  id: string;
  type: ArbitrageType;
  symbol: string;
  buyVenue: string;
  sellVenue: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  estimatedProfit: number;
  estimatedProfitPercent: number;
  riskLevel: 'low' | 'medium' | 'high';
  isActionable: boolean;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

export interface ArbitrageStatus {
  isRunning: boolean;
  activeStrategies: ArbitrageType[];
  totalOpportunities: number;
  actionableOpportunities: number;
  lastScanAt: string;
  profitToday: number;
  profitAllTime: number;
}

export interface ArbitrageSettings {
  enabled: boolean;
  minProfitThreshold: number;
  maxPositionSize: number;
  cooldownMs: number;
  enabledTypes: ArbitrageType[];
  paperMode: boolean;
}

// ============================================================================
// EDGE FUNCTION INVOKERS
// ============================================================================

async function invokeCrossExchangeArb<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cross-exchange-arbitrage', {
    body: { action, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeFundingArb<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
    body: { action, ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// ============================================================================
// STATUS & CONTROL HOOKS
// ============================================================================

/**
 * Unified arbitrage engine status
 */
export function useArbitrageStatus() {
  return useQuery({
    queryKey: ['arbitrage-status'],
    queryFn: async (): Promise<ArbitrageStatus> => {
      const response = await arbitrageApi.getStatus();
      if (response.error) throw new Error(response.error);
      // Map API response to our ArbitrageStatus type
      const data = response.data as { running?: boolean; strategies?: string[] } | undefined;
      return {
        isRunning: data?.running ?? false,
        activeStrategies: (data?.strategies ?? []) as ArbitrageType[],
        totalOpportunities: 0,
        actionableOpportunities: 0,
        lastScanAt: new Date().toISOString(),
        profitToday: 0,
        profitAllTime: 0,
      };
    },
    refetchInterval: 10000,
  });
}

/**
 * Start/stop arbitrage engine
 */
export function useArbitrageControl() {
  const queryClient = useQueryClient();
  
  const startMutation = useMutation({
    mutationFn: async (types?: ArbitrageType[]) => {
      const response = await arbitrageApi.start();
      if (response.error) throw new Error(response.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage-status'] });
      toast.success('🚀 Arbitrage engine started');
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const response = await arbitrageApi.stop();
      if (response.error) throw new Error(response.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage-status'] });
      toast.info('⏹️ Arbitrage engine stopped');
    },
  });

  return {
    start: startMutation.mutate,
    stop: stopMutation.mutate,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}

// ============================================================================
// OPPORTUNITY HOOKS
// ============================================================================

/**
 * Cross-exchange arbitrage opportunities
 */
export function useCrossExchangeOpportunities(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  minSpreadPercent = 0.1,
  enabled = true
) {
  return useQuery({
    queryKey: ['arbitrage-cross-exchange', symbols, minSpreadPercent],
    queryFn: () => invokeCrossExchangeArb<{ opportunities: ArbitrageOpportunityUnified[] }>('scan', {
      symbols,
      minSpreadPercent,
    }),
    enabled,
    refetchInterval: 10000,
    select: (data) => data.opportunities.map(opp => ({ ...opp, type: 'cross_exchange' as const })),
  });
}

/**
 * Funding rate arbitrage opportunities
 */
export function useFundingOpportunities(enabled = true) {
  return useQuery({
    queryKey: ['arbitrage-funding'],
    queryFn: () => invokeFundingArb<{
      opportunities: ArbitrageOpportunityUnified[];
      actionable: number;
      total: number;
    }>('scan_funding_opportunities'),
    enabled,
    refetchInterval: 60000, // Funding rates don't change as fast
    select: (data) => ({
      opportunities: data.opportunities.map(opp => ({ ...opp, type: 'funding' as const })),
      actionable: data.actionable,
      total: data.total,
    }),
  });
}

/**
 * Funding rate history for a symbol
 */
export function useFundingHistory(symbol: string, enabled = true) {
  return useQuery({
    queryKey: ['funding-history', symbol],
    queryFn: () => invokeFundingArb<{ history: FundingRate[] }>('funding_history', { symbol }),
    enabled: enabled && !!symbol,
    staleTime: 60000,
  });
}

/**
 * All arbitrage opportunities combined
 */
export function useAllArbitrageOpportunities(enabled = true) {
  const crossExchange = useCrossExchangeOpportunities(['BTC/USD', 'ETH/USD', 'SOL/USD'], 0.05, enabled);
  const funding = useFundingOpportunities(enabled);

  return {
    opportunities: [
      ...(crossExchange.data || []),
      ...(funding.data?.opportunities || []),
    ],
    crossExchange: crossExchange.data || [],
    funding: funding.data?.opportunities || [],
    isLoading: crossExchange.isLoading || funding.isLoading,
    error: crossExchange.error || funding.error,
    refetch: () => {
      crossExchange.refetch();
      funding.refetch();
    },
  };
}

// ============================================================================
// EXECUTION HOOKS
// ============================================================================

/**
 * Execute cross-exchange arbitrage
 */
export function useExecuteCrossExchangeArb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      opportunityId: string;
      symbol: string;
      buyVenue: string;
      sellVenue: string;
      size: number;
      paperMode: boolean;
    }) => invokeCrossExchangeArb('execute', params),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['arbitrage-positions'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success(data.message || '✅ Cross-exchange arbitrage executed');
    },
    onError: (error: Error) => {
      toast.error(`Arbitrage failed: ${error.message}`);
    },
  });
}

/**
 * Execute funding arbitrage
 */
export function useExecuteFundingArb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      opportunityId: string;
      symbol: string;
      direction: string;
      spotVenue: string;
      perpVenue: string;
      spotSize: number;
      perpSize: number;
      paperMode: boolean;
    }) => invokeFundingArb('execute_funding_arb', params),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['active-funding-positions'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success(data.message || '✅ Funding arbitrage executed');
    },
    onError: (error: Error) => {
      toast.error(`Funding arb failed: ${error.message}`);
    },
  });
}

// ============================================================================
// POSITIONS & HISTORY
// ============================================================================

/**
 * Active arbitrage positions
 */
export function useArbitragePositions(enabled = true) {
  return useQuery({
    queryKey: ['arbitrage-positions'],
    queryFn: async () => {
      const response = await arbitrageApi.getOpportunities();
      if (response.error) throw new Error(response.error);
      return response.data || [];
    },
    enabled,
    refetchInterval: 10000,
  });
}

/**
 * Active funding positions
 */
export function useActiveFundingPositions(enabled = true) {
  return useQuery({
    queryKey: ['active-funding-positions'],
    queryFn: () => invokeFundingArb<{ positions: any[] }>('get_active_positions'),
    enabled,
    refetchInterval: 30000,
  });
}

// ============================================================================
// CONVENIENCE HOOK - ALL-IN-ONE
// ============================================================================

export interface UseArbitrageOptions {
  type?: ArbitrageType | 'all';
  symbols?: string[];
  enabled?: boolean;
}

/**
 * All-in-one arbitrage hook
 */
export function useArbitrage({ type = 'all', symbols = ['BTC/USD', 'ETH/USD'], enabled = true }: UseArbitrageOptions = {}) {
  const status = useArbitrageStatus();
  const control = useArbitrageControl();
  const allOpportunities = useAllArbitrageOpportunities(enabled);
  const positions = useArbitragePositions(enabled);
  const executeCrossExchange = useExecuteCrossExchangeArb();
  const executeFunding = useExecuteFundingArb();

  // Filter by type if specified
  const opportunities = type === 'all'
    ? allOpportunities.opportunities
    : allOpportunities.opportunities.filter(o => o.type === type);

  return {
    // Status
    status: status.data,
    isRunning: status.data?.isRunning ?? false,

    // Opportunities
    opportunities,
    crossExchangeOpportunities: allOpportunities.crossExchange,
    fundingOpportunities: allOpportunities.funding,

    // Positions
    positions: positions.data || [],

    // Loading
    isLoading: status.isLoading || allOpportunities.isLoading,

    // Control
    start: control.start,
    stop: control.stop,
    isStarting: control.isStarting,
    isStopping: control.isStopping,

    // Execute
    executeCrossExchange: executeCrossExchange.mutateAsync,
    executeFunding: executeFunding.mutateAsync,
    isExecuting: executeCrossExchange.isPending || executeFunding.isPending,

    // Refetch
    refetch: allOpportunities.refetch,
  };
}

