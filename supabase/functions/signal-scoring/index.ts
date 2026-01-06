import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecureCorsHeaders, RATE_LIMITS, rateLimitMiddleware, validateAuth } from "../_shared/security.ts";

// Factor weights for composite scoring
const FACTOR_WEIGHTS = {
  technical: 0.30,    // RSI, MACD, Volume momentum
  sentiment: 0.20,    // Social velocity, news sentiment
  onchain: 0.20,      // Exchange flows, whale activity
  derivatives: 0.20,  // Funding rates, OI, Long/Short ratio
  market_structure: 0.10  // Volume, liquidity, spread
};

const HIGH_PROBABILITY_THRESHOLD = 0.80;

interface FactorScores {
  technical: number;
  sentiment: number;
  onchain: number;
  derivatives: number;
  market_structure: number;
}

serve(async (req) => {
  const corsHeaders = getSecureCorsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, instruments, tier, venue, product_type } = await req.json();

    switch (action) {
      case 'scan_opportunities':
        return await scanOpportunities(supabase, { tier, venue, product_type }, corsHeaders);
      
      case 'compute_scores':
        return await computeScores(supabase, instruments || [], corsHeaders);
      
      case 'get_high_probability':
        return await getHighProbabilitySignals(supabase, { tier, venue, product_type }, corsHeaders);
      
      case 'get_tradeable_instruments':
        return await getTradeableInstruments(supabase, { tier, venue, product_type }, corsHeaders);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Signal scoring error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getTradeableInstruments(supabase: any, filters: { tier?: number, venue?: string, product_type?: string }, corsHeaders: Record<string, string>) {
  let query = supabase
    .from('tradeable_instruments')
    .select('*')
    .eq('is_active', true)
    .order('tier', { ascending: true })
    .order('volume_24h', { ascending: false });

  if (filters.tier) {
    query = query.lte('tier', filters.tier);
  }
  if (filters.venue) {
    query = query.eq('venue', filters.venue);
  }
  if (filters.product_type) {
    query = query.eq('product_type', filters.product_type);
  }

  const { data, error } = await query;

  if (error) throw error;

  return new Response(
    JSON.stringify({ instruments: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function scanOpportunities(supabase: any, filters: { tier?: number, venue?: string, product_type?: string }, corsHeaders: Record<string, string>) {
  // Get tradeable instruments based on filters
  let instrumentQuery = supabase
    .from('tradeable_instruments')
    .select('symbol, tier, venue, product_type')
    .eq('is_active', true);

  if (filters.tier) {
    instrumentQuery = instrumentQuery.lte('tier', filters.tier);
  }
  if (filters.venue) {
    instrumentQuery = instrumentQuery.eq('venue', filters.venue);
  }
  if (filters.product_type) {
    instrumentQuery = instrumentQuery.eq('product_type', filters.product_type);
  }

  const { data: instruments, error: instError } = await instrumentQuery;
  if (instError) throw instError;

  const symbols: string[] = Array.from(new Set((instruments || []).map((i: any) => String(i.symbol))));
  
  // Compute scores for all symbols
  const scoredSignals = await computeScoresForSymbols(supabase, symbols, instruments || []);
  
  // Store scored signals
  for (const signal of scoredSignals) {
    await supabase.from('intelligence_signals').upsert({
      instrument: signal.instrument,
      direction: signal.direction,
      signal_type: 'composite_scan',
      strength: signal.composite_score,
      confidence: signal.composite_score,
      composite_score: signal.composite_score,
      factor_scores: signal.factor_scores,
      is_high_probability: signal.composite_score >= HIGH_PROBABILITY_THRESHOLD,
      tier: signal.tier,
      venue: signal.venue,
      product_type: signal.product_type,
      reasoning: signal.reasoning,
      source_data: signal.source_data,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour expiry
    }, { onConflict: 'instrument,signal_type' });
  }

  // Return high probability signals
  const highProbSignals = scoredSignals.filter(s => s.composite_score >= HIGH_PROBABILITY_THRESHOLD);

  return new Response(
    JSON.stringify({ 
      scanned: symbols.length,
      high_probability: highProbSignals.length,
      signals: highProbSignals,
      all_signals: scoredSignals
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function computeScoresForSymbols(supabase: any, symbols: string[], instruments: any[]) {
  const results = [];
  const lookbackHours = 24;
  const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  for (const symbol of symbols) {
    const instrumentInfo = instruments.find((i: any) => i.symbol === symbol) || {};
    
    // Fetch all data in parallel
    const [sentimentData, derivativesData, onchainData, newsData] = await Promise.all([
      supabase
        .from('social_sentiment')
        .select('*')
        .eq('instrument', symbol)
        .gte('recorded_at', lookbackTime)
        .order('recorded_at', { ascending: false })
        .limit(10),
      supabase
        .from('derivatives_metrics')
        .select('*')
        .eq('instrument', symbol)
        .gte('recorded_at', lookbackTime)
        .order('recorded_at', { ascending: false })
        .limit(5),
      supabase
        .from('onchain_metrics')
        .select('*')
        .eq('instrument', symbol)
        .gte('recorded_at', lookbackTime)
        .order('recorded_at', { ascending: false })
        .limit(5),
      supabase
        .from('market_news')
        .select('*')
        .contains('instruments', [symbol])
        .gte('created_at', lookbackTime)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    // Calculate factor scores
    const factorScores = calculateFactorScores(
      sentimentData.data || [],
      derivativesData.data || [],
      onchainData.data || [],
      newsData.data || []
    );

    // Calculate composite score
    const compositeScore = 
      factorScores.technical * FACTOR_WEIGHTS.technical +
      factorScores.sentiment * FACTOR_WEIGHTS.sentiment +
      factorScores.onchain * FACTOR_WEIGHTS.onchain +
      factorScores.derivatives * FACTOR_WEIGHTS.derivatives +
      factorScores.market_structure * FACTOR_WEIGHTS.market_structure;

    // Determine direction based on factor signals
    const direction = determineDirection(factorScores, derivativesData.data || [], sentimentData.data || []);
    
    // Generate reasoning
    const reasoning = generateReasoning(factorScores, direction, compositeScore);

    results.push({
      instrument: symbol,
      composite_score: Math.round(compositeScore * 100) / 100,
      factor_scores: factorScores,
      direction,
      reasoning,
      tier: instrumentInfo.tier || 3,
      venue: instrumentInfo.venue || 'unknown',
      product_type: instrumentInfo.product_type || 'spot',
      source_data: {
        sentiment_count: sentimentData.data?.length || 0,
        derivatives_count: derivativesData.data?.length || 0,
        onchain_count: onchainData.data?.length || 0,
        news_count: newsData.data?.length || 0
      }
    });
  }

  // Sort by composite score descending
  results.sort((a, b) => b.composite_score - a.composite_score);

  return results;
}

function calculateFactorScores(sentiment: any[], derivatives: any[], onchain: any[], news: any[]): FactorScores {
  // Technical score - based on momentum indicators (simulated for now)
  // In production, this would pull from actual price/volume data
  const technicalScore = 0.5 + (Math.random() * 0.3 - 0.15); // Base 0.5 with some variance

  // Sentiment score
  let sentimentScore = 0.5;
  if (sentiment.length > 0) {
    const avgSentiment = sentiment.reduce((sum, s) => sum + (s.sentiment_score || 0), 0) / sentiment.length;
    const avgVelocity = sentiment.reduce((sum, s) => sum + (s.velocity || 0), 0) / sentiment.length;
    // Normalize: sentiment_score is typically -1 to 1, convert to 0-1
    sentimentScore = Math.max(0, Math.min(1, (avgSentiment + 1) / 2 + avgVelocity * 0.01));
  }
  if (news.length > 0) {
    const avgNewsSentiment = news.reduce((sum, n) => sum + (n.sentiment_score || 0), 0) / news.length;
    const avgImpact = news.reduce((sum, n) => sum + (n.impact_score || 0), 0) / news.length;
    // Blend news sentiment with social sentiment
    sentimentScore = sentimentScore * 0.6 + ((avgNewsSentiment + 1) / 2) * 0.3 + (avgImpact / 100) * 0.1;
  }

  // On-chain score
  let onchainScore = 0.5;
  if (onchain.length > 0) {
    const latestOnchain = onchain[0];
    const exchangeFlow = (latestOnchain.exchange_outflow || 0) - (latestOnchain.exchange_inflow || 0);
    const whaleActivity = latestOnchain.whale_transactions || 0;
    const smartMoneyFlow = latestOnchain.smart_money_flow || 0;
    
    // Positive outflow = bullish, high whale activity = significant
    onchainScore = 0.5 + 
      (exchangeFlow > 0 ? 0.15 : exchangeFlow < 0 ? -0.1 : 0) +
      (whaleActivity > 10 ? 0.1 : 0) +
      (smartMoneyFlow > 0 ? 0.15 : smartMoneyFlow < 0 ? -0.1 : 0);
  }

  // Derivatives score
  let derivativesScore = 0.5;
  if (derivatives.length > 0) {
    const latestDerivatives = derivatives[0];
    const fundingRate = latestDerivatives.funding_rate || 0;
    const longShortRatio = latestDerivatives.long_short_ratio || 1;
    const oiChange = latestDerivatives.oi_change_24h || 0;

    // Negative funding with high OI = potential squeeze
    // High long/short ratio extremes = potential reversal
    derivativesScore = 0.5 +
      (fundingRate < -0.01 ? 0.15 : fundingRate > 0.01 ? -0.1 : 0) +
      (longShortRatio > 2 ? -0.1 : longShortRatio < 0.5 ? 0.1 : 0) +
      (oiChange > 10 ? 0.1 : oiChange < -10 ? -0.1 : 0);
  }

  // Market structure score (simulated)
  const marketStructureScore = 0.5 + (Math.random() * 0.2 - 0.1);

  return {
    technical: Math.max(0, Math.min(1, technicalScore)),
    sentiment: Math.max(0, Math.min(1, sentimentScore)),
    onchain: Math.max(0, Math.min(1, onchainScore)),
    derivatives: Math.max(0, Math.min(1, derivativesScore)),
    market_structure: Math.max(0, Math.min(1, marketStructureScore))
  };
}

function determineDirection(factors: FactorScores, derivatives: any[], sentiment: any[]): string {
  const avgScore = (factors.technical + factors.sentiment + factors.onchain + factors.derivatives) / 4;
  
  // Check for strong directional bias
  if (avgScore >= 0.65) return 'bullish';
  if (avgScore <= 0.35) return 'bearish';
  
  // Check derivatives for direction hint
  if (derivatives.length > 0) {
    const fundingRate = derivatives[0].funding_rate || 0;
    if (fundingRate < -0.005) return 'bullish'; // Negative funding = longs paying, potential squeeze
    if (fundingRate > 0.01) return 'bearish';
  }
  
  return 'neutral';
}

function generateReasoning(factors: FactorScores, direction: string, score: number): string {
  const reasons = [];
  
  if (factors.technical >= 0.7) reasons.push('Strong technical momentum');
  else if (factors.technical <= 0.3) reasons.push('Weak technicals');
  
  if (factors.sentiment >= 0.7) reasons.push('Bullish social sentiment');
  else if (factors.sentiment <= 0.3) reasons.push('Negative sentiment');
  
  if (factors.onchain >= 0.7) reasons.push('Favorable on-chain flows');
  else if (factors.onchain <= 0.3) reasons.push('Concerning on-chain activity');
  
  if (factors.derivatives >= 0.7) reasons.push('Derivatives signal opportunity');
  else if (factors.derivatives <= 0.3) reasons.push('Derivatives show risk');
  
  if (reasons.length === 0) {
    return `Mixed signals with ${Math.round(score * 100)}% confidence - awaiting clearer direction`;
  }
  
  return `${direction.toUpperCase()}: ${reasons.join(', ')}. Composite score: ${Math.round(score * 100)}%`;
}

async function computeScores(supabase: any, instruments: string[], corsHeaders: Record<string, string>) {
  if (instruments.length === 0) {
    // Default to Tier 1 instruments
    const { data } = await supabase
      .from('tradeable_instruments')
      .select('symbol')
      .eq('tier', 1)
      .eq('is_active', true);
    instruments = [...new Set((data || []).map((i: any) => i.symbol as string))] as string[];
  }

  const { data: instrumentData } = await supabase
    .from('tradeable_instruments')
    .select('*')
    .in('symbol', instruments);

  const scores = await computeScoresForSymbols(supabase, instruments, instrumentData || []);

  return new Response(
    JSON.stringify({ scores }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getHighProbabilitySignals(supabase: any, filters: { tier?: number, venue?: string, product_type?: string }, corsHeaders: Record<string, string>) {
  let query = supabase
    .from('intelligence_signals')
    .select('*')
    .eq('is_high_probability', true)
    .gte('expires_at', new Date().toISOString())
    .order('composite_score', { ascending: false });

  if (filters.tier) {
    query = query.lte('tier', filters.tier);
  }
  if (filters.venue) {
    query = query.eq('venue', filters.venue);
  }
  if (filters.product_type) {
    query = query.eq('product_type', filters.product_type);
  }

  const { data, error } = await query.limit(20);

  if (error) throw error;

  return new Response(
    JSON.stringify({ signals: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
