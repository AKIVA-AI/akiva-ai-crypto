import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DerivativesMetric {
  id: string;
  instrument: string;
  venue: string;
  funding_rate: number | null;
  next_funding_time: string | null;
  open_interest: number | null;
  oi_change_24h: number | null;
  long_short_ratio: number | null;
  liquidations_24h_long: number | null;
  liquidations_24h_short: number | null;
  top_trader_long_ratio: number | null;
  top_trader_short_ratio: number | null;
  recorded_at: string;
}

export function useDerivativesMetrics(instruments?: string[]) {
  return useQuery({
    queryKey: ['derivatives-metrics', instruments],
    queryFn: async () => {
      let query = supabase
        .from('derivatives_metrics')
        .select('*')
        .order('recorded_at', { ascending: false });
      
      if (instruments?.length) {
        query = query.in('instrument', instruments);
      }
      
      const { data, error } = await query.limit(20);
      
      if (error) throw error;
      
      // Deduplicate by instrument (get latest for each)
      const latestByInstrument = new Map<string, DerivativesMetric>();
      for (const metric of data || []) {
        if (!latestByInstrument.has(metric.instrument)) {
          latestByInstrument.set(metric.instrument, metric);
        }
      }
      
      return Array.from(latestByInstrument.values());
    },
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useFetchDerivatives() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instruments: string[]) => {
      const { data, error } = await supabase.functions.invoke('derivatives-data', {
        body: { action: 'fetch_derivatives', instruments },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['derivatives-metrics'] });
      toast.success(`Fetched derivatives data from ${data.source}`);
    },
    onError: (error) => {
      toast.error(`Failed to fetch derivatives data: ${error.message}`);
    },
  });
}

export function useFundingHistory(instrument: string) {
  return useQuery({
    queryKey: ['funding-history', instrument],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('derivatives_metrics')
        .select('instrument, funding_rate, recorded_at')
        .eq('instrument', instrument)
        .order('recorded_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    enabled: !!instrument,
  });
}
