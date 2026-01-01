import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Macro Indicators Edge Function
 * 
 * Fetches macro economic indicators from FRED that influence crypto markets:
 * - Federal Funds Rate (DFF)
 * - CPI Inflation (CPIAUCSL)
 * - M2 Money Supply (M2SL)
 * - 10-Year Treasury Yield (DGS10)
 * - Dollar Index proxy via EUR/USD
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRED_API_KEY = Deno.env.get('FRED_API_KEY');
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

// Key macro indicators that affect crypto
const MACRO_SERIES = {
  fed_funds_rate: { id: 'DFF', name: 'Federal Funds Rate', unit: '%', impact: 'Higher rates = bearish crypto' },
  cpi_inflation: { id: 'CPIAUCSL', name: 'CPI Inflation Index', unit: 'index', impact: 'High inflation = bullish BTC (hedge)' },
  m2_money_supply: { id: 'M2SL', name: 'M2 Money Supply', unit: 'billions', impact: 'Expansion = bullish crypto' },
  treasury_10y: { id: 'DGS10', name: '10-Year Treasury Yield', unit: '%', impact: 'Higher yields = bearish risk assets' },
  unemployment: { id: 'UNRATE', name: 'Unemployment Rate', unit: '%', impact: 'High unemployment = loose policy = bullish crypto' },
  sp500: { id: 'SP500', name: 'S&P 500', unit: 'index', impact: 'Correlation with BTC ~0.6' },
};

interface MacroRequest {
  action: 'get_latest' | 'get_all' | 'get_signals' | 'health';
  indicators?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { action = 'get_all', indicators } = await req.json() as MacroRequest;
    
    console.log(`[MacroIndicators] Action: ${action}, FRED API: ${FRED_API_KEY ? 'configured' : 'missing'}`);

