/**
 * useExchangeKeys - Hook for managing user exchange API keys
 *
 * Provides secure CRUD operations for exchange API credentials.
 * Uses edge functions for encryption/decryption operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExchangeKey {
  id: string;
  user_id: string;
  exchange: string;
  label: string;
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

  // Fetch user's exchange keys
  const { data: keys, isLoading, error } = useQuery({
    queryKey: ['exchange-keys'],
    queryFn: async (): Promise<ExchangeKey[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return [];
      }

      // Use edge function to fetch keys (avoids TypeScript issues with unmapped table)
      const { data, error } = await supabase.functions.invoke('exchange-keys', {
        body: { action: 'list' },
      });

      if (error) {
        console.warn('Exchange keys fetch failed:', error.message);
        return [];
      }

      if (!data?.success) {
        console.warn('Exchange keys fetch returned error:', data?.error);
        return [];
      }

      return (data.keys || []) as ExchangeKey[];
    },
  });

  // Add new exchange key via edge function (handles encryption)
  const addKey = useMutation({
    mutationFn: async (params: AddExchangeKeyParams): Promise<ExchangeKey> => {
      const { data, error } = await supabase.functions.invoke('exchange-keys', {
        body: {
          action: 'add',
          exchange: params.exchange,
          label: params.label,
          apiKey: params.apiKey,
          apiSecret: params.apiSecret,
          passphrase: params.passphrase,
          permissions: params.permissions,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to add exchange key');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to add exchange key');
      }

      return data.key;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange API key added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add key: ${error.message}`);
    },
  });

  // Update exchange key via edge function
  const updateKey = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExchangeKey> & { id: string }): Promise<ExchangeKey> => {
      const { data, error } = await supabase.functions.invoke('exchange-keys', {
        body: {
          action: 'update',
          id,
          ...updates,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to update exchange key');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to update exchange key');
      }

      return data.key;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-keys'] });
      toast.success('Exchange key updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Delete exchange key via edge function
  const deleteKey = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { data, error } = await supabase.functions.invoke('exchange-keys', {
        body: {
          action: 'delete',
          id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to delete exchange key');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete exchange key');
      }
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
    mutationFn: async (id: string): Promise<{ valid: boolean; error?: string }> => {
      const { data, error } = await supabase.functions.invoke('exchange-validate', {
        body: { keyId: id },
      });

      if (error) {
        throw new Error(error.message || 'Validation request failed');
      }

      return data;
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
