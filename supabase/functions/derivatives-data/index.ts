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
}

// Simulated derivatives data - in production, fetch from Coinglass API
function generateDerivativesData(instrument: string): DerivativesData {
  const baseOI = instrument.includes('BTC') ? 15000000000 : 
                 instrument.includes('ETH') ? 8000000000 : 
                 Math.random() * 500000000 + 100000000;
  
  const fundingRate = (Math.random() - 0.5) * 0.0005; // -0.025% to +0.025%
  const longShortRatio = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  
  return {
    instrument,
    fundingRate,
    nextFundingTime: new Date(Date.now() + Math.random() * 8 * 60 * 60 * 1000).toISOString(),
    openInterest: baseOI,
    oiChange24h: (Math.random() - 0.5) * 10, // -5% to +5%
    longShortRatio,
    liquidations24hLong: Math.random() * 50000000,
    liquidations24hShort: Math.random() * 50000000,
    topTraderLongRatio: 45 + Math.random() * 10,
    topTraderShortRatio: 45 + Math.random() * 10,
  };
}

async function fetchCoinglassData(instrument: string, apiKey?: string): Promise<DerivativesData> {
  // If API key is provided, attempt real API call
  if (apiKey) {
    try {
      const symbol = instrument.replace('-USDT', '').replace('/', '');
      
      // Coinglass API endpoints
      const fundingUrl = `https://open-api.coinglass.com/public/v2/funding?symbol=${symbol}`;
      const oiUrl = `https://open-api.coinglass.com/public/v2/open_interest?symbol=${symbol}`;
      
      const headers = {
        'coinglassSecret': apiKey,
        'Content-Type': 'application/json',
      };

      const [fundingRes, oiRes] = await Promise.all([
        fetch(fundingUrl, { headers }),
        fetch(oiUrl, { headers }),
      ]);

      if (fundingRes.ok && oiRes.ok) {
        const fundingData = await fundingRes.json();
        const oiData = await oiRes.json();

        // Parse real data if available
        if (fundingData.success && oiData.success) {
          const funding = fundingData.data?.[0] || {};
          const oi = oiData.data?.[0] || {};
          
          return {
            instrument,
            fundingRate: funding.fundingRate || 0,
            nextFundingTime: funding.nextFundingTime || new Date().toISOString(),
            openInterest: oi.openInterest || 0,
            oiChange24h: oi.oiChange24h || 0,
            longShortRatio: funding.longShortRatio || 1,
            liquidations24hLong: oi.liquidations24hLong || 0,
            liquidations24hShort: oi.liquidations24hShort || 0,
            topTraderLongRatio: funding.topTraderLongRatio || 50,
            topTraderShortRatio: funding.topTraderShortRatio || 50,
          };
        }
      }
    } catch (error) {
      console.error('Coinglass API error:', error);
    }
  }
  
  // Fallback to simulated data
  return generateDerivativesData(instrument);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const coinglassApiKey = Deno.env.get('COINGLASS_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { action, instruments } = await req.json();
    
    console.log(`Derivatives data request: ${action} for ${instruments?.length || 0} instruments`);
    
    switch (action) {
      case 'fetch_derivatives': {
        const symbolList = instruments || ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
        const results: DerivativesData[] = [];
        
        for (const instrument of symbolList) {
          const data = await fetchCoinglassData(instrument, coinglassApiKey);
          results.push(data);
          
          // Store in database
          await supabase.from('derivatives_metrics').insert({
            instrument,
            venue: coinglassApiKey ? 'coinglass' : 'simulated',
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
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          data: results,
          source: coinglassApiKey ? 'coinglass' : 'simulated'
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
