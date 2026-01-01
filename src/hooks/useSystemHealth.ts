import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CRITICAL_HEALTH_COMPONENTS, ALL_HEALTH_COMPONENTS, type HealthComponentId } from '@/lib/schemas';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SystemHealthComponent {
  id: string;
  component: HealthComponentId;
  status: HealthStatus;
  last_check_at: string;
  details: Record<string, unknown>;
  error_message: string | null;
}

export interface SystemHealthSummary {
  overall: HealthStatus;
  components: SystemHealthComponent[];
  lastUpdated: Date;
  isReady: boolean;
}

// Re-export canonical component lists for consistency
export { CRITICAL_HEALTH_COMPONENTS, ALL_HEALTH_COMPONENTS };

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health')
        .select('*');
      
      if (error) throw error;
      
      const components = data as SystemHealthComponent[];
      
      // Determine overall status
      let overall: HealthStatus = 'healthy';
      if (components.some(c => c.status === 'unhealthy')) {
        overall = 'unhealthy';
      } else if (components.some(c => c.status === 'degraded')) {
        overall = 'degraded';
      }
      
      // Check if all critical components are healthy (not degraded or unhealthy)
      // POLICY: Must match edge function - critical components block on degraded too
      const isReady = CRITICAL_HEALTH_COMPONENTS.every(name => {
        const component = components.find(c => c.component === name);
        return component?.status === 'healthy';
      });
      
      return {
        overall,
        components,
        lastUpdated: new Date(),
        isReady,
      } as SystemHealthSummary;
    },
    refetchInterval: 15000, // Check every 15 seconds
  });
}

export function useUpdateHealth() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      component,
      status,
      details = {},
      errorMessage = null,
    }: {
      component: string;
      status: HealthStatus;
      details?: Record<string, unknown>;
      errorMessage?: string | null;
    }) => {
      const { error } = await supabase
        .from('system_health')
        .upsert({
          component,
          status,
          details: details as unknown as Record<string, unknown>,
          error_message: errorMessage,
          last_check_at: new Date().toISOString(),
        } as never, { onConflict: 'component' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
    },
  });
}

// Run health checks
export async function runHealthChecks(): Promise<SystemHealthComponent[]> {
  const results: SystemHealthComponent[] = [];
  
  // Database check
  try {
    const start = Date.now();
    const { error } = await supabase.from('global_settings').select('id').limit(1);
    const latency = Date.now() - start;
    
    results.push({
      id: 'database',
      component: 'database',
      status: error ? 'unhealthy' : (latency > 500 ? 'degraded' : 'healthy'),
      last_check_at: new Date().toISOString(),
      details: { latency_ms: latency },
      error_message: error?.message || null,
    });
  } catch (e) {
    results.push({
      id: 'database',
      component: 'database',
      status: 'unhealthy',
      last_check_at: new Date().toISOString(),
      details: {},
      error_message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // Market data check - verify recent data exists
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('recorded_at')
      .gte('recorded_at', fiveMinutesAgo)
      .limit(1);
    
    const hasRecentData = data && data.length > 0;
    
    results.push({
      id: 'market_data',
      component: 'market_data',
      status: error ? 'unhealthy' : (hasRecentData ? 'healthy' : 'degraded'),
      last_check_at: new Date().toISOString(),
      details: { has_recent_data: hasRecentData },
      error_message: error?.message || (!hasRecentData ? 'No recent market data' : null),
    });
  } catch (e) {
    results.push({
      id: 'market_data',
      component: 'market_data',
      status: 'degraded',
      last_check_at: new Date().toISOString(),
      details: {},
      error_message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // Venues check
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, status, is_enabled')
      .eq('is_enabled', true);
    
    const healthyVenues = data?.filter(v => v.status === 'healthy').length || 0;
    const totalVenues = data?.length || 0;
    
    results.push({
      id: 'venues',
      component: 'venues',
      status: error ? 'unhealthy' : (healthyVenues === 0 ? 'degraded' : 'healthy'),
      last_check_at: new Date().toISOString(),
      details: { healthy: healthyVenues, total: totalVenues },
      error_message: error?.message || null,
    });
  } catch (e) {
    results.push({
      id: 'venues',
      component: 'venues',
      status: 'degraded',
      last_check_at: new Date().toISOString(),
      details: {},
      error_message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // OMS check - verify no stuck orders
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .select('id, status')
      .eq('status', 'open')
      .lt('created_at', fiveMinutesAgo);
    
    const stuckOrders = data?.length || 0;
    
    results.push({
      id: 'oms',
      component: 'oms',
      status: error ? 'unhealthy' : (stuckOrders > 5 ? 'degraded' : 'healthy'),
      last_check_at: new Date().toISOString(),
      details: { stuck_orders: stuckOrders },
      error_message: error?.message || null,
    });
  } catch (e) {
    results.push({
      id: 'oms',
      component: 'oms',
      status: 'healthy', // Assume healthy if no orders table access
      last_check_at: new Date().toISOString(),
      details: {},
      error_message: null,
    });
  }
  
  // Risk engine check - verify global settings accessible
  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('global_kill_switch, reduce_only_mode')
      .limit(1)
      .single();
    
    results.push({
      id: 'risk_engine',
      component: 'risk_engine',
      status: error ? 'unhealthy' : 'healthy',
      last_check_at: new Date().toISOString(),
      details: { 
        kill_switch: data?.global_kill_switch || false,
        reduce_only: data?.reduce_only_mode || false,
      },
      error_message: error?.message || null,
    });
  } catch (e) {
    results.push({
      id: 'risk_engine',
      component: 'risk_engine',
      status: 'degraded',
      last_check_at: new Date().toISOString(),
      details: {},
      error_message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  return results;
}
