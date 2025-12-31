import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGlobalSettings() {
  return useQuery({
    queryKey: ['global-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
}

export function useAuditEvents(limit: number = 100) {
  return useQuery({
    queryKey: ['audit-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
  });
}

export function useCircuitBreakerEvents(limit: number = 50) {
  return useQuery({
    queryKey: ['circuit-breaker-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circuit_breaker_events')
        .select('*, books(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
  });
}

export function useRiskBreaches(bookId?: string, isResolved?: boolean) {
  return useQuery({
    queryKey: ['risk-breaches', bookId, isResolved],
    queryFn: async () => {
      let query = supabase
        .from('risk_breaches')
        .select('*, books(name)')
        .order('created_at', { ascending: false });
      
      if (bookId) {
        query = query.eq('book_id', bookId);
      }
      if (isResolved !== undefined) {
        query = query.eq('is_resolved', isResolved);
      }
      
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });
}

export function useMemeProjects() {
  return useQuery({
    queryKey: ['meme-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meme_projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useMemeTasks(projectId?: string) {
  return useQuery({
    queryKey: ['meme-tasks', projectId],
    queryFn: async () => {
      let query = supabase
        .from('meme_tasks')
        .select('*, meme_projects(name, ticker)')
        .order('created_at', { ascending: false });
      
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateMemeProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (project: { name: string; ticker: string; narrative_tags?: string[] }) => {
      const { data, error } = await supabase
        .from('meme_projects')
        .insert({
          name: project.name,
          ticker: project.ticker.toUpperCase(),
          narrative_tags: project.narrative_tags || [],
          stage: 'opportunity',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meme-projects'] });
      toast.success('Meme project created');
    },
    onError: (error) => {
      toast.error(`Failed to create project: ${error.message}`);
    },
  });
}

export function useUpdateMemeProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from('meme_projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meme-projects'] });
      toast.success('Project updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}
