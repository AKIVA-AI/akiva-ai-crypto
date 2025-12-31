import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FundingOpportunity {
  symbol: string;
  spotVenue: string;
  perpVenue: string;
  spotPrice: number;
  perpPrice: number;
  fundingRate: number;
  fundingRateAnnualized: number;
  nextFundingTime: string;
  direction: 'long_spot_short_perp' | 'short_spot_long_perp';
  estimatedApy: number;
  riskLevel: 'low' | 'medium' | 'high';
  netSpread: number;
  isActionable: boolean;
}

interface ArbitrageExecution {
  opportunityId: string;
  symbol: string;
  direction: string;
  spotVenue: string;
  perpVenue: string;
  spotSize: number;
  perpSize: number;
  paperMode: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, symbol, paperMode = true } = await req.json();

    switch (action) {
      case 'scan_funding_opportunities':
        return await scanFundingOpportunities(supabase);
      
      case 'get_funding_history':
        return await getFundingHistory(supabase, symbol);
      
      case 'execute_funding_arb':
        return await executeFundingArb(supabase, await req.json(), paperMode);
      
      case 'get_active_positions':
        return await getActiveFundingPositions(supabase);
      
      case 'close_funding_position':
        return await closeFundingPosition(supabase, await req.json(), paperMode);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Funding arb error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function scanFundingOpportunities(supabase: any): Promise<Response> {
  // Fetch latest derivatives metrics for funding rates
  const { data: derivativesData, error: derivError } = await supabase
    .from('derivatives_metrics')
    .select('*')
    .order('recorded_at', { ascending: false });

  if (derivError) throw derivError;

  // Group by instrument and get latest for each
  const latestByInstrument = new Map<string, any>();
  for (const row of derivativesData || []) {
    if (!latestByInstrument.has(row.instrument)) {
      latestByInstrument.set(row.instrument, row);
    }
  }

  // Fetch spot prices from tradeable instruments
  const { data: instruments } = await supabase
    .from('tradeable_instruments')
    .select('*')
    .eq('is_active', true)
    .in('product_type', ['spot', 'futures']);

  // Calculate opportunities
  const opportunities: FundingOpportunity[] = [];

  for (const [instrument, metrics] of latestByInstrument) {
    const fundingRate = metrics.funding_rate || 0;
    
    // Skip if funding rate is negligible
    if (Math.abs(fundingRate) < 0.0001) continue;

    // Annualized funding (3 funding periods per day * 365 days)
    const fundingRateAnnualized = fundingRate * 3 * 365 * 100;

    // Find matching spot instrument
    const spotInstrument = (instruments || []).find(
      (i: any) => i.symbol === instrument && i.product_type === 'spot'
    );

    // Simulate spot price (in production, fetch from market data)
    const spotPrice = 100; // Placeholder
    const perpPrice = 100 * (1 + fundingRate);

    // Determine direction
    // Negative funding = shorts pay longs = long perp, short spot
    // Positive funding = longs pay shorts = short perp, long spot
    const direction: FundingOpportunity['direction'] = 
      fundingRate > 0 ? 'long_spot_short_perp' : 'short_spot_long_perp';

    // Estimate fees (maker fee on both legs)
    const totalFees = 0.001 * 2; // 0.1% each side

    // Net APY after fees
    const estimatedApy = Math.abs(fundingRateAnnualized) - (totalFees * 365 * 100);

    // Risk assessment
    let riskLevel: FundingOpportunity['riskLevel'] = 'low';
    if (Math.abs(fundingRate) > 0.01) riskLevel = 'high'; // Extreme funding often reverts
    else if (Math.abs(fundingRate) > 0.005) riskLevel = 'medium';

    // Calculate spread between spot and perp
    const netSpread = Math.abs(perpPrice - spotPrice) / spotPrice * 100;

    // Is this actionable? (positive expected return after fees)
    const isActionable = estimatedApy > 5; // At least 5% APY to be worth it

    opportunities.push({
      symbol: instrument,
      spotVenue: spotInstrument?.venue || 'coinbase',
      perpVenue: metrics.venue || 'hyperliquid',
      spotPrice,
      perpPrice,
      fundingRate,
      fundingRateAnnualized,
      nextFundingTime: metrics.next_funding_time || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      direction,
      estimatedApy,
      riskLevel,
      netSpread,
      isActionable
    });
  }

  // Sort by estimated APY descending
  opportunities.sort((a, b) => b.estimatedApy - a.estimatedApy);

  // Store opportunities as intelligence signals
  for (const opp of opportunities.filter(o => o.isActionable)) {
    await supabase.from('intelligence_signals').upsert({
      instrument: opp.symbol,
      direction: opp.direction === 'long_spot_short_perp' ? 'bullish' : 'bearish',
      signal_type: 'funding_arbitrage',
      strength: Math.min(1, opp.estimatedApy / 50), // Normalize to 0-1
      confidence: opp.riskLevel === 'low' ? 0.9 : opp.riskLevel === 'medium' ? 0.7 : 0.5,
      reasoning: `Funding rate ${(opp.fundingRate * 100).toFixed(4)}% (${opp.fundingRateAnnualized.toFixed(1)}% APY). ${opp.direction.replace(/_/g, ' ')}.`,
      source_data: opp,
      expires_at: opp.nextFundingTime
    }, { onConflict: 'instrument,signal_type' });
  }

  return new Response(
    JSON.stringify({ 
      opportunities,
      actionable: opportunities.filter(o => o.isActionable).length,
      total: opportunities.length
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getFundingHistory(supabase: any, symbol: string): Promise<Response> {
  const { data, error } = await supabase
    .from('derivatives_metrics')
    .select('instrument, funding_rate, recorded_at, venue')
    .eq('instrument', symbol)
    .order('recorded_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  // Calculate statistics
  const fundingRates = (data || []).map((d: any) => d.funding_rate || 0);
  const avgFunding = fundingRates.reduce((a: number, b: number) => a + b, 0) / fundingRates.length;
  const maxFunding = Math.max(...fundingRates);
  const minFunding = Math.min(...fundingRates);

  return new Response(
    JSON.stringify({ 
      history: data,
      stats: {
        average: avgFunding,
        max: maxFunding,
        min: minFunding,
        avgAnnualized: avgFunding * 3 * 365 * 100
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function executeFundingArb(supabase: any, params: ArbitrageExecution, paperMode: boolean): Promise<Response> {
  const { opportunityId, symbol, direction, spotVenue, perpVenue, spotSize, perpSize } = params;

  console.log(`[Funding Arb] Executing: ${symbol} ${direction} (paper: ${paperMode})`);

  // In paper mode, simulate execution
  if (paperMode) {
    const execution = {
      opportunity_id: opportunityId,
      symbol,
      buy_exchange: direction === 'long_spot_short_perp' ? spotVenue : perpVenue,
      sell_exchange: direction === 'long_spot_short_perp' ? perpVenue : spotVenue,
      buy_price: 100, // Simulated
      sell_price: 100.05,
      quantity: spotSize,
      spread_percent: 0.05,
      gross_profit: spotSize * 0.0005,
      net_profit: spotSize * 0.0003,
      trading_fees: spotSize * 0.0002,
      status: 'simulated',
      metadata: {
        paper_mode: true,
        direction,
        execution_time: new Date().toISOString()
      }
    };

    const { data, error } = await supabase
      .from('arbitrage_executions')
      .insert(execution)
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true, 
        execution: data,
        message: 'Paper trade executed successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Live execution would go here
  // For now, return error for live mode
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'Live funding arbitrage execution not yet implemented. Use paper mode for testing.'
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getActiveFundingPositions(supabase: any): Promise<Response> {
  const { data, error } = await supabase
    .from('arbitrage_executions')
    .select('*')
    .in('status', ['simulated', 'executed', 'active'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return new Response(
    JSON.stringify({ positions: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function closeFundingPosition(supabase: any, params: { executionId: string }, paperMode: boolean): Promise<Response> {
  const { executionId } = params;

  const { data, error } = await supabase
    .from('arbitrage_executions')
    .update({ 
      status: 'closed',
      completed_at: new Date().toISOString(),
      metadata: { closed_in_paper_mode: paperMode }
    })
    .eq('id', executionId)
    .select()
    .single();

  if (error) throw error;

  return new Response(
    JSON.stringify({ success: true, execution: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
