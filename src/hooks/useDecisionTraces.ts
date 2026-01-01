import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DecisionTrace, DecisionOutcome, BlockReason } from '@/lib/decisionTrace';

export interface PersistedDecisionTrace {
  id: string;
  trace_id: string;
  timestamp: string;
  instrument: string;
  direction: 'LONG' | 'SHORT';
  target_exposure_usd: number;
  strategy_id: string | null;
  strategy_name: string;
  confidence: number;
  signal_strength: number;
  decision: DecisionOutcome;
  gates_checked: unknown[];
  block_reasons: string[];
  reason_codes: string[];
  regime: Record<string, unknown>;
  costs: Record<string, unknown>;
  explanation: string;
  created_at: string;
}

export interface DecisionTraceFilters {
  instrument?: string;
  strategyId?: string;
  decision?: DecisionOutcome;
  startDate?: Date;
  endDate?: Date;
  blockReason?: BlockReason;
  limit?: number;
}

export function useDecisionTraces(filters: DecisionTraceFilters = {}) {
  return useQuery({
    queryKey: ['decision-traces', filters],
    queryFn: async () => {
      let query = supabase
        .from('decision_traces')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(filters.limit || 100);
      
      if (filters.instrument) {
        query = query.eq('instrument', filters.instrument);
      }
      
      if (filters.strategyId) {
        query = query.eq('strategy_id', filters.strategyId);
      }
      
      if (filters.decision) {
        query = query.eq('decision', filters.decision);
      }
      
      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate.toISOString());
      }
      
      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate.toISOString());
      }
      
      if (filters.blockReason) {
        query = query.contains('block_reasons', [filters.blockReason]);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as PersistedDecisionTrace[];
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useDecisionTraceStats() {
  return useQuery({
    queryKey: ['decision-trace-stats'],
    queryFn: async () => {
      // Get counts by decision type
      const { data: decisionCounts, error: countError } = await supabase
        .from('decision_traces')
        .select('decision')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (countError) throw countError;
      
      const stats = {
        total: decisionCounts?.length || 0,
        executed: decisionCounts?.filter(d => d.decision === 'EXECUTED').length || 0,
        blocked: decisionCounts?.filter(d => d.decision === 'BLOCKED').length || 0,
        modified: decisionCounts?.filter(d => d.decision === 'MODIFIED').length || 0,
        blockRate: 0,
      };
      
      stats.blockRate = stats.total > 0 
        ? Math.round((stats.blocked / stats.total) * 100) 
        : 0;
      
      // Get top block reasons
      const { data: blockReasons, error: reasonError } = await supabase
        .from('decision_traces')
        .select('block_reasons')
        .eq('decision', 'BLOCKED')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (reasonError) throw reasonError;
      
      const reasonCounts: Record<string, number> = {};
      blockReasons?.forEach(trace => {
        (trace.block_reasons as string[])?.forEach(reason => {
          reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
      });
      
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      
      return { ...stats, topReasons };
    },
    refetchInterval: 30000,
  });
}

export function usePersistDecisionTrace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (trace: DecisionTrace) => {
      const { error } = await supabase
        .from('decision_traces')
        .insert({
          trace_id: trace.id,
          timestamp: trace.timestamp.toISOString(),
          instrument: trace.intent.instrument,
          direction: trace.intent.direction,
          target_exposure_usd: trace.intent.targetExposureUsd,
          strategy_id: trace.intent.strategyId || null,
          strategy_name: trace.intent.strategyName,
          confidence: trace.intent.confidence,
          signal_strength: trace.intent.signalStrength,
          decision: trace.decision,
          gates_checked: trace.gatesChecked as unknown as Record<string, unknown>,
          block_reasons: trace.blockReasons,
          reason_codes: trace.reasonCodes,
          regime: trace.regime as unknown as Record<string, unknown>,
          costs: trace.costs as unknown as Record<string, unknown>,
          explanation: trace.explanation,
        } as never);
      
      if (error) throw error;
      return trace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-traces'] });
      queryClient.invalidateQueries({ queryKey: ['decision-trace-stats'] });
    },
  });
}

// Recent "Why Didn't We Trade" query - only blocked trades
export function useRecentBlockedTraces(limit: number = 10) {
  return useQuery({
    queryKey: ['recent-blocked-traces', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decision_traces')
        .select('*')
        .eq('decision', 'BLOCKED')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as PersistedDecisionTrace[];
    },
    refetchInterval: 30000,
  });
}
