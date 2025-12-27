import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReallocateCapitalParams {
  bookId: string;
  newCapital: number;
}

interface FreezeBookParams {
  bookId: string;
  frozen: boolean;
  reason?: string;
}

interface ToggleStrategyParams {
  strategyId: string;
  targetStatus?: 'off' | 'paper' | 'live';
}

interface KillSwitchParams {
  bookId?: string;
  activate: boolean;
  reason?: string;
}

interface ApproveMemeParams {
  projectId: string;
  approved: boolean;
  notes?: string;
}

// Helper to call Edge Functions with proper auth
async function invokeEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(error.message || `Failed to call ${functionName}`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

// Reallocate Capital Hook
export function useReallocateCapital() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, newCapital }: ReallocateCapitalParams) => {
      return invokeEdgeFunction('reallocate-capital', {
        book_id: bookId,
        new_capital: newCapital,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      toast.success(`Capital reallocated to $${variables.newCapital.toLocaleString()}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to reallocate capital: ${error.message}`);
    },
  });
}

// Freeze Book Hook
export function useFreezeBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, frozen, reason }: FreezeBookParams) => {
      return invokeEdgeFunction('freeze-book', {
        book_id: bookId,
        frozen,
        reason,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      toast.success(variables.frozen ? 'Book frozen' : 'Book unfrozen');
    },
    onError: (error: Error) => {
      toast.error(`Failed to ${error.message.includes('frozen') ? 'freeze' : 'update'} book: ${error.message}`);
    },
  });
}

// Toggle Strategy Hook
export function useToggleStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ strategyId, targetStatus }: ToggleStrategyParams) => {
      return invokeEdgeFunction('toggle-strategy', {
        strategy_id: strategyId,
        target_status: targetStatus,
      });
    },
    onSuccess: (data: { strategy?: { status: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      const status = data?.strategy?.status || 'updated';
      toast.success(`Strategy status: ${status.toUpperCase()}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle strategy: ${error.message}`);
    },
  });
}

// Kill Switch Hook
export function useKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, activate, reason }: KillSwitchParams) => {
      return invokeEdgeFunction('kill-switch', {
        book_id: bookId,
        activate,
        reason,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      
      if (variables.activate) {
        toast.error(
          variables.bookId 
            ? '🚨 Book Kill Switch ACTIVATED' 
            : '🚨🚨 GLOBAL KILL SWITCH ACTIVATED 🚨🚨',
          { duration: 10000 }
        );
      } else {
        toast.success(
          variables.bookId 
            ? 'Book kill switch deactivated' 
            : 'Global kill switch deactivated'
        );
      }
    },
    onError: (error: Error) => {
      toast.error(`Kill switch failed: ${error.message}`);
    },
  });
}

// Approve Meme Launch Hook
export function useApproveMemeProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, approved, notes }: ApproveMemeParams) => {
      return invokeEdgeFunction('approve-meme-launch', {
        project_id: projectId,
        approved,
        notes,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meme-projects'] });
      queryClient.invalidateQueries({ queryKey: ['meme-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-events'] });
      
      toast.success(
        variables.approved 
          ? '✅ Meme project approved for launch!' 
          : '❌ Meme project rejected'
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to process meme launch: ${error.message}`);
    },
  });
}
