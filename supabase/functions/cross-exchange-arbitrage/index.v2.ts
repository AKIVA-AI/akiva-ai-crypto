/**
 * Cross-Exchange Arbitrage - OMS-First + Multi-Tenant
 * 
 * UPDATED: 2026-01-08
 * - Reads from arb_spreads, spot_quotes (canonical tables)
 * - Emits multi_leg_intents instead of executing orders
 * - Enforces tenant_id via RLS
 * - Includes idempotency keys
 * - Logs audit events
 * 
 * BREAKING CHANGES:
 * - 'execute' action now creates intents, not orders
 * - 'auto_execute' creates intents, not orders
 * - All queries are tenant-scoped
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

interface ArbitrageOpportunity {
  id: string;
  instrument_id: string;
  symbol: string;
  buy_venue_id: string;
  sell_venue_id: string;
  buy_venue: string;
  sell_venue: string;
  executable_spread_bps: number;
  net_edge_bps: number;
  liquidity_score: number;
  latency_score: number;
  buy_price: number;
  sell_price: number;
  volume: number;
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
    console.log(`[Spot Arb] Action: ${action}, Tenant: ${auth.tenantId}`);

    let result;

    switch (action) {
      case 'scan':
        // Read from arb_spreads (canonical table)
        const minSpreadBps = params.minSpreadBps || 10;
        const limit = params.limit || 20;

        const { data: opportunities, error: scanError } = await supabase
          .from('arb_spreads')
          .select(`
            *,
            instrument:instruments(common_symbol, venue_symbol),
            buy_venue:venues!arb_spreads_buy_venue_id_fkey(name),
            sell_venue:venues!arb_spreads_sell_venue_id_fkey(name)
          `)
          .eq('tenant_id', auth.tenantId)
          .gte('net_edge_bps', minSpreadBps)
          .order('net_edge_bps', { ascending: false })
          .limit(limit);

        if (scanError) throw scanError;

        // Transform to UI format
        const formattedOpps = opportunities?.map(opp => ({
          id: opp.id,
          instrument_id: opp.instrument_id,
          symbol: opp.instrument?.common_symbol || 'UNKNOWN',
          buy_venue_id: opp.buy_venue_id,
          sell_venue_id: opp.sell_venue_id,
          buy_venue: opp.buy_venue?.name || 'UNKNOWN',
          sell_venue: opp.sell_venue?.name || 'UNKNOWN',
          executable_spread_bps: opp.executable_spread_bps,
          net_edge_bps: opp.net_edge_bps,
          liquidity_score: opp.liquidity_score,
          latency_score: opp.latency_score,
          timestamp: opp.ts,
        })) || [];

        result = {
          opportunities: formattedOpps,
          scanned: formattedOpps.length,
          found: formattedOpps.length,
          timestamp: Date.now(),
        };
        break;

      case 'get_quotes':
        // Read from spot_quotes (canonical table)
        const { instrument_id, venue_id } = params;
        if (!instrument_id) throw new Error('instrument_id required');

        const quotesQuery = supabase
          .from('spot_quotes')
          .select('*')
          .eq('tenant_id', auth.tenantId)
          .eq('instrument_id', instrument_id)
          .order('ts', { ascending: false })
          .limit(10);

        if (venue_id) {
          quotesQuery.eq('venue_id', venue_id);
        }

        const { data: quotes, error: quotesError } = await quotesQuery;
        if (quotesError) throw quotesError;

        result = { quotes };
        break;

      case 'execute':
        // Create multi_leg_intent instead of executing orders
        if (!params.opportunity) throw new Error('opportunity required');
        
        const opp = params.opportunity as ArbitrageOpportunity;
        const intent_id = crypto.randomUUID();
        const idempotency_key = generateIdempotencyKey('spot_arb', opp.symbol);

        // Check kill switch
        const { data: killSwitch } = await supabase
          .from('system_config')
          .select('value')
          .eq('key', 'kill_switch_active')
          .single();

        if (killSwitch?.value === true) {
          throw new Error('Execution blocked: Kill switch is active');
        }

        // Create intent
        const { intent_id: createdId, error: intentError } = await createMultiLegIntent(supabase, {
          tenant_id: auth.tenantId,
          intent_id,
          legs_json: {
            buy_leg: {
              venue: opp.buy_venue,
              symbol: opp.symbol,
              side: 'buy',
              size: params.size || opp.volume,
              order_type: 'limit',
            },
            sell_leg: {
              venue: opp.sell_venue,
              symbol: opp.symbol,
              side: 'sell',
              size: params.size || opp.volume,
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
          action: 'spot_arb_intent_created',
          resource_type: 'multi_leg_intent',
          resource_id: intent_id,
          after_state: {
            opportunity: opp,
            intent_id,
            idempotency_key,
            size: params.size || opp.volume,
          },
        });

        // Send alert
        await supabase.from('alerts').insert({
          tenant_id: auth.tenantId,
          severity: 'info',
          title: 'Spot Arbitrage Intent Created',
          message: `Intent ${intent_id} created for ${opp.symbol}: ${opp.net_edge_bps}bps spread`,
          metadata: { intent_id, opportunity: opp },
        });

        result = {
          intent_id: createdId,
          status: 'pending',
          message: 'Intent created successfully. OMS will execute.',
        };
        break;

      case 'get_pnl':
        // Read from arb_pnl (canonical table)
        const { start_date, end_date } = params;

        const pnlQuery = supabase
          .from('arb_pnl')
          .select('*')
          .eq('tenant_id', auth.tenantId)
          .order('ts', { ascending: false });

        if (start_date) pnlQuery.gte('ts', start_date);
        if (end_date) pnlQuery.lte('ts', end_date);

        const { data: pnl, error: pnlError } = await pnlQuery.limit(100);
        if (pnlError) throw pnlError;

        // Calculate totals
        const totalPnl = pnl?.reduce((sum, p) => sum + (p.realized_pnl || 0), 0) || 0;
        const totalFees = pnl?.reduce((sum, p) => sum + (p.fees_pnl || 0), 0) || 0;

        result = {
          pnl,
          summary: {
            total_pnl: totalPnl,
            total_fees: totalFees,
            net_pnl: totalPnl + totalFees,
            count: pnl?.length || 0,
          },
        };
        break;

      case 'get_inventory':
        // Read from venue_inventory (canonical table)
        const { data: inventory, error: invError } = await supabase
          .from('venue_inventory')
          .select(`
            *,
            venue:venues(name)
          `)
          .eq('tenant_id', auth.tenantId)
          .order('updated_at', { ascending: false });

        if (invError) throw invError;

        result = { inventory };
        break;

      case 'status':
        // Get system status
        const { data: config } = await supabase
          .from('system_config')
          .select('*')
          .in('key', ['kill_switch_active', 'kill_switch_reason', 'daily_pnl_limit']);

        const killSwitchActive = config?.find(c => c.key === 'kill_switch_active')?.value || false;
        const killSwitchReason = config?.find(c => c.key === 'kill_switch_reason')?.value || '';
        const dailyPnLLimit = config?.find(c => c.key === 'daily_pnl_limit')?.value || -1000;

        // Get today's P&L
        const today = new Date().toISOString().split('T')[0];
        const { data: todayPnl } = await supabase
          .from('arb_pnl')
          .select('realized_pnl, fees_pnl')
          .eq('tenant_id', auth.tenantId)
          .gte('ts', today);

        const dailyPnL = todayPnl?.reduce((sum, p) => sum + (p.realized_pnl || 0) + (p.fees_pnl || 0), 0) || 0;

        result = {
          kill_switch_active: killSwitchActive,
          kill_switch_reason: killSwitchReason,
          daily_pnl: dailyPnL,
          daily_pnl_limit: dailyPnLLimit,
          tenant_id: auth.tenantId,
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[Spot Arb] Success: ${action}`);
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Spot Arb] Error:', error);
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
