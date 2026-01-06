/**
 * useExchangeKeys - Hook for managing user exchange API keys
 *
 * Note: The user_exchange_keys table does not exist in the current schema.
 * This hook returns mock data until the table is created.
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
  return `****${encrypted.slice(-4)}`;
};

export function useExchangeKeys() {
  const queryClient = useQueryClient();

  // Fetch user's exchange keys - returns empty array since table doesn't exist
  const { data: keys, isLoading, error } = useQuery({
    queryKey: ['exchange-keys'],
    queryFn: async (): Promise<ExchangeKey[]> => {
      // TODO: Implement when user_exchange_keys table is created
      return [];
    },
  });

  // Add new exchange key - not implemented yet
  const addKey = useMutation({
    mutationFn: async (params: AddExchangeKeyParams) => {
      throw new Error('user_exchange_keys table not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange API key added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add key: ${error.message}`);
    },
  });

  // Update exchange key - not implemented yet
  const updateKey = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExchangeKey> & { id: string }) => {
      throw new Error('user_exchange_keys table not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange key updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Delete exchange key - not implemented yet
  const deleteKey = useMutation({
    mutationFn: async (id: string) => {
      throw new Error('user_exchange_keys table not yet implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange key removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });

  // Validate exchange connection via Edge Function - not implemented yet
  const validateKey = useMutation({
    mutationFn: async (id: string) => {
      throw new Error('user_exchange_keys table not yet implemented');
    },
    onSuccess: (data: { valid: boolean; error?: string }) => {
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
