import { useQuery } from '@tanstack/react-query';

export interface SpotArbSpreadRow {
  id: string;
  instrument_id: string;
  buy_venue_id: string;
  sell_venue_id: string;
  executable_spread_bps: number;
  net_edge_bps: number;
  liquidity_score: number;
  latency_score: number;
  ts: string;
}

// Note: The arb_spreads table does not exist in the current schema.
// This hook returns mock data until the table is created.

export function useSpotArbSpreads(enabled = true) {
  return useQuery({
    queryKey: ['spot-arb-spreads'],
    queryFn: async (): Promise<SpotArbSpreadRow[]> => {
      // TODO: Implement when arb_spreads table is created
      return [];
    },
    enabled,
    refetchInterval: enabled ? 10000 : false,
  });
}
