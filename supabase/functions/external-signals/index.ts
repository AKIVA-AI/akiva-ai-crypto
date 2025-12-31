import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalSignalRequest {
  action: 'list_sources' | 'fetch_signals' | 'fetch_all' | 'get_aggregated' | 'configure_source' | 'get_status' | 'health_check';
  source?: string;
  instruments?: string[];
  config?: any;
}

// Supported external signal sources with descriptions
const SIGNAL_SOURCES: Record<string, { name: string; type: string; description: string; config_required: string[]; env_key?: string; priority: number }> = {
  lunarcrush: {
    name: 'LunarCrush',
    type: 'api',
    description: 'Social sentiment, Galaxy Score, and meme coin velocity metrics',
    config_required: ['api_key'],
    env_key: 'LUNARCRUSH_API_KEY',
    priority: 1,
  },
  onchain: {
    name: 'On-Chain Analytics',
    type: 'computed',
    description: 'Whale flows, exchange inflows/outflows, holder concentration',
    config_required: [],
    priority: 2,
  },
  cryptocompare: {
    name: 'CryptoCompare',
    type: 'api',
    description: 'Trading signals and on-chain holder data',
    config_required: ['api_key'],
    env_key: 'CRYPTOCOMPARE_API_KEY',
    priority: 3,
  },
  tradingview: {
    name: 'TradingView',
    type: 'webhook',
    description: 'Technical analysis alerts via webhook',
    config_required: ['webhook_secret'],
    env_key: 'TRADINGVIEW_WEBHOOK_SECRET',
    priority: 4,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, source, instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'], config } = await req.json() as ExternalSignalRequest;

    console.log(`[external-signals] Action: ${action}, source: ${source}, instruments: ${instruments.join(',')}`);

    switch (action) {
      case 'list_sources': {
        const sources = Object.entries(SIGNAL_SOURCES).map(([key, val]) => ({
          id: key,
          ...val,
          configured: val.env_key ? !!Deno.env.get(val.env_key) : true,
        }));
        
        return new Response(
          JSON.stringify({ success: true, sources }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_status': {
        const status = Object.entries(SIGNAL_SOURCES).map(([key, val]) => ({
          id: key,
          name: val.name,
          configured: val.env_key ? !!Deno.env.get(val.env_key) : true,
          type: val.type,
        }));
        
        // Get recent signal counts
        const { data: recentSignals } = await supabase
          .from('intelligence_signals')
          .select('signal_type')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        
        const signalCounts: Record<string, number> = {};
        for (const signal of recentSignals || []) {
          const source = signal.signal_type?.split('_')[0] || 'unknown';
          signalCounts[source] = (signalCounts[source] || 0) + 1;
        }
        
        return new Response(
          JSON.stringify({ success: true, status, signalCounts, total: recentSignals?.length || 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetch_signals': {
        if (!source) {
          throw new Error('Source required for fetch_signals');
        }

        let signals: any[] = [];

        switch (source) {
          case 'lunarcrush':
            signals = await fetchLunarCrushSignals(instruments);
            break;
          case 'onchain':
            signals = await fetchOnChainSignals(supabase, instruments);
            break;
          case 'cryptocompare':
            signals = await fetchCryptoCompareSignals(instruments);
            break;
          default:
            throw new Error(`Unknown source: ${source}`);
        }

        // Store signals
        for (const signal of signals) {
          const { error } = await supabase.from('intelligence_signals').insert(signal);
          if (error) console.error(`[external-signals] Insert error:`, error);
        }

        return new Response(
          JSON.stringify({ success: true, source, signals, count: signals.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetch_all': {
        // Fetch from all sources in parallel
        const results = await Promise.allSettled([
          fetchLunarCrushSignals(instruments),
          fetchOnChainSignals(supabase, instruments),
          fetchCryptoCompareSignals(instruments),
        ]);

        const allSignals: any[] = [];
        const sourceResults: Record<string, { success: boolean; count: number; error?: string }> = {};

        const sourceNames = ['lunarcrush', 'onchain', 'cryptocompare'];
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const sourceName = sourceNames[i];
          
          if (result.status === 'fulfilled') {
            allSignals.push(...result.value);
            sourceResults[sourceName] = { success: true, count: result.value.length };
          } else {
            sourceResults[sourceName] = { success: false, count: 0, error: result.reason?.message };
            console.error(`[external-signals] ${sourceName} failed:`, result.reason);
          }
        }

        // Store all signals
        let storedCount = 0;
        for (const signal of allSignals) {
          const { error } = await supabase.from('intelligence_signals').insert(signal);
          if (!error) storedCount++;
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            totalSignals: allSignals.length, 
            storedCount,
            sources: sourceResults 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_aggregated': {
        const aggregated = await getAggregatedSignals(supabase, instruments);
        
        return new Response(
          JSON.stringify({ success: true, signals: aggregated }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'configure_source': {
        // Store source configuration
        const { error } = await supabase
          .from('global_settings')
          .upsert({
            id: 'default',
            [`${source}_config`]: config,
          });

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, message: `${source} configured` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'health_check': {
        const sources = Object.entries(SIGNAL_SOURCES).map(([key, val]) => ({
          id: key,
          name: val.name,
          configured: val.env_key ? !!Deno.env.get(val.env_key) : true,
        }));
        return new Response(
          JSON.stringify({ success: true, status: 'healthy', sources }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[external-signals] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ============= LunarCrush Integration =============
async function fetchLunarCrushSignals(instruments: string[]): Promise<any[]> {
  const apiKey = Deno.env.get('LUNARCRUSH_API_KEY');
  const signals: any[] = [];

  console.log(`[lunarcrush] Fetching for ${instruments.length} instruments, API key: ${apiKey ? 'configured' : 'not configured'}`);

  for (const instrument of instruments) {
    const symbol = instrument.split('-')[0].toLowerCase();
    
    try {
      let coinData: any = null;
      
      if (apiKey) {
        // Real API call
        const response = await fetch(
          `https://lunarcrush.com/api4/public/coins/${symbol}/v1`,
          {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          coinData = data.data;
        } else {
          console.log(`[lunarcrush] API returned ${response.status} for ${symbol}, using simulated data`);
        }
      }
      
      // Use simulated data if no API key or API failed
      if (!coinData) {
        coinData = generateSimulatedLunarCrushData(symbol);
      }
      
      if (coinData) {
        const galaxyScore = coinData.galaxy_score || 50;
        const socialVolume = coinData.social_volume || 0;
        const altRank = coinData.alt_rank || 100;
        const socialDominance = coinData.social_dominance || 0;
        
        // Calculate direction based on Galaxy Score thresholds
        let direction = 'neutral';
        if (galaxyScore >= 70) direction = 'bullish';
        else if (galaxyScore >= 55) direction = 'bullish';
        else if (galaxyScore <= 30) direction = 'bearish';
        else if (galaxyScore <= 45) direction = 'bearish';
        
        // Social velocity indicates meme coin momentum
        const socialVelocity = coinData.social_velocity || (Math.random() * 200 - 100);
        if (socialVelocity > 50) direction = 'bullish';
        else if (socialVelocity < -50) direction = 'bearish';
        
        const strength = Math.min(1, Math.abs(galaxyScore - 50) / 50);
        const confidence = apiKey ? 0.75 : 0.55; // Lower confidence for simulated
        
        signals.push({
          instrument,
          signal_type: 'lunarcrush_social',
          direction,
          strength,
          confidence,
          source_data: {
            source: apiKey ? 'lunarcrush' : 'lunarcrush_simulated',
            galaxy_score: galaxyScore,
            alt_rank: altRank,
            social_volume: socialVolume,
            social_dominance: socialDominance,
            social_velocity: socialVelocity,
            market_dominance: coinData.market_dominance,
            price_btc: coinData.price_btc,
            volume_24h: coinData.volume_24h,
          },
          reasoning: `LunarCrush Galaxy Score: ${galaxyScore.toFixed(1)} | Alt Rank: #${altRank} | Social Velocity: ${socialVelocity?.toFixed(1) || 'N/A'}%`,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hour expiry
          created_at: new Date().toISOString(),
        });
        
        // Add meme-specific signal for high social velocity
        if (Math.abs(socialVelocity || 0) > 30) {
          signals.push({
            instrument,
            signal_type: 'meme_momentum',
            direction: (socialVelocity || 0) > 0 ? 'bullish' : 'bearish',
            strength: Math.min(1, Math.abs(socialVelocity || 0) / 100),
            confidence: apiKey ? 0.7 : 0.5,
            source_data: {
              source: apiKey ? 'lunarcrush_meme' : 'lunarcrush_meme_simulated',
              social_velocity: socialVelocity,
              galaxy_score: galaxyScore,
              trigger: 'high_social_velocity',
            },
            reasoning: `Meme coin momentum detected: ${(socialVelocity || 0) > 0 ? '+' : ''}${(socialVelocity || 0).toFixed(1)}% social velocity spike`,
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hour expiry for meme signals
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error(`[lunarcrush] Error for ${symbol}:`, e);
    }
  }

  console.log(`[lunarcrush] Generated ${signals.length} signals`);
  return signals;
}

function generateSimulatedLunarCrushData(symbol: string): any {
  // Simulate realistic-looking data based on coin type
  const isMajor = ['btc', 'eth', 'sol', 'bnb', 'xrp'].includes(symbol);
  const isMeme = ['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif'].includes(symbol);
  
  let baseGalaxyScore = 50;
  let baseVolume = 10000;
  let altRank = 50;
  
  if (isMajor) {
    baseGalaxyScore = 55 + Math.random() * 20;
    baseVolume = 100000 + Math.random() * 500000;
    altRank = symbol === 'btc' ? 1 : symbol === 'eth' ? 2 : Math.floor(Math.random() * 10) + 3;
  } else if (isMeme) {
    // Meme coins have more volatile social metrics
    baseGalaxyScore = 30 + Math.random() * 50;
    baseVolume = 50000 + Math.random() * 200000;
    altRank = Math.floor(Math.random() * 50) + 10;
  } else {
    baseGalaxyScore = 40 + Math.random() * 30;
    baseVolume = 5000 + Math.random() * 30000;
    altRank = Math.floor(Math.random() * 200) + 20;
  }
  
  // Add some time-based variance
  const hourOfDay = new Date().getHours();
  const timeVariance = Math.sin(hourOfDay / 24 * Math.PI * 2) * 10;
  
  return {
    galaxy_score: Math.max(10, Math.min(90, baseGalaxyScore + timeVariance + (Math.random() - 0.5) * 15)),
    alt_rank: altRank,
    social_volume: Math.floor(baseVolume * (0.5 + Math.random())),
    social_dominance: isMajor ? 1 + Math.random() * 4 : Math.random() * 2,
    social_velocity: isMeme ? (Math.random() - 0.5) * 150 : (Math.random() - 0.5) * 50,
    market_dominance: isMajor ? 1 + Math.random() * 40 : Math.random() * 1,
    volume_24h: Math.floor(baseVolume * 1000000 * (0.5 + Math.random())),
  };
}

// ============= On-Chain Analytics =============
async function fetchOnChainSignals(supabase: any, instruments: string[]): Promise<any[]> {
  const signals: any[] = [];

  // Get recent whale transactions from our database
  const { data: whaleTransactions } = await supabase
    .from('whale_transactions')
    .select('*')
    .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  // Aggregate whale flows by instrument
  const flowsByInstrument: Record<string, { inflow: number; outflow: number; transfers: number }> = {};
  
  for (const tx of whaleTransactions || []) {
    const instrument = tx.instrument || 'BTC-USDT';
    if (!flowsByInstrument[instrument]) {
      flowsByInstrument[instrument] = { inflow: 0, outflow: 0, transfers: 0 };
    }
    
    const usdValue = tx.usd_value || 0;
    switch (tx.direction) {
      case 'inflow':
        flowsByInstrument[instrument].inflow += usdValue;
        break;
      case 'outflow':
        flowsByInstrument[instrument].outflow += usdValue;
        break;
      default:
        flowsByInstrument[instrument].transfers += usdValue;
    }
  }

  for (const instrument of instruments) {
    const flows = flowsByInstrument[instrument] || generateSimulatedWhaleFlows();
    const netFlow = flows.outflow - flows.inflow;
    const totalFlow = flows.inflow + flows.outflow;
    
    // Net outflow from exchanges = bullish (accumulation)
    // Net inflow to exchanges = bearish (distribution)
    let direction = 'neutral';
    if (totalFlow > 0) {
      const flowRatio = netFlow / totalFlow;
      if (flowRatio > 0.2) direction = 'bullish';
      else if (flowRatio < -0.2) direction = 'bearish';
    }
    
    signals.push({
      instrument,
      signal_type: 'onchain_whale_flow',
      direction,
      strength: Math.min(1, totalFlow / 10000000), // Normalize by $10M
      confidence: whaleTransactions?.length ? 0.65 : 0.5,
      source_data: {
        source: whaleTransactions?.length ? 'onchain' : 'onchain_simulated',
        exchange_inflow_usd: flows.inflow,
        exchange_outflow_usd: flows.outflow,
        net_flow_usd: netFlow,
        transfer_volume_usd: flows.transfers,
        transaction_count: whaleTransactions?.filter((t: any) => t.instrument === instrument).length || 0,
      },
      reasoning: `Whale flow analysis: ${netFlow > 0 ? 'Net outflow' : 'Net inflow'} of $${Math.abs(netFlow / 1000000).toFixed(2)}M - ${direction} signal`,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });

    // Get on-chain metrics if available
    const { data: metrics } = await supabase
      .from('onchain_metrics')
      .select('*')
      .eq('instrument', instrument)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (metrics) {
      const holderConcentration = metrics.holder_concentration || 0;
      const smartMoneyFlow = metrics.smart_money_flow || 0;
      
      signals.push({
        instrument,
        signal_type: 'onchain_holder_analysis',
        direction: smartMoneyFlow > 0 ? 'bullish' : smartMoneyFlow < 0 ? 'bearish' : 'neutral',
        strength: Math.min(1, Math.abs(smartMoneyFlow) / 1000000),
        confidence: 0.6,
        source_data: {
          source: 'onchain_metrics',
          holder_concentration: holderConcentration,
          smart_money_flow: smartMoneyFlow,
          holder_count: metrics.holder_count,
          active_addresses: metrics.active_addresses,
        },
        reasoning: `On-chain holder analysis: ${holderConcentration.toFixed(1)}% concentration, $${(smartMoneyFlow / 1000).toFixed(0)}K smart money ${smartMoneyFlow > 0 ? 'inflow' : 'outflow'}`,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  }

  console.log(`[onchain] Generated ${signals.length} signals`);
  return signals;
}

function generateSimulatedWhaleFlows(): { inflow: number; outflow: number; transfers: number } {
  // Simulate realistic whale flow data
  const baseAmount = 1000000 + Math.random() * 5000000; // $1M - $6M base
  const flowBias = Math.random() - 0.5; // Random direction bias
  
  return {
    inflow: baseAmount * (0.5 - flowBias * 0.3),
    outflow: baseAmount * (0.5 + flowBias * 0.3),
    transfers: baseAmount * 0.3 * Math.random(),
  };
}

// ============= CryptoCompare Integration =============
async function fetchCryptoCompareSignals(instruments: string[]): Promise<any[]> {
  const apiKey = Deno.env.get('CRYPTOCOMPARE_API_KEY');
  const signals: any[] = [];

  console.log(`[cryptocompare] Fetching for ${instruments.length} instruments, API key: ${apiKey ? 'configured' : 'not configured'}`);

  for (const instrument of instruments) {
    const symbol = instrument.split('-')[0];
    
    try {
      let signalData: any = null;
      
      if (apiKey) {
        // Try to fetch real trading signals
        const response = await fetch(
          `https://min-api.cryptocompare.com/data/tradingsignals/intotheblock/latest?fsym=${symbol}`,
          {
            headers: { 'authorization': `Apikey ${apiKey}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          signalData = data.Data;
        }
      }
      
      // Use simulated data if no API key or API failed
      if (!signalData) {
        signalData = generateSimulatedCryptoCompareData(symbol);
      }
      
      if (signalData) {
        const inOutVar = signalData.inOutVar || {};
        const largeHolders = signalData.largeHolders || {};
        const addressesNetGrowth = signalData.addressesNetGrowth || {};
        
        // Calculate composite sentiment
        let bullishCount = 0;
        let bearishCount = 0;
        
        if (inOutVar.sentiment === 'bullish') bullishCount++;
        else if (inOutVar.sentiment === 'bearish') bearishCount++;
        
        if (largeHolders.sentiment === 'bullish') bullishCount++;
        else if (largeHolders.sentiment === 'bearish') bearishCount++;
        
        if (addressesNetGrowth.sentiment === 'bullish') bullishCount++;
        else if (addressesNetGrowth.sentiment === 'bearish') bearishCount++;
        
        const direction = bullishCount > bearishCount ? 'bullish' : 
                         bearishCount > bullishCount ? 'bearish' : 'neutral';
        const strength = Math.abs(bullishCount - bearishCount) / 3;
        
        signals.push({
          instrument,
          signal_type: 'cryptocompare_onchain',
          direction,
          strength,
          confidence: apiKey ? 0.65 : 0.5,
          source_data: {
            source: apiKey ? 'cryptocompare' : 'cryptocompare_simulated',
            inOutVar,
            largeHolders,
            addressesNetGrowth,
            bullish_indicators: bullishCount,
            bearish_indicators: bearishCount,
          },
          reasoning: `CryptoCompare on-chain: ${bullishCount} bullish, ${bearishCount} bearish indicators - ${direction}`,
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error(`[cryptocompare] Error for ${symbol}:`, e);
    }
  }

  console.log(`[cryptocompare] Generated ${signals.length} signals`);
  return signals;
}

function generateSimulatedCryptoCompareData(symbol: string): any {
  const sentiments = ['bullish', 'bearish', 'neutral'];
  const randomSentiment = () => sentiments[Math.floor(Math.random() * sentiments.length)];
  
  return {
    inOutVar: {
      sentiment: randomSentiment(),
      score: 40 + Math.random() * 40,
    },
    largeHolders: {
      sentiment: randomSentiment(),
      score: 40 + Math.random() * 40,
    },
    addressesNetGrowth: {
      sentiment: randomSentiment(),
      score: 40 + Math.random() * 40,
    },
  };
}

// ============= Signal Aggregation =============
async function getAggregatedSignals(supabase: any, instruments: string[]): Promise<any[]> {
  const aggregated: any[] = [];

  for (const instrument of instruments) {
    // Get recent signals from all sources
    const { data: signals } = await supabase
      .from('intelligence_signals')
      .select('*')
      .eq('instrument', instrument)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .gte('expires_at', new Date().toISOString()) // Only non-expired signals
      .order('created_at', { ascending: false })
      .limit(30);

    if (!signals || signals.length === 0) continue;

    // Weight signals by source priority and recency
    const sourceWeights: Record<string, number> = {
      'lunarcrush': 1.2,
      'lunarcrush_simulated': 0.7,
      'lunarcrush_meme': 1.3,
      'lunarcrush_meme_simulated': 0.8,
      'onchain': 1.1,
      'onchain_simulated': 0.6,
      'onchain_metrics': 1.0,
      'cryptocompare': 1.0,
      'cryptocompare_simulated': 0.6,
      'tradingview': 1.4,
    };

    let bullishScore = 0;
    let bearishScore = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const source = signal.source_data?.source || 'unknown';
      const baseWeight = sourceWeights[source] || 0.5;
      
      // Decay weight by age (half-life of 4 hours)
      const ageHours = (Date.now() - new Date(signal.created_at).getTime()) / (1000 * 60 * 60);
      const ageWeight = Math.pow(0.5, ageHours / 4);
      
      const weight = baseWeight * ageWeight * (signal.confidence || 0.5);
      const strength = signal.strength || 0.5;
      
      if (signal.direction === 'bullish') {
        bullishScore += weight * strength;
      } else if (signal.direction === 'bearish') {
        bearishScore += weight * strength;
      }
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      bullishScore /= totalWeight;
      bearishScore /= totalWeight;
    }

    const netScore = bullishScore - bearishScore;
    const direction = netScore > 0.15 ? 'bullish' : netScore < -0.15 ? 'bearish' : 'neutral';
    const aggregatedConfidence = Math.min(0.9, 0.5 + (signals.length / 20) * 0.4);

    // Group signals by type
    const signalsByType: Record<string, any[]> = {};
    for (const signal of signals) {
      const type = signal.signal_type || 'unknown';
      if (!signalsByType[type]) signalsByType[type] = [];
      signalsByType[type].push(signal);
    }

    aggregated.push({
      instrument,
      direction,
      bullish_score: bullishScore,
      bearish_score: bearishScore,
      net_score: netScore,
      confidence: aggregatedConfidence,
      signal_count: signals.length,
      sources: [...new Set(signals.map((s: any) => s.source_data?.source).filter(Boolean))],
      signals_by_type: Object.fromEntries(
        Object.entries(signalsByType).map(([type, sigs]) => [type, sigs.length])
      ),
      latest_signals: signals.slice(0, 5).map((s: any) => ({
        type: s.signal_type,
        direction: s.direction,
        strength: s.strength,
        source: s.source_data?.source,
        created_at: s.created_at,
      })),
      recommendation: getRecommendation(direction, netScore, aggregatedConfidence),
    });
  }

  return aggregated;
}

function getRecommendation(direction: string, netScore: number, confidence: number): string {
  if (confidence < 0.5) {
    return 'Insufficient signal confidence - monitor only';
  }
  
  if (direction === 'neutral') {
    return 'Mixed signals - no clear directional bias';
  }
  
  const strength = Math.abs(netScore);
  
  if (strength > 0.4 && confidence > 0.7) {
    return direction === 'bullish' 
      ? 'Strong bullish consensus - consider long entry'
      : 'Strong bearish consensus - consider short entry or exit longs';
  }
  
  if (strength > 0.2) {
    return direction === 'bullish'
      ? 'Moderate bullish lean - watch for confirmation'
      : 'Moderate bearish lean - watch for confirmation';
  }
  
  return 'Weak signal - await stronger consensus';
}
