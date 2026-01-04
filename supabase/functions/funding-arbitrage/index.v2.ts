/**
 * Funding Arbitrage (Basis Trading) - OMS-First + Multi-Tenant
 * 
 * UPDATED: 2026-01-08
 * - Reads from basis_quotes, funding_rates (canonical tables)
 * - Emits multi_leg_intents instead of executing orders
 * - Enforces tenant_id via RLS
 * - Includes idempotency keys
 * - Logs audit events
 * 
 * BREAKING CHANGES:
 * - 'execute_funding_arb' now creates intents, not orders
 * - All queries are tenant-scoped
 * - Removed arbitrage_executions table writes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { 
  createMultiLegIntent, 
  generateIdempotencyKey, 
  logAuditEvent 
} from "../_shared/oms-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BasisOpportunity {
  id: string;
  instrument_id: string;
  symbol: string;
  spot_venue_id: string;
  deriv_venue_id: string;
  spot_venue: string;
  deriv_venue: string;
  basis_bps: number;
  basis_z: number;
  funding_rate: number;
  funding_rate_annualized: number;
  estimated_apy: number;
  spot_bid: number;
  spot_ask: number;
  perp_bid: number;
  perp_ask: number;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Require authentication and tenant_id
    const { auth, error: authError } = await tenantGuard(supabase, corsHeaders);
    if (authError) return authError;

    // Parse request
    const { action, ...params } = await req.json();
    console.log(`[Basis Arb] Action: ${action}, Tenant: ${auth.tenantId}`);

    let result;

    switch (action) {
      case 'scan_funding_opportunities':
        // Read from basis_quotes (canonical table)
        const minBasisBps = params.minBasisBps || 50;
        const limit = params.limit || 20;

        const { data: opportunities, error: scanError } = await supabase
          .from('basis_quotes')
          .select(`
            *,
            instrument:instruments(common_symbol, venue_symbol),
            spot_venue:venues!basis_quotes_spot_venue_id_fkey(name),
            deriv_venue:venues!basis_quotes_deriv_venue_id_fkey(name)
          `)
          .eq('tenant_id', auth.tenantId)
          .gte('basis_bps', minBasisBps)
          .order('basis_bps', { ascending: false })
          .limit(limit);

        if (scanError) throw scanError;

        // Get funding rates for each opportunity
        const enrichedOpps = await Promise.all(
          (opportunities || []).map(async (opp) => {
            const { data: fundingData } = await supabase
              .from('funding_rates')
              .select('funding_rate, funding_time')
              .eq('tenant_id', auth.tenantId)
              .eq('instrument_id', opp.instrument_id)
              .order('funding_time', { ascending: false })
              .limit(1)
              .single();

            const fundingRate = fundingData?.funding_rate || 0;
            const fundingRateAnnualized = fundingRate * 24 * 365 * 100; // Hourly to annual %
            const estimatedApy = Math.abs(fundingRateAnnualized) - 0.04; // Subtract fees

            return {
              id: opp.id,
              instrument_id: opp.instrument_id,
              symbol: opp.instrument?.common_symbol || 'UNKNOWN',
              spot_venue_id: opp.spot_venue_id,
              deriv_venue_id: opp.deriv_venue_id,
              spot_venue: opp.spot_venue?.name || 'UNKNOWN',
              deriv_venue: opp.deriv_venue?.name || 'UNKNOWN',
              basis_bps: opp.basis_bps,
              basis_z: opp.basis_z,
              funding_rate: fundingRate,
              funding_rate_annualized: fundingRateAnnualized,
              estimated_apy: estimatedApy,
              spot_bid: opp.spot_bid,
              spot_ask: opp.spot_ask,
              perp_bid: opp.perp_bid,
              perp_ask: opp.perp_ask,
              timestamp: opp.ts,
            };
          })
        );

        result = {
          opportunities: enrichedOpps,
          actionable: enrichedOpps.filter(o => o.estimated_apy > 10).length,
          total: enrichedOpps.length,
        };
        break;

      case 'get_funding_history':
        // Read from funding_rates (canonical table)
        const { symbol, instrument_id } = params;
        if (!instrument_id) throw new Error('instrument_id required');

        const { data: history, error: historyError } = await supabase
          .from('funding_rates')
          .select(`
            *,
            instrument:instruments(common_symbol),
            venue:venues(name)
          `)
          .eq('tenant_id', auth.tenantId)
          .eq('instrument_id', instrument_id)
          .order('funding_time', { ascending: false })
          .limit(100);

        if (historyError) throw historyError;

        result = { history };
        break;

      case 'execute_funding_arb':
        // Create multi_leg_intent instead of executing orders
        if (!params.opportunityId) throw new Error('opportunityId required');
        if (!params.symbol) throw new Error('symbol required');
        if (!params.direction) throw new Error('direction required');
        if (!params.spotVenue) throw new Error('spotVenue required');
        if (!params.perpVenue) throw new Error('perpVenue required');
        if (!params.spotSize) throw new Error('spotSize required');
        if (!params.perpSize) throw new Error('perpSize required');

        const intent_id = crypto.randomUUID();
        const idempotency_key = generateIdempotencyKey('basis_arb', params.symbol);

        // Check kill switch
        const { data: killSwitch } = await supabase
          .from('system_config')
          .select('value')
          .eq('key', 'kill_switch_active')
          .single();

        if (killSwitch?.value === true) {
          throw new Error('Execution blocked: Kill switch is active');
        }

        // Determine leg sides based on direction
        const spotSide = params.direction === 'long_spot_short_perp' ? 'buy' : 'sell';
        const perpSide = params.direction === 'long_spot_short_perp' ? 'sell' : 'buy';

        // Create intent
        const { intent_id: createdId, error: intentError } = await createMultiLegIntent(supabase, {
          tenant_id: auth.tenantId,
          intent_id,
          legs_json: {
            spot_leg: {
              venue: params.spotVenue,
              symbol: params.symbol,
              side: spotSide,
              size: params.spotSize,
              order_type: 'limit',
            },
            perp_leg: {
              venue: params.perpVenue,
              symbol: params.symbol,
              side: perpSide,
              size: params.perpSize,
              order_type: 'limit',
            },
          },
          status: 'pending',
          idempotency_key,
        });

        if (intentError) {
          if (intentError === 'DUPLICATE_INTENT') {
            result = {
              intent_id,
              status: 'duplicate',
              message: 'Intent already exists with this idempotency key'
            };
            break;
          }
          throw new Error(intentError);
        }

        // Log audit event
        await logAuditEvent(supabase, {
          tenant_id: auth.tenantId,
          user_id: auth.userId,
          action: 'basis_arb_intent_created',
          resource_type: 'multi_leg_intent',
          resource_id: intent_id,
          after_state: {
            opportunity_id: params.opportunityId,
            symbol: params.symbol,
            direction: params.direction,
            intent_id,
            idempotency_key,
          },
        });

        // Send alert
        await supabase.from('alerts').insert({
          tenant_id: auth.tenantId,
          severity: 'info',
          title: 'Basis Arbitrage Intent Created',
          message: `Intent ${intent_id} created for ${params.symbol}: ${params.direction}`,
          metadata: { intent_id, params },
        });

        result = {
          intent_id: createdId,
          status: 'pending',
          message: 'Intent created successfully. OMS will execute.',
        };
        break;

      case 'get_active_positions':
        // Read from strategy_positions (canonical table)
        const { data: positions, error: posError } = await supabase
          .from('strategy_positions')
          .select(`
            *,
            strategy:strategies(name, status),
            instrument:instruments(common_symbol, venue_symbol)
          `)
          .eq('tenant_id', auth.tenantId)
          .or('spot_position.neq.0,deriv_position.neq.0')
          .order('updated_at', { ascending: false });

        if (posError) throw posError;

        result = { positions };
        break;

      case 'close_funding_position':
        // Create intent to close position
        if (!params.position_id) throw new Error('position_id required');

        // Get position details
        const { data: position, error: getPosError } = await supabase
          .from('strategy_positions')
          .select(`
            *,
            instrument:instruments(common_symbol, venue_symbol)
          `)
          .eq('tenant_id', auth.tenantId)
          .eq('id', params.position_id)
          .single();

        if (getPosError) throw getPosError;
        if (!position) throw new Error('Position not found');

        const close_intent_id = crypto.randomUUID();
        const close_idempotency_key = generateIdempotencyKey('close_basis', position.instrument.common_symbol);

        // Create close intent (reverse the positions)
        const { intent_id: closeCreatedId, error: closeIntentError } = await createMultiLegIntent(supabase, {
          tenant_id: auth.tenantId,
          intent_id: close_intent_id,
          legs_json: {
            spot_leg: {
              venue: 'spot', // TODO: Get from position
              symbol: position.instrument.common_symbol,
              side: position.spot_position > 0 ? 'sell' : 'buy',
              size: Math.abs(position.spot_position),
              order_type: 'market',
            },
            perp_leg: {
              venue: 'perp', // TODO: Get from position
              symbol: position.instrument.common_symbol,
              side: position.deriv_position > 0 ? 'sell' : 'buy',
              size: Math.abs(position.deriv_position),
              order_type: 'market',
              reduce_only: true,
            },
          },
          status: 'pending',
          idempotency_key: close_idempotency_key,
        });

        if (closeIntentError) throw new Error(closeIntentError);

        // Log audit event
        await logAuditEvent(supabase, {
          tenant_id: auth.tenantId,
          user_id: auth.userId,
          action: 'basis_position_close_intent_created',
          resource_type: 'multi_leg_intent',
          resource_id: close_intent_id,
          after_state: {
            position_id: params.position_id,
            intent_id: close_intent_id,
          },
        });

        result = {
          intent_id: closeCreatedId,
          status: 'pending',
          message: 'Close intent created successfully.',
        };
        break;

      case 'get_pnl':
        // Read from basis_pnl (canonical table)
        const { start_date, end_date } = params;

        const pnlQuery = supabase
          .from('basis_pnl')
          .select('*')
          .eq('tenant_id', auth.tenantId)
          .order('ts', { ascending: false });

        if (start_date) pnlQuery.gte('ts', start_date);
        if (end_date) pnlQuery.lte('ts', end_date);

        const { data: pnl, error: pnlError } = await pnlQuery.limit(100);
        if (pnlError) throw pnlError;

        // Calculate totals
        const totalRealized = pnl?.reduce((sum, p) => sum + (p.realized_pnl || 0), 0) || 0;
        const totalUnrealized = pnl?.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0) || 0;
        const totalFunding = pnl?.reduce((sum, p) => sum + (p.funding_pnl || 0), 0) || 0;
        const totalFees = pnl?.reduce((sum, p) => sum + (p.fees_pnl || 0), 0) || 0;

        result = {
          pnl,
          summary: {
            total_realized: totalRealized,
            total_unrealized: totalUnrealized,
            total_funding: totalFunding,
            total_fees: totalFees,
            net_pnl: totalRealized + totalUnrealized + totalFunding + totalFees,
            count: pnl?.length || 0,
          },
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[Basis Arb] Success: ${action}`);
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Basis Arb] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
