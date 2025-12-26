import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EngineStatus {
  running: boolean;
  paper_mode: boolean;
  active_strategies: number;
  last_cycle_at: string | null;
  cycle_count: number;
  paused_books: string[];
}

interface BackendHealth {
  status: 'healthy' | 'degraded' | 'offline';
  version: string;
  uptime_seconds: number;
  message?: string;
}

export function useEngineControl() {
  const queryClient = useQueryClient();
  const [backendUrl, setBackendUrl] = useState<string>('');

  // Get backend URL from global settings
  const { data: settings } = useQuery({
    queryKey: ['global-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (data?.api_base_url) {
        setBackendUrl(data.api_base_url);
      }
      return data;
    },
  });

  // Check backend health
  const { data: backendHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['backend-health', backendUrl],
    queryFn: async (): Promise<BackendHealth> => {
      if (!backendUrl) {
        return { status: 'offline', version: 'N/A', uptime_seconds: 0, message: 'Backend URL not configured' };
      }
      
      try {
        const response = await fetch(`${backendUrl}/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
          return { status: 'degraded', version: 'Unknown', uptime_seconds: 0, message: 'Health check failed' };
        }
        
        const data = await response.json();
        return {
          status: data.status || 'healthy',
          version: data.version || 'Unknown',
          uptime_seconds: data.uptime_seconds || 0,
          message: data.message,
        };
      } catch (error) {
        return { status: 'offline', version: 'N/A', uptime_seconds: 0, message: String(error) };
      }
    },
    enabled: !!backendUrl,
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Get engine status
  const { data: engineStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['engine-status', backendUrl],
    queryFn: async (): Promise<EngineStatus | null> => {
      if (!backendUrl) return null;
      
      try {
        const response = await fetch(`${backendUrl}/status`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) return null;
        return await response.json();
      } catch (error) {
        console.error('Failed to fetch engine status:', error);
        return null;
      }
    },
    enabled: !!backendUrl,
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Start engine mutation
  const startEngineMutation = useMutation({
    mutationFn: async () => {
      if (!backendUrl) throw new Error('Backend URL not configured');
      
      const response = await fetch(`${backendUrl}/engine/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start engine');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast.success('Engine started');
      refetchStatus();
    },
    onError: (error: Error) => {
      toast.error(`Failed to start engine: ${error.message}`);
    },
  });

  // Stop engine mutation
  const stopEngineMutation = useMutation({
    mutationFn: async () => {
      if (!backendUrl) throw new Error('Backend URL not configured');
      
      const response = await fetch(`${backendUrl}/engine/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to stop engine');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast.success('Engine stopped');
      refetchStatus();
    },
    onError: (error: Error) => {
      toast.error(`Failed to stop engine: ${error.message}`);
    },
  });

  // Run single cycle mutation
  const runCycleMutation = useMutation({
    mutationFn: async () => {
      if (!backendUrl) throw new Error('Backend URL not configured');
      
      const response = await fetch(`${backendUrl}/engine/run_once`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to run cycle');
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      toast.success(`Cycle completed: ${data.intents_generated || 0} intents generated`);
      queryClient.invalidateQueries({ queryKey: ['strategy-signals'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: Error) => {
      toast.error(`Cycle failed: ${error.message}`);
    },
  });

  // Pause book mutation
  const pauseBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      if (!backendUrl) throw new Error('Backend URL not configured');
      
      const response = await fetch(`${backendUrl}/engine/pause_book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to pause book');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast.success('Book paused');
      refetchStatus();
    },
    onError: (error: Error) => {
      toast.error(`Failed to pause book: ${error.message}`);
    },
  });

  // Resume book mutation
  const resumeBookMutation = useMutation({
    mutationFn: async (bookId: string) => {
      if (!backendUrl) throw new Error('Backend URL not configured');
      
      const response = await fetch(`${backendUrl}/engine/resume_book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to resume book');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast.success('Book resumed');
      refetchStatus();
    },
    onError: (error: Error) => {
      toast.error(`Failed to resume book: ${error.message}`);
    },
  });

  return {
    // Data
    backendUrl,
    backendHealth,
    engineStatus,
    settings,
    
    // Loading states
    isLoading: healthLoading || statusLoading,
    isConnected: backendHealth?.status === 'healthy',
    
    // Actions
    startEngine: startEngineMutation.mutate,
    stopEngine: stopEngineMutation.mutate,
    runCycle: runCycleMutation.mutate,
    pauseBook: pauseBookMutation.mutate,
    resumeBook: resumeBookMutation.mutate,
    refetchHealth,
    refetchStatus,
    
    // Mutation states
    isStarting: startEngineMutation.isPending,
    isStopping: stopEngineMutation.isPending,
    isRunningCycle: runCycleMutation.isPending,
  };
}

export function useStrategySignals(strategyId?: string, limit: number = 50) {
  return useQuery({
    queryKey: ['strategy-signals', strategyId, limit],
    queryFn: async () => {
      let query = supabase
        .from('strategy_signals')
        .select('*, strategies(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (strategyId) {
        query = query.eq('strategy_id', strategyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useTradeIntents(bookId?: string, limit: number = 50) {
  return useQuery({
    queryKey: ['trade-intents', bookId, limit],
    queryFn: async () => {
      let query = supabase
        .from('trade_intents')
        .select('*, strategies(name), books(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (bookId) {
        query = query.eq('book_id', bookId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
