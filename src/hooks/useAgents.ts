import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface Agent {
  id: string;
  name: string;
  type: 'market-data' | 'strategy' | 'execution' | 'risk' | 'treasury' | 'ops';
  status: 'online' | 'offline' | 'degraded';
  version: string;
  capabilities: string[];
  uptime: number;
  cpu_usage: number;
  memory_usage: number;
  last_heartbeat: string;
  error_message: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useAgents() {
  const query = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Agent[];
    },
  });

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('agents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
        },
        () => {
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useUpdateAgentStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'online' | 'offline' | 'degraded' }) => {
      const { error } = await supabase
        .from('agents')
        .update({ status, last_heartbeat: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent status updated');
    },
    onError: (error) => {
      toast.error(`Failed to update agent: ${error.message}`);
    },
  });
}

export function useAgentHeartbeat() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, cpu_usage, memory_usage }: { id: string; cpu_usage: number; memory_usage: number }) => {
      const { error } = await supabase
        .from('agents')
        .update({ 
          last_heartbeat: new Date().toISOString(),
          cpu_usage,
          memory_usage,
          status: 'online'
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}
