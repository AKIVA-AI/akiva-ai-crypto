import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import type { Tables } from '@/integrations/supabase/types';

type MarketNews = Tables<'market_news'>;
type SocialSentiment = Tables<'social_sentiment'>;
type DerivativesMetrics = Tables<'derivatives_metrics'>;
type IntelligenceSignal = Tables<'intelligence_signals'>;

interface IntelligenceSummary {
  [instrument: string]: {
    sentiment: SocialSentiment[];
    derivatives: DerivativesMetrics[];
    signals: IntelligenceSignal[];
    news: MarketNews[];
    overall_bias: string;
    confidence: number;
  };
}

export function useMarketNews(instruments: string[] = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  const query = useQuery({
    queryKey: ['market-news', instruments],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as MarketNews[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('market-news-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_news' }, () => {
        query.refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useSocialSentiment(instruments: string[] = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  const query = useQuery({
    queryKey: ['social-sentiment', instruments],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_sentiment')
        .select('*')
        .in('instrument', instruments)
        .order('recorded_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as SocialSentiment[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('social-sentiment-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_sentiment' }, () => {
        query.refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useDerivativesMetrics(instruments: string[] = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  const query = useQuery({
    queryKey: ['derivatives-metrics', instruments],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('derivatives_metrics')
        .select('*')
        .in('instrument', instruments)
        .order('recorded_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as DerivativesMetrics[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('derivatives-metrics-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'derivatives_metrics' }, () => {
        query.refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useIntelligenceSignals(instruments: string[] = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  const query = useQuery({
    queryKey: ['intelligence-signals', instruments],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intelligence_signals')
        .select('*')
        .in('instrument', instruments)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as IntelligenceSignal[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('intelligence-signals-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'intelligence_signals' }, () => {
        query.refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
}

export function useRefreshIntelligence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: 'fetch_news' | 'fetch_sentiment' | 'fetch_derivatives' | 'analyze_signals') => {
      const { data, error } = await supabase.functions.invoke('market-intelligence', {
        body: { 
          action,
          instruments: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'ARB-USDT', 'OP-USDT'],
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-news'] });
      queryClient.invalidateQueries({ queryKey: ['social-sentiment'] });
      queryClient.invalidateQueries({ queryKey: ['derivatives-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['intelligence-signals'] });
    },
  });
}

export function useIntelligenceSummary(instruments: string[] = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  return useQuery({
    queryKey: ['intelligence-summary', instruments],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('market-intelligence', {
        body: { 
          action: 'get_intelligence_summary',
          instruments,
        },
      });
      
      if (error) throw error;
      return data.summary as IntelligenceSummary;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
