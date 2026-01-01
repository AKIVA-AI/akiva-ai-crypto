import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LifecycleState = 'active' | 'quarantined' | 'disabled' | 'paper_only' | 'cooldown';

export interface StrategyLifecycleEvent {
  id: string;
  strategy_id: string;
  from_state: string;
  to_state: string;
  reason: string;
  triggered_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface StrategyWithLifecycle {
  id: string;
  name: string;
  status: string;
  lifecycle_state: LifecycleState;
  lifecycle_reason: string | null;
  lifecycle_changed_at: string | null;
  consecutive_losses: number;
  execution_quality: number;
  quarantine_count_30d: number;
  quarantine_expires_at: string | null;
  pnl: number;
  max_drawdown: number;
}

// Quarantine thresholds - configurable
export const QUARANTINE_THRESHOLDS = {
  consecutive_losses_max: 5,
  drawdown_quarantine_pct: 10,
  execution_quality_min: 0.85,
  max_quarantine_count_30d: 3,
  quarantine_duration_hours: 4,
};

export function useStrategyLifecycle(strategyId?: string) {
  return useQuery({
    queryKey: ['strategy-lifecycle', strategyId],
    queryFn: async () => {
      if (!strategyId) return null;
      
      const { data, error } = await supabase
        .from('strategies')
        .select('id, name, status, lifecycle_state, lifecycle_reason, lifecycle_changed_at, consecutive_losses, execution_quality, quarantine_count_30d, quarantine_expires_at, pnl, max_drawdown')
        .eq('id', strategyId)
        .single();
      
      if (error) throw error;
      return data as StrategyWithLifecycle;
    },
    enabled: !!strategyId,
  });
}

export function useStrategiesWithLifecycle() {
  return useQuery({
    queryKey: ['strategies-lifecycle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('id, name, status, lifecycle_state, lifecycle_reason, lifecycle_changed_at, consecutive_losses, execution_quality, quarantine_count_30d, quarantine_expires_at, pnl, max_drawdown, book_id, timeframe, risk_tier, asset_class, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useLifecycleEvents(strategyId: string) {
  return useQuery({
    queryKey: ['lifecycle-events', strategyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategy_lifecycle_events')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as StrategyLifecycleEvent[];
    },
    enabled: !!strategyId,
  });
}

export function useTransitionStrategy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      strategyId,
      toState,
      reason,
      triggeredBy = 'manual',
    }: {
      strategyId: string;
      toState: LifecycleState;
      reason: string;
      triggeredBy?: string;
    }) => {
      // Get current state
      const { data: current, error: fetchError } = await supabase
        .from('strategies')
        .select('lifecycle_state, name')
        .eq('id', strategyId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const fromState = current.lifecycle_state || 'active';
      
      // Update strategy
      const updateData: Record<string, unknown> = {
        lifecycle_state: toState,
        lifecycle_reason: reason,
        lifecycle_changed_at: new Date().toISOString(),
      };
      
      // If quarantining, set expiration
      if (toState === 'quarantined') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + QUARANTINE_THRESHOLDS.quarantine_duration_hours);
        updateData.quarantine_expires_at = expiresAt.toISOString();
        
        // Increment quarantine count
        const { data: stratData } = await supabase
          .from('strategies')
          .select('quarantine_count_30d')
          .eq('id', strategyId)
          .single();
        
        updateData.quarantine_count_30d = (stratData?.quarantine_count_30d || 0) + 1;
        
        // Also set strategy status to 'paper' when quarantined
        updateData.status = 'paper';
      }
      
      // If transitioning to active, clear quarantine fields
      if (toState === 'active') {
        updateData.quarantine_expires_at = null;
        updateData.lifecycle_reason = null;
      }
      
      // If disabling, set status to 'off'
      if (toState === 'disabled') {
        updateData.status = 'off';
      }
      
      const { error: updateError } = await supabase
        .from('strategies')
        .update(updateData)
        .eq('id', strategyId);
      
      if (updateError) throw updateError;
      
      // Log the transition event
      const { error: eventError } = await supabase
        .from('strategy_lifecycle_events')
        .insert({
          strategy_id: strategyId,
          from_state: fromState,
          to_state: toState,
          reason,
          triggered_by: triggeredBy,
          metadata: { thresholds: QUARANTINE_THRESHOLDS },
        });
      
      if (eventError) throw eventError;
      
      // Create audit event
      await supabase.from('audit_events').insert({
        action: 'strategy_lifecycle_transition',
        resource_type: 'strategy',
        resource_id: strategyId,
        severity: toState === 'quarantined' || toState === 'disabled' ? 'warning' : 'info',
        before_state: { lifecycle_state: fromState },
        after_state: { lifecycle_state: toState, reason },
      });
      
      // Create alert for quarantine
      if (toState === 'quarantined' || toState === 'disabled') {
        await supabase.from('alerts').insert({
          title: `Strategy ${toState === 'quarantined' ? 'Quarantined' : 'Disabled'}`,
          message: `Strategy "${current.name}" has been ${toState}. Reason: ${reason}`,
          severity: 'warning',
          source: 'strategy_lifecycle',
          metadata: { strategy_id: strategyId, from_state: fromState, to_state: toState },
        });
      }
      
      return { strategyId, fromState, toState, reason };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['strategies-lifecycle'] });
      queryClient.invalidateQueries({ queryKey: ['strategy-lifecycle', data.strategyId] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle-events', data.strategyId] });
      toast.success(`Strategy transitioned to ${data.toState}`);
    },
    onError: (error) => {
      toast.error(`Failed to transition strategy: ${error.message}`);
    },
  });
}

// Check if strategy should be auto-quarantined
export function shouldQuarantine(strategy: StrategyWithLifecycle): { 
  should: boolean; 
  reason: string | null 
} {
  if (strategy.lifecycle_state === 'quarantined' || strategy.lifecycle_state === 'disabled') {
    return { should: false, reason: null };
  }
  
  if (strategy.consecutive_losses >= QUARANTINE_THRESHOLDS.consecutive_losses_max) {
    return { 
      should: true, 
      reason: `consecutive_losses:${strategy.consecutive_losses}` 
    };
  }
  
  if (strategy.max_drawdown >= QUARANTINE_THRESHOLDS.drawdown_quarantine_pct) {
    return { 
      should: true, 
      reason: `drawdown:${strategy.max_drawdown.toFixed(1)}%` 
    };
  }
  
  if (strategy.execution_quality < QUARANTINE_THRESHOLDS.execution_quality_min) {
    return { 
      should: true, 
      reason: `execution_quality:${(strategy.execution_quality * 100).toFixed(0)}%` 
    };
  }
  
  if (strategy.quarantine_count_30d >= QUARANTINE_THRESHOLDS.max_quarantine_count_30d) {
    return { 
      should: true, 
      reason: `repeated_quarantines:${strategy.quarantine_count_30d}` 
    };
  }
  
  return { should: false, reason: null };
}

// Check if quarantine has expired
export function isQuarantineExpired(strategy: StrategyWithLifecycle): boolean {
  if (strategy.lifecycle_state !== 'quarantined') return false;
  if (!strategy.quarantine_expires_at) return false;
  
  return new Date() > new Date(strategy.quarantine_expires_at);
}
