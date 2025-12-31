import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FundingOpportunity {
  symbol: string;
  spotVenue: string;
  perpVenue: string;
  spotPrice: number;
  perpPrice: number;
  fundingRate: number;
  fundingRateAnnualized: number;
  nextFundingTime: string;
  direction: 'long_spot_short_perp' | 'short_spot_long_perp';
  estimatedApy: number;
  riskLevel: 'low' | 'medium' | 'high';
  netSpread: number;
  isActionable: boolean;
}

export interface FundingPosition {
  id: string;
  symbol: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  spread_percent: number;
  gross_profit: number;
  net_profit: number;
  status: string;
  created_at: string;
  metadata: Record<string, any>;
}

export function useFundingOpportunities() {
  return useQuery({
    queryKey: ['funding-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
        body: { action: 'scan_funding_opportunities' }
      });

      if (error) throw error;
      return data as {
        opportunities: FundingOpportunity[];
        actionable: number;
        total: number;
      };
    },
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

export function useFundingHistory(symbol: string) {
  return useQuery({
    queryKey: ['funding-history', symbol],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
        body: { action: 'get_funding_history', symbol }
      });

      if (error) throw error;
      return data;
    },
    enabled: !!symbol,
  });
}

export function useActiveFundingPositions() {
  return useQuery({
    queryKey: ['active-funding-positions'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
        body: { action: 'get_active_positions' }
      });

      if (error) throw error;
      return data.positions as FundingPosition[];
    },
    refetchInterval: 30 * 1000,
  });
}

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
    }) => {
      const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
        body: { action: 'execute_funding_arb', ...params }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['active-funding-positions'] });
      toast.success(data.message || 'Funding arbitrage executed');
    },
    onError: (error) => {
      toast.error(`Execution failed: ${error.message}`);
    }
  });
}

export function useCloseFundingPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { executionId: string; paperMode: boolean }) => {
      const { data, error } = await supabase.functions.invoke('funding-arbitrage', {
        body: { action: 'close_funding_position', ...params }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-funding-positions'] });
      toast.success('Position closed');
    },
    onError: (error) => {
      toast.error(`Failed to close: ${error.message}`);
    }
  });
}
