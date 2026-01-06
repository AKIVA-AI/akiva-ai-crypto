import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export type Strategy = Tables<'strategies'>;
export type StrategyInsert = TablesInsert<'strategies'>;
export type StrategyUpdate = TablesUpdate<'strategies'>;

export function useStrategies() {
  return useQuery({
    queryKey: ['strategies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('*, books(name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useStrategy(id: string) {
  return useQuery({
    queryKey: ['strategies', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select('*, books(name)')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateStrategy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (strategy: StrategyInsert) => {
      let tenantId: string | undefined = strategy.tenant_id;
      if (!tenantId) {
        const { data: tenantRow, error: tenantError } = await supabase
          .from('user_tenants')
          .select('tenant_id')
          .eq('is_default', true)
          .limit(1)
          .maybeSingle();

        if (tenantError) throw tenantError;
        tenantId = tenantRow?.tenant_id ?? undefined;
      }

      if (!tenantId) {
        throw new Error('No default tenant found for this user.');
      }

      const { data, error } = await supabase
        .from('strategies')
        .insert({ ...strategy, tenant_id: tenantId })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      toast.success('Strategy created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create strategy: ${error.message}`);
    },
  });
}

export function useUpdateStrategy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: StrategyUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('strategies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      toast.success('Strategy updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update strategy: ${error.message}`);
    },
  });
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('strategies')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      toast.success('Strategy deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete strategy: ${error.message}`);
    },
  });
}

export function useActiveStrategiesCount() {
  return useQuery({
    queryKey: ['strategies', 'active-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('strategies')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'live');
      
      if (error) throw error;
      return count || 0;
    },
  });
}