    if (!FRED_API_KEY) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'FRED_API_KEY not configured',
          hint: 'Add your FRED API key to Supabase Edge Function secrets'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    switch (action) {
      case 'get_all': {
        const data = await fetchAllMacroData();
        return new Response(
          JSON.stringify({ 
            success: true, 
            data,
            latencyMs: Date.now() - startTime 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_latest': {
        const selectedIndicators = indicators || Object.keys(MACRO_SERIES);
        const data = await fetchLatestIndicators(selectedIndicators);
        return new Response(
          JSON.stringify({ 
            success: true, 
            data,
            latencyMs: Date.now() - startTime 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_signals': {
        const macroData = await fetchAllMacroData();
        const signals = generateMacroSignals(macroData);
        return new Response(
          JSON.stringify({ 
            success: true, 
            signals,
            rawData: macroData,
            latencyMs: Date.now() - startTime 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'health': {
        return new Response(
          JSON.stringify({ 
            status: 'healthy',
            fredApiConfigured: !!FRED_API_KEY,
            availableIndicators: Object.keys(MACRO_SERIES),
            latencyMs: Date.now() - startTime 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[MacroIndicators] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: String(error),
        latencyMs: Date.now() - startTime 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function fetchFredSeries(seriesId: string, limit: number = 10): Promise<any[]> {
  const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`[MacroIndicators] FRED API error for ${seriesId}: ${response.status}`);
    return [];
  }
  
  const data = await response.json();
  return data.observations || [];
}

async function fetchAllMacroData(): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  
  // Fetch all series in parallel
  const promises = Object.entries(MACRO_SERIES).map(async ([key, series]) => {
    try {
      const observations = await fetchFredSeries(series.id, 30);
      
      if (observations.length > 0) {
        const latest = observations[0];
        const previous = observations[1];
        const monthAgo = observations.find((o: any, i: number) => i >= 20) || observations[observations.length - 1];
        
        const latestValue = parseFloat(latest.value) || 0;
        const previousValue = parseFloat(previous?.value) || latestValue;
        const monthAgoValue = parseFloat(monthAgo?.value) || latestValue;
        
        results[key] = {
          ...series,
          latestValue,
          latestDate: latest.date,
          change: latestValue - previousValue,
          changePercent: previousValue ? ((latestValue - previousValue) / previousValue) * 100 : 0,
          monthChange: latestValue - monthAgoValue,
          monthChangePercent: monthAgoValue ? ((latestValue - monthAgoValue) / monthAgoValue) * 100 : 0,
          trend: latestValue > previousValue ? 'rising' : latestValue < previousValue ? 'falling' : 'flat',
          history: observations.slice(0, 10).map((o: any) => ({
            date: o.date,
            value: parseFloat(o.value) || 0,
          })),
        };
      }
    } catch (e) {
      console.error(`[MacroIndicators] Error fetching ${key}:`, e);
    }
  });
  
  await Promise.all(promises);
  return results;
}

async function fetchLatestIndicators(indicators: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  
  for (const key of indicators) {
    const series = MACRO_SERIES[key as keyof typeof MACRO_SERIES];
    if (!series) continue;
    
    try {
      const observations = await fetchFredSeries(series.id, 2);
      if (observations.length > 0) {
        const latest = observations[0];
        results[key] = {
          ...series,
          value: parseFloat(latest.value) || 0,
          date: latest.date,
        };
      }
    } catch (e) {
      console.error(`[MacroIndicators] Error fetching ${key}:`, e);
    }
  }
  
  return results;
}

function generateMacroSignals(data: Record<string, any>): any {
  const signals: any[] = [];
  let overallBias = 0;
  
  // Fed Funds Rate analysis
  if (data.fed_funds_rate) {
    const rate = data.fed_funds_rate;
    if (rate.trend === 'falling') {
      signals.push({
        indicator: 'Federal Funds Rate',
        signal: 'bullish',
        strength: 0.7,
        reason: `Fed cutting rates (${rate.latestValue.toFixed(2)}% → ${rate.change.toFixed(2)}% change)`,
      });
      overallBias += 0.7;
    } else if (rate.trend === 'rising') {
      signals.push({
        indicator: 'Federal Funds Rate',
        signal: 'bearish',
        strength: 0.7,
        reason: `Fed raising rates (${rate.latestValue.toFixed(2)}%)`,
      });
      overallBias -= 0.7;
    }
  }
  
  // M2 Money Supply analysis
  if (data.m2_money_supply) {
    const m2 = data.m2_money_supply;
    if (m2.monthChangePercent > 0.5) {
      signals.push({
        indicator: 'M2 Money Supply',
        signal: 'bullish',
        strength: 0.6,
        reason: `Money supply expanding (+${m2.monthChangePercent.toFixed(2)}% MoM)`,
      });
      overallBias += 0.6;
    } else if (m2.monthChangePercent < -0.2) {
      signals.push({
        indicator: 'M2 Money Supply',
        signal: 'bearish',
        strength: 0.5,
        reason: `Money supply contracting (${m2.monthChangePercent.toFixed(2)}% MoM)`,
      });
      overallBias -= 0.5;
    }
  }
  
  // Treasury yield analysis
  if (data.treasury_10y) {
    const yield10y = data.treasury_10y;
    if (yield10y.latestValue > 4.5 && yield10y.trend === 'rising') {
      signals.push({
        indicator: '10-Year Treasury',
        signal: 'bearish',
        strength: 0.5,
        reason: `High yields attracting capital from risk assets (${yield10y.latestValue.toFixed(2)}%)`,
      });
      overallBias -= 0.5;
    } else if (yield10y.trend === 'falling') {
      signals.push({
        indicator: '10-Year Treasury',
        signal: 'bullish',
        strength: 0.4,
        reason: `Falling yields supportive for risk assets`,
      });
      overallBias += 0.4;
    }
  }
  
  // Unemployment analysis
  if (data.unemployment) {
    const unemp = data.unemployment;
    if (unemp.trend === 'rising' && unemp.latestValue > 4.5) {
      signals.push({
        indicator: 'Unemployment',
        signal: 'bullish',
        strength: 0.3,
        reason: `Rising unemployment may prompt Fed easing`,
      });
      overallBias += 0.3;
    }
  }
  
  // Overall assessment
  const overallSignal = overallBias > 0.5 ? 'bullish' : overallBias < -0.5 ? 'bearish' : 'neutral';
  const confidence = Math.min(1, Math.abs(overallBias) / 2);
  
  return {
    signals,
    overall: {
      bias: overallSignal,
      score: overallBias,
      confidence,
      summary: generateMacroSummary(overallSignal, signals),
    },
    generatedAt: new Date().toISOString(),
  };
}

function generateMacroSummary(bias: string, signals: any[]): string {
  const bullishCount = signals.filter(s => s.signal === 'bullish').length;
  const bearishCount = signals.filter(s => s.signal === 'bearish').length;
  
  if (bias === 'bullish') {
    return `Macro environment is supportive for crypto with ${bullishCount} bullish indicators. Consider increasing risk exposure.`;
  } else if (bias === 'bearish') {
    return `Macro headwinds present with ${bearishCount} bearish indicators. Consider reducing risk or hedging.`;
  } else {
    return `Mixed macro signals with ${bullishCount} bullish and ${bearishCount} bearish indicators. Maintain current positioning.`;
  }
}
