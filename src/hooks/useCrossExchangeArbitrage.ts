import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExchangeBalance {
  exchange: string;
  currency: string;
  available: number;
  total: number;
  timestamp: number;
}

export interface BalanceSummary {
  balances: ExchangeBalance[];
  summary: Record<string, { usdAvailable: number; assets: ExchangeBalance[] }>;
  totalUsdAvailable: number;
  timestamp: number;
  exchangesConnected: {
    coinbase: boolean;
    kraken: boolean;
    binance_us: boolean;
  };
}

export interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  volume: number;
  confidence: number;
  timestamp: number;
  costs?: {
    tradingFees: number;
    withdrawalFee: number;
    slippage: number;
    totalCost: number;
    netProfit: number;
  };
}

const normalizeVenueKey = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes('coinbase')) return 'coinbase';
  if (normalized.includes('kraken')) return 'kraken';
  if (normalized.includes('binance') && normalized.includes('us')) return 'binance_us';
  if (normalized.includes('binance')) return 'binance';
  if (normalized.includes('bybit')) return 'bybit';
  if (normalized.includes('okx')) return 'okx';
  if (normalized.includes('hyperliquid')) return 'hyperliquid';
  return normalized.replace(/\s+/g, '_');
};

const fetchVenues = async () => {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name');

  if (error) throw error;
  return data;
};

const fetchInstruments = async (symbols: string[]) => {
  const { data, error } = await supabase
    .from('instruments')
    .select('id, common_symbol, venue_id, contract_type')
    .in('common_symbol', symbols)
    .eq('contract_type', 'spot');

  if (error) throw error;
  return data;
};

export function useArbitrageScan(
  symbols: string[] = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'],
  minSpreadPercent: number = 0.1,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['arb-spreads-scan', symbols, minSpreadPercent],
    queryFn: async () => {
      const [venues, instruments] = await Promise.all([
        fetchVenues(),
        fetchInstruments(symbols),
      ]);

      const venueNameById = new Map<string, string>();
      const venueKeyById = new Map<string, string>();
      venues.forEach((venue) => {
        venueNameById.set(venue.id, venue.name);
        venueKeyById.set(venue.id, normalizeVenueKey(venue.name));
      });

      const instrumentById = new Map<string, string>();
      instruments.forEach((instrument) => {
        instrumentById.set(instrument.id, instrument.common_symbol);
      });

      const instrumentIds = Array.from(instrumentById.keys());
      if (instrumentIds.length === 0) {
        return { opportunities: [], timestamp: Date.now() };
      }

      const { data: spreads, error: spreadError } = await supabase
        .from('arb_spreads')
        .select('*')
        .in('instrument_id', instrumentIds)
        .order('ts', { ascending: false })
        .limit(200);

      if (spreadError) throw spreadError;

      const venueIds = new Set<string>();
      (spreads ?? []).forEach((spread) => {
        venueIds.add(spread.buy_venue_id);
        venueIds.add(spread.sell_venue_id);
      });

      const { data: quotes, error: quoteError } = await supabase
        .from('spot_quotes')
        .select('*')
        .in('instrument_id', instrumentIds)
        .in('venue_id', Array.from(venueIds))
        .order('ts', { ascending: false })
        .limit(500);

      if (quoteError) throw quoteError;

      const latestQuoteByKey = new Map<string, typeof quotes[0]>();
      (quotes ?? []).forEach((quote) => {
        const key = `${quote.instrument_id}:${quote.venue_id}`;
        if (!latestQuoteByKey.has(key)) {
          latestQuoteByKey.set(key, quote);
        }
      });

      const opportunities: ArbitrageOpportunity[] = (spreads ?? [])
        .filter((spread): spread is typeof spread & { 
          buy_venue_id: string; 
          sell_venue_id: string; 
          instrument_id: string;
          net_edge_bps: number;
          liquidity_score: number;
          ts: string;
        } => 
          spread && 
          typeof spread.buy_venue_id === 'string' &&
          typeof spread.sell_venue_id === 'string' &&
          typeof spread.instrument_id === 'string' &&
          typeof spread.net_edge_bps === 'number' &&
          typeof spread.liquidity_score === 'number' &&
          typeof spread.ts === 'string'
        )
        .map((spread) => {
          const symbol = instrumentById.get(spread.instrument_id) ?? 'UNKNOWN';
          const buyVenueKey = venueKeyById.get(spread.buy_venue_id) ?? 'unknown';
          const sellVenueKey = venueKeyById.get(spread.sell_venue_id) ?? 'unknown';
          const buyQuote = latestQuoteByKey.get(`${spread.instrument_id}:${spread.buy_venue_id}`);
          const sellQuote = latestQuoteByKey.get(`${spread.instrument_id}:${spread.sell_venue_id}`);
          const buyPrice = buyQuote?.ask_price ?? 0;
          const sellPrice = sellQuote?.bid_price ?? 0;
          const spreadValue = sellPrice - buyPrice;
          const spreadPercent = buyPrice > 0 ? (spreadValue / buyPrice) * 100 : 0;
          const volume = Math.min(buyQuote?.ask_size ?? 0, sellQuote?.bid_size ?? 0);

          return {
            id: spread.id,
            symbol,
            buyExchange: buyVenueKey,
            sellExchange: sellVenueKey,
            buyPrice,
            sellPrice,
            spread: spreadValue,
            spreadPercent,
            estimatedProfit: spread.net_edge_bps,
            volume,
            confidence: spread.liquidity_score,
            timestamp: new Date(spread.ts).getTime(),
          };
        })
        .filter((opp) => opp.spreadPercent >= minSpreadPercent);

      return {
        opportunities,
        timestamp: Date.now(),
      };
    },
    staleTime: 5 * 1000,
    refetchInterval: enabled ? 10 * 1000 : false,
    enabled,
  });
}

