/**
 * useExchangeKeys - Hook for managing user exchange API keys
 *
 * NOTE: The user_exchange_keys table does not exist yet in the database.
 * This hook provides the interface but returns mock/empty data until
 * the table is created via migration.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExchangeKey {
  id: string;
  user_id: string;
  exchange: string;
  label: string;
  api_key_encrypted: string;
  permissions: string[];
  is_active: boolean;
  is_validated: boolean;
  last_validated_at: string | null;
  validation_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddExchangeKeyParams {
  exchange: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  permissions: string[];
}

/**
 * Mask an encrypted key for display (shows last 4 chars only)
 */
const maskKey = (encrypted: string): string => {
  return `••••••••${encrypted.slice(-4)}`;
};

export function useExchangeKeys() {
  const queryClient = useQueryClient();

  // Fetch user's exchange keys
  // Note: user_exchange_keys table doesn't exist yet
  const { data: keys, isLoading, error } = useQuery({
    queryKey: ['exchange-keys'],
    queryFn: async (): Promise<ExchangeKey[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // TODO: Create user_exchange_keys table in database
      // For now, return empty array as the table doesn't exist
      console.log('[useExchangeKeys] user_exchange_keys table not yet implemented');
      return [];
    },
  });

  // Add new exchange key - disabled until table exists
  const addKey = useMutation({
    mutationFn: async (params: AddExchangeKeyParams): Promise<ExchangeKey | null> => {
      console.log('[useExchangeKeys] addKey called but table not implemented', params);
      throw new Error('Exchange keys table not yet implemented. Please add user_exchange_keys table to database.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange API key added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add key: ${error.message}`);
    },
  });

  // Update exchange key - disabled until table exists
  const updateKey = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExchangeKey> & { id: string }): Promise<void> => {
      console.log('[useExchangeKeys] updateKey called but table not implemented', { id, updates });
      throw new Error('Exchange keys table not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange key updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Delete exchange key - disabled until table exists
  const deleteKey = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      console.log('[useExchangeKeys] deleteKey called but table not implemented', id);
      throw new Error('Exchange keys table not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange key removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

  // Validate exchange connection via Edge Function
  const validateKey = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('exchange-validate', {
        body: { keyId: id },
      });

      if (error) throw error;
      return data as { valid: boolean; error?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      if (data.valid) {
        toast.success('Connection verified successfully');
      } else {
        toast.error(`Validation failed: ${data.error}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Validation error: ${error.message}`);
    },
  });

  return {
    keys: keys ?? [],
    isLoading,
    error,
    addKey,
    updateKey,
    deleteKey,
    validateKey,
    maskKey,
  };
}
