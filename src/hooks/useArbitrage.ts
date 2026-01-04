import { toast } from 'sonner';
import { useArbitrageScan, useArbitrageStatus as useCrossExchangeStatus, useExecuteArbitrage } from '@/hooks/useCrossExchangeArbitrage';
import { useFundingOpportunities as useFundingOpportunitiesBase, useExecuteFundingArb as useExecuteFundingArbBase } from '@/hooks/useFundingArbitrage';

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

export function useArbitrageStatus() {
  return useCrossExchangeStatus();
}

export function useArbitrageControl() {
  return {
    start: () => toast.info('Arbitrage control is handled by the EngineRunner.'),
    stop: () => toast.info('Arbitrage control is handled by the EngineRunner.'),
    isStarting: false,
    isStopping: false,
  };
}

export function useCrossExchangeOpportunities(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  minSpreadPercent = 0.1,
  enabled = true
) {
  return useArbitrageScan(symbols, minSpreadPercent, enabled);
}

export function useFundingOpportunitiesUnified(enabled = true) {
  return useFundingOpportunitiesBase();
}

export function useAllArbitrageOpportunities(enabled = true) {
  const crossExchange = useCrossExchangeOpportunities(['BTC/USD', 'ETH/USD', 'SOL/USD'], 0.05, enabled);
  const funding = useFundingOpportunitiesUnified(enabled);

  const crossOpportunities = (crossExchange.data?.opportunities || []).map((opp) => ({
    id: opp.id,
    type: 'cross_exchange' as const,
    symbol: opp.symbol,
    buyVenue: opp.buyExchange,
    sellVenue: opp.sellExchange,
    buyPrice: opp.buyPrice,
    sellPrice: opp.sellPrice,
    spreadPercent: opp.spreadPercent,
    estimatedProfit: opp.estimatedProfit,
    estimatedProfitPercent: opp.spreadPercent,
    riskLevel: opp.spreadPercent > 0.5 ? 'low' : 'medium',
    isActionable: opp.spreadPercent > 0.05,
  }));

  const fundingOpportunities = (funding.data?.opportunities || []).map((opp) => ({
    id: `${opp.symbol}-${opp.spotVenue}-${opp.perpVenue}`,
    type: 'funding' as const,
    symbol: opp.symbol,
    buyVenue: opp.spotVenue,
    sellVenue: opp.perpVenue,
    buyPrice: opp.spotPrice,
    sellPrice: opp.perpPrice,
    spreadPercent: opp.netSpread,
    estimatedProfit: opp.estimatedApy,
    estimatedProfitPercent: opp.estimatedApy,
    riskLevel: opp.riskLevel,
    isActionable: opp.isActionable,
  }));

  return {
    opportunities: [...crossOpportunities, ...fundingOpportunities],
    crossExchange: crossOpportunities,
    funding: fundingOpportunities,
    isLoading: crossExchange.isLoading || funding.isLoading,
    error: crossExchange.error || funding.error,
    refetch: () => {
      crossExchange.refetch();
      funding.refetch();
    },
  };
}

export function useExecuteCrossExchangeArb() {
  return useExecuteArbitrage();
}

export function useExecuteFundingArbUnified() {
  return useExecuteFundingArbBase();
}

// Add the missing exports that the index file expects
export function useFundingOpportunities(enabled = true) {
  return useFundingOpportunitiesUnified(enabled);
}

export function useFundingHistory() {
  // Placeholder implementation - would need to be implemented
  return { data: [], isLoading: false, error: null };
}

export function useExecuteFundingArb() {
  return useExecuteFundingArbUnified();
}

export function useArbitragePositions() {
  // Placeholder implementation - would need to be implemented
  return { data: [], isLoading: false, error: null };
}

export function useActiveFundingPositions() {
  // Placeholder implementation - would need to be implemented
  return { data: [], isLoading: false, error: null };
}

export interface UseArbitrageOptions {
  type?: ArbitrageType | 'all';
  symbols?: string[];
  enabled?: boolean;
}

export function useArbitrage({ type = 'all', symbols = ['BTC/USD', 'ETH/USD'], enabled = true }: UseArbitrageOptions = {}) {
  const status = useArbitrageStatus();
  const control = useArbitrageControl();
  const allOpportunities = useAllArbitrageOpportunities(enabled);
  const crossExchange = useCrossExchangeOpportunities(symbols, 0.05, enabled);
  const executeCrossExchange = useExecuteCrossExchangeArb();
  const executeFunding = useExecuteFundingArbUnified();

  const opportunities = type === 'all'
    ? allOpportunities.opportunities
    : allOpportunities.opportunities.filter((o) => o.type === type);

  return {
    status: status.data,
    isRunning: status.data?.isRunning ?? false,
    opportunities,
    crossExchangeOpportunities: crossExchange.data?.opportunities || [],
    fundingOpportunities: allOpportunities.funding,
    positions: [],
    isLoading: status.isLoading || allOpportunities.isLoading,
    start: control.start,
    stop: control.stop,
    isStarting: control.isStarting,
    isStopping: control.isStopping,
    executeCrossExchange: executeCrossExchange.mutateAsync,
    executeFunding: executeFunding.mutateAsync,
    isExecuting: executeCrossExchange.isPending || executeFunding.isPending,
    refetch: allOpportunities.refetch,
  };
}