export function useArbitragePrices(symbol: string) {
  return useQuery({
    queryKey: ['arb-prices', symbol],
    queryFn: async () => {
      const [venues, instruments] = await Promise.all([
        fetchVenues(),
        fetchInstruments([symbol]),
      ]);

      const venueKeyById = new Map<string, string>();
      venues.forEach((venue) => {
        venueKeyById.set(venue.id, normalizeVenueKey(venue.name));
      });

      const instrumentIds = instruments.map((instrument) => instrument.id);
      if (instrumentIds.length === 0) return [];

      const { data: quotes, error } = await supabase
        .from('spot_quotes')
        .select('*')
        .in('instrument_id', instrumentIds)
        .order('ts', { ascending: false })
        .limit(200);

      if (error) throw error;

      const latestByVenue = new Map<string, typeof quotes[0]>();
      (quotes ?? []).forEach((quote) => {
        const key = quote.venue_id;
        if (!latestByVenue.has(key)) {
          latestByVenue.set(key, quote);
        }
      });

      return Array.from(latestByVenue.values()).map((quote) => {
        const exchange = venueKeyById.get(quote.venue_id) ?? 'unknown';
        const spread = quote.ask_price - quote.bid_price;
        const spreadPercent = quote.bid_price > 0 ? (spread / quote.bid_price) * 100 : 0;
        return {
          exchange,
          bid: quote.bid_price,
          ask: quote.ask_price,
          spread,
          spreadPercent,
        };
      });
    },
    staleTime: 2 * 1000,
    refetchInterval: 5 * 1000,
    enabled: !!symbol,
  });
}

export function useArbitrageStatus() {
  return useQuery({
    queryKey: ['arb-status'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('arb_spreads')
        .select('id, ts')
        .gt('ts', cutoff)
        .order('ts', { ascending: false })
        .limit(100);

      if (error) throw error;

      const lastScanAt = data?.[0]?.ts ?? null;
      const totalOpportunities = data?.length ?? 0;

      return {
        isRunning: !!lastScanAt,
        activeStrategies: ['cross_exchange'],
        totalOpportunities,
        actionableOpportunities: totalOpportunities,
        lastScanAt: lastScanAt ?? new Date().toISOString(),
        profitToday: 0,
        profitAllTime: 0,
      };
    },
    staleTime: 60 * 1000,
  });
}

export function useTestArbitrageExecution() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Execution is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Test execution unavailable', { description: error.message });
    },
  });
}

export function useAnalyzeOpportunity() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Analysis is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Analysis unavailable', { description: error.message });
    },
  });
}

export function useExecuteArbitrage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      throw new Error('Execution is handled by the backend OMS.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arb-spreads-scan'] });
    },
    onError: (error: Error) => {
      toast.error('Execution unavailable', { description: error.message });
    },
  });
}

export function useArbitrageMonitor(enabled: boolean = true) {
  const scan = useArbitrageScan(['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'], 0.05, enabled);
  const status = useArbitrageStatus();

  return {
    opportunities: scan.data?.opportunities || [],
    isScanning: scan.isLoading,
    lastScan: scan.data?.timestamp,
    status: status.data,
    refetch: scan.refetch,
  };
}

export function useAutoExecuteArbitrage() {
  return useMutation({
    mutationFn: async () => {
      throw new Error('Auto-execution is handled by the backend OMS.');
    },
    onError: (error: Error) => {
      toast.error('Auto-execute unavailable', { description: error.message });
    },
  });
}

export function useKillSwitch() {
  return {
    isActive: false,
    reason: '',
    activatedAt: undefined,
    activate: () => undefined,
    deactivate: () => undefined,
    isLoading: false,
  };
}

export function useDailyPnLLimits() {
  return {
    dailyPnL: 0,
    dailyPnLLimit: 0,
    dailyPnLDate: '',
    limitBreached: false,
    percentUsed: 0,
    setLimit: () => undefined,
    resetPnL: () => undefined,
    isLoading: false,
  };
}

export function usePnLAnalytics() {
  return {
    dailyPnL: 0,
    dailyPnLLimit: 0,
    percentUsed: 0,
    stats: undefined,
    history: [],
    positionSizing: undefined,
    warningAlertsSent: { at70: false, at90: false },
    isLoading: false,
    refetch: () => undefined,
  };
}

export function usePositionSizing() {
  return {
    rules: undefined,
    currentSize: 0,
    pnlPercentUsed: 0,
    updateRules: { mutate: () => undefined, isPending: false },
    isLoading: false,
  };
}

export function useExchangeBalances(enabled: boolean = true) {
  return useQuery<BalanceSummary>({
    queryKey: ['arb-balances'],
    queryFn: async () => {
      return {
        balances: [],
        summary: {},
        totalUsdAvailable: 0,
        timestamp: Date.now(),
        exchangesConnected: {
          coinbase: false,
          kraken: false,
          binance_us: false,
        },
      };
    },
    enabled,
  });
}
