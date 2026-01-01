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

/**
 * Run health checks via Edge Function (server-side only writes).
 * This ensures system_health is only writable by service role.
 */
export function useRunHealthChecks() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('health-check');
      
      if (error) throw error;
      return data as {
        success: boolean;
        overall: HealthStatus;
        isReady: boolean;
        components: SystemHealthComponent[];
        checkedAt: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
    },
  });
}

// Response shape from health-check edge function
export interface HealthCheckResponse {
  success: boolean;
  overall: HealthStatus;
  isReady: boolean;
  components: SystemHealthComponent[];
  checkedAt: string;
  error?: string;
}

/**
 * Standalone function to run health checks via Edge Function.
 * Throws on error or invalid response shape.
 * @deprecated Prefer useRunHealthChecks() hook for React components
 */
export async function runHealthChecks(): Promise<HealthCheckResponse> {
  const { data, error } = await supabase.functions.invoke('health-check');
  
  if (error) {
    console.error('[runHealthChecks] Edge function error:', error);
    throw new Error(`Health check failed: ${error.message}`);
  }
  
  // Validate response shape
  if (!data || typeof data.success !== 'boolean' || !Array.isArray(data.components)) {
    console.error('[runHealthChecks] Invalid response shape:', data);
    throw new Error('Health check returned invalid response');
  }
  
  if (!data.success) {
    throw new Error(data.error || 'Health check failed');
  }
  
  return data as HealthCheckResponse;
}
