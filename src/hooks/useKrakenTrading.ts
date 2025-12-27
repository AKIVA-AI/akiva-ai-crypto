import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface KrakenStatus {
  configured: boolean;
  connected: boolean;
  accountInfo: {
    currencies: number;
    hasUSD: boolean;
  } | null;
  features: {
    spot: boolean;
    futures: boolean;
    perpetuals: boolean;
    margin: boolean;
    staking: boolean;
    options: boolean;
  };
  regions: {
    usCompliant: boolean;
    available: string[];
  };
}

interface KrakenTicker {
  pair: string;
  ask: number;
  bid: number;
  last: number;
  volume_24h: number;
  high_24h: number;
  low_24h: number;
  vwap_24h: number;
  trades_24h: number;
  timestamp: string;
}

interface KrakenOrderBookEntry {
  price: number;
  volume: number;
  timestamp: number;
}

interface KrakenOrderBook {
  pair: string;
  asks: KrakenOrderBookEntry[];
  bids: KrakenOrderBookEntry[];
}

interface PlaceOrderParams {
  book_id?: string;
  pair: string;
  type: 'buy' | 'sell';
  ordertype: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  volume: string;
  price?: string;
  leverage?: string;
  strategy_id?: string;
}

interface OrderResult {
  success: boolean;
  order_id: string;
  mode: 'live' | 'simulation';
  venue: string;
  filled_price: number;
  filled_size: number;
  fee: number;
  latency_ms: number;
  slippage_bps: number;
  message: string;
}

export function useKrakenStatus() {
  return useQuery({
    queryKey: ['kraken-status'],
    queryFn: async (): Promise<KrakenStatus> => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/status');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useKrakenBalances() {
  return useQuery({
    queryKey: ['kraken-balances'],
    queryFn: async (): Promise<{ balances: Record<string, string>; simulation?: boolean }> => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/balances');
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useKrakenTicker(pair: string = 'XXBTZUSD') {
  return useQuery({
    queryKey: ['kraken-ticker', pair],
    queryFn: async (): Promise<KrakenTicker> => {
      const { data, error } = await supabase.functions.invoke(`kraken-trading/ticker?pair=${pair}`);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}

export function useKrakenOrderBook(pair: string = 'XXBTZUSD', count: number = 25) {
  return useQuery({
    queryKey: ['kraken-orderbook', pair, count],
    queryFn: async (): Promise<KrakenOrderBook> => {
      const { data, error } = await supabase.functions.invoke(
        `kraken-trading/orderbook?pair=${pair}&count=${count}`
      );
      if (error) throw error;
      return data;
    },
    refetchInterval: 2000,
  });
}

export function useKrakenPairs() {
  return useQuery({
    queryKey: ['kraken-pairs'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/pairs');
      if (error) throw error;
      return data.pairs;
    },
    staleTime: 60000,
  });
}

export function useKrakenPlaceOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: PlaceOrderParams): Promise<OrderResult> => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/place-order', {
        body: params,
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kraken-balances'] });
      queryClient.invalidateQueries({ queryKey: ['trading-positions'] });
      queryClient.invalidateQueries({ queryKey: ['trading-orders'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      const icon = result.mode === 'live' ? '🟣' : '📋';
      toast.success(`${icon} ${result.message}`, {
        description: `${result.filled_size} @ $${result.filled_price.toFixed(2)} | Fee: $${result.fee.toFixed(2)}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Kraken Order Failed', {
        description: error.message,
      });
    },
  });
}

export function useKrakenCancelOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (txid: string) => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/cancel-order', {
        body: { txid },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kraken-orders'] });
      toast.success('Order cancelled');
    },
    onError: (error: Error) => {
      toast.error('Failed to cancel order', { description: error.message });
    },
  });
}

export function useKrakenOrders() {
  return useQuery({
    queryKey: ['kraken-orders'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/orders');
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
}

export function useKrakenStaking() {
  return useQuery({
    queryKey: ['kraken-staking'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('kraken-trading/staking');
      if (error) throw error;
      return data.assets;
    },
    staleTime: 60000,
  });
}
