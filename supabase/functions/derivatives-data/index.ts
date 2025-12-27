import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DerivativesData {
  instrument: string;
  fundingRate: number;
  nextFundingTime: string;
  openInterest: number;
  oiChange24h: number;
  longShortRatio: number;
  liquidations24hLong: number;
  liquidations24hShort: number;
  topTraderLongRatio: number;
  topTraderShortRatio: number;
  source: string;
}

// Map instrument to Binance symbol format
function toBinanceSymbol(instrument: string): string {
  return instrument.replace('-', '').replace('/', '').toUpperCase();
}

// Fetch funding rate from Binance Futures API (FREE - no API key required)
async function fetchBinanceFundingRate(symbol: string): Promise<{ fundingRate: number; nextFundingTime: string } | null> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`;
    const res = await fetch(url);
    
    if (res.ok) {
      const data = await res.json();
      return {
        fundingRate: parseFloat(data.lastFundingRate) || 0,
        nextFundingTime: new Date(data.nextFundingTime).toISOString(),
      };
    }
  } catch (error) {
    console.error(`Binance funding rate error for ${symbol}:`, error);
  }
  return null;
}

// Fetch open interest from Binance Futures API (FREE - no API key required)
async function fetchBinanceOpenInterest(symbol: string): Promise<{ openInterest: number } | null> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`;
    const res = await fetch(url);
    
    if (res.ok) {
      const data = await res.json();
      return {
        openInterest: parseFloat(data.openInterest) || 0,
      };
    }
  } catch (error) {
    console.error(`Binance open interest error for ${symbol}:`, error);
  }
  return null;
}

// Fetch long/short ratio from Binance (FREE - top trader accounts)
async function fetchBinanceLongShortRatio(symbol: string): Promise<{ longShortRatio: number; topLong: number; topShort: number } | null> {
  try {
    const url = `https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`;
    const res = await fetch(url);
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        const latest = data[0];
        const longRatio = parseFloat(latest.longAccount) * 100;
        const shortRatio = parseFloat(latest.shortAccount) * 100;
        return {
          longShortRatio: parseFloat(latest.longShortRatio) || 1,
          topLong: longRatio,
          topShort: shortRatio,
        };
      }
    }
  } catch (error) {
    console.error(`Binance long/short ratio error for ${symbol}:`, error);
  }
  return null;
}

// Fetch 24h statistics for OI change calculation
async function fetchBinance24hStats(symbol: string): Promise<{ priceChange: number; volume: number } | null> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`;
    const res = await fetch(url);
    
    if (res.ok) {
      const data = await res.json();
      return {
        priceChange: parseFloat(data.priceChangePercent) || 0,
        volume: parseFloat(data.quoteVolume) || 0,
      };
    }
  } catch (error) {
    console.error(`Binance 24h stats error for ${symbol}:`, error);
  }
  return null;
}

// Generate fallback data when APIs fail
function generateFallbackData(instrument: string): DerivativesData {
  const baseOI = instrument.includes('BTC') ? 15000000000 : 
                 instrument.includes('ETH') ? 8000000000 : 
                 Math.random() * 500000000 + 100000000;
  
  const fundingRate = (Math.random() - 0.5) * 0.0005;
  const longShortRatio = 0.8 + Math.random() * 0.4;
  
  return {
    instrument,
    fundingRate,
    nextFundingTime: new Date(Date.now() + Math.random() * 8 * 60 * 60 * 1000).toISOString(),
    openInterest: baseOI,
    oiChange24h: (Math.random() - 0.5) * 10,
    longShortRatio,
    liquidations24hLong: Math.random() * 50000000,
    liquidations24hShort: Math.random() * 50000000,
    topTraderLongRatio: 45 + Math.random() * 10,
    topTraderShortRatio: 45 + Math.random() * 10,
    source: 'simulated',
  };
}

// Fetch real derivatives data from Binance (FREE APIs)
async function fetchBinanceDerivatives(instrument: string): Promise<DerivativesData> {
  const symbol = toBinanceSymbol(instrument);
  
  console.log(`Fetching Binance derivatives for ${symbol}...`);
  
  try {
    // Fetch all data in parallel
    const [fundingData, oiData, lsData, statsData] = await Promise.all([
      fetchBinanceFundingRate(symbol),
      fetchBinanceOpenInterest(symbol),
      fetchBinanceLongShortRatio(symbol),
      fetchBinance24hStats(symbol),
    ]);
    
    // Check if we got at least funding rate (most important)
    if (fundingData) {
      console.log(`Successfully fetched Binance data for ${symbol}`);
      
      return {
        instrument,
        fundingRate: fundingData.fundingRate,
        nextFundingTime: fundingData.nextFundingTime,
        openInterest: oiData?.openInterest || 0,
        oiChange24h: statsData?.priceChange || 0, // Use price change as proxy
        longShortRatio: lsData?.longShortRatio || 1,
        liquidations24hLong: 0, // Binance doesn't provide this in free API
        liquidations24hShort: 0,
        topTraderLongRatio: lsData?.topLong || 50,
        topTraderShortRatio: lsData?.topShort || 50,
        source: 'binance',
      };
    }
  } catch (error) {
    console.error(`Error fetching Binance data for ${symbol}:`, error);
  }
  
  // Fallback to simulated if Binance fails
  console.log(`Falling back to simulated data for ${instrument}`);
  return generateFallbackData(instrument);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { action, instruments } = await req.json();
    
    console.log(`Derivatives data request: ${action} for ${instruments?.length || 0} instruments`);
    
    switch (action) {
      case 'fetch_derivatives': {
        const symbolList = instruments || ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
        const results: DerivativesData[] = [];
        
        // Fetch all instruments in parallel for speed
        const dataPromises = symbolList.map((instrument: string) => fetchBinanceDerivatives(instrument));
        const allData = await Promise.all(dataPromises);
        
        for (const data of allData) {
          results.push(data);
          
          // Store in database
          const { error } = await supabase.from('derivatives_metrics').insert({
            instrument: data.instrument,
            venue: data.source,
            funding_rate: data.fundingRate,
            next_funding_time: data.nextFundingTime,
            open_interest: data.openInterest,
            oi_change_24h: data.oiChange24h,
            long_short_ratio: data.longShortRatio,
            liquidations_24h_long: data.liquidations24hLong,
            liquidations_24h_short: data.liquidations24hShort,
            top_trader_long_ratio: data.topTraderLongRatio,
            top_trader_short_ratio: data.topTraderShortRatio,
          });
          
          if (error) {
            console.error(`Error storing data for ${data.instrument}:`, error);
          }
        }
        
        const sources = [...new Set(results.map(r => r.source))];
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: results,
          source: sources.join(', '),
          message: `Fetched ${results.length} instruments from ${sources.join(', ')}`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'get_latest': {
        const { data, error } = await supabase
          .from('derivatives_metrics')
          .select('*')
          .order('recorded_at', { ascending: false })
          .limit(instruments?.length || 10);
        
        if (error) throw error;
        
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      case 'get_funding_history': {
        const instrument = instruments?.[0] || 'BTC-USDT';
        
        const { data, error } = await supabase
          .from('derivatives_metrics')
          .select('instrument, funding_rate, recorded_at')
          .eq('instrument', instrument)
          .order('recorded_at', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Derivatives data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
