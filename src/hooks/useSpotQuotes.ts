import { useQuery } from '@tanstack/react-query';

export interface SpotQuoteRow {
  id: string;
  instrument_id: string;
  venue_id: string;
  bid_price: number;
  ask_price: number;
  bid_size: number;
  ask_size: number;
  spread_bps: number;
  ts: string;
}

// Note: The spot_quotes table does not exist in the current schema.
// This hook returns mock data until the table is created.

export function useSpotQuotes(instrumentIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['spot-quotes', instrumentIds],
    queryFn: async (): Promise<SpotQuoteRow[]> => {
      // TODO: Implement when spot_quotes table is created
      return [];
    },
    enabled: enabled && instrumentIds.length > 0,
    refetchInterval: enabled ? 5000 : false,
  });
}
