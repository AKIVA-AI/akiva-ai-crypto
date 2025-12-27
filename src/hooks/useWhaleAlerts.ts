import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import type { Tables } from '@/integrations/supabase/types';

type WhaleWallet = Tables<'whale_wallets'>;
type WhaleTransaction = Tables<'whale_transactions'>;

export function useWhaleWallets() {
  const query = useQuery({
    queryKey: ['whale-wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whale_wallets')
        .select('*')
        .eq('is_tracked', true)
        .order('last_activity_at', { ascending: false });
      
      if (error) throw error;
      return data as WhaleWallet[];
    },
  });

  return query;
}

export function useWhaleTransactions(walletAddress?: string) {
  const query = useQuery({
    queryKey: ['whale-transactions', walletAddress],
    queryFn: async () => {
      let q = supabase
        .from('whale_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (walletAddress) {
        q = q.or(`from_address.eq.${walletAddress},to_address.eq.${walletAddress}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data as WhaleTransaction[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('whale-transactions-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whale_transactions' }, () => {
        query.refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useTrackWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, label, network, category }: { 
      address: string; 
      label?: string; 
      network?: string; 
      category?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('whale-alerts', {
        body: { 
          action: 'track_wallet',
          wallet_address: address,
          label,
          network,
          category,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whale-wallets'] });
    },
  });
}

export function useSimulateWhaleActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instrument: string = 'BTC-USDT') => {
      const { data, error } = await supabase.functions.invoke('whale-alerts', {
        body: { 
          action: 'simulate_whale_activity',
          instrument,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whale-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['whale-wallets'] });
    },
  });
}
