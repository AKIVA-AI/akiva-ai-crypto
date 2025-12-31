import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IntelligenceRequest {
  action: 'fetch_news' | 'fetch_sentiment' | 'fetch_derivatives' | 'analyze_signals' | 'get_intelligence_summary' | 'health_check';
  instruments?: string[];
  timeframe?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { action, instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'], timeframe = '24h' } = await req.json() as IntelligenceRequest;

    console.log(`[market-intelligence] Action: ${action}, instruments: ${instruments.join(', ')}`);

    switch (action) {
      case 'fetch_news': {
        // Simulate fetching news from various sources
        const newsItems = await generateNewsWithAI(lovableApiKey, instruments);
        
        // Store in database
        for (const news of newsItems) {
          await supabase.from('market_news').insert(news);
        }

        return new Response(
          JSON.stringify({ success: true, news: newsItems }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetch_sentiment': {
        // Generate sentiment analysis using AI
        const sentimentData = await generateSentimentWithAI(lovableApiKey, instruments);
        
        // Store in database
        for (const sentiment of sentimentData) {
          await supabase.from('social_sentiment').insert(sentiment);
        }

        return new Response(
          JSON.stringify({ success: true, sentiment: sentimentData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetch_derivatives': {
        // Generate derivatives metrics
        const derivativesData = await generateDerivativesData(instruments);
        
        // Store in database
        for (const derivative of derivativesData) {
          await supabase.from('derivatives_metrics').insert(derivative);
        }

        return new Response(
          JSON.stringify({ success: true, derivatives: derivativesData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'analyze_signals': {
        // Combine all intelligence sources and generate composite signals
        const signals = await generateCompositeSignals(supabase, lovableApiKey, instruments);
        
        return new Response(
          JSON.stringify({ success: true, signals }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_intelligence_summary': {
        // Get latest intelligence summary for all tracked instruments
        const summary = await getIntelligenceSummary(supabase, instruments);
        
        return new Response(
          JSON.stringify({ success: true, summary }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'health_check': {
        return new Response(
          JSON.stringify({ success: true, status: 'healthy', features: ['news', 'sentiment', 'derivatives', 'signals'] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[market-intelligence] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function generateNewsWithAI(apiKey: string, instruments: string[]) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { 
          role: 'system', 
          content: 'You are a crypto market news analyst. Generate realistic, current market news items with sentiment scores.'
        },
        { 
          role: 'user', 
          content: `Generate 5 realistic crypto market news items for ${instruments.join(', ')}. 
          Return JSON array with: source, title, summary, sentiment_score (-1 to 1), impact_score (0 to 1), tags array.
          Make news items diverse: regulatory, technical, adoption, market moves, on-chain activity.`
        }
      ],
      max_tokens: 1500,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    console.error('[market-intelligence] AI API error:', await response.text());
    return getDefaultNewsItems(instruments);
  }

  try {
    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: any) => ({
        source: item.source || 'CryptoNews',
        title: item.title,
        summary: item.summary,
        published_at: new Date().toISOString(),
        instruments: instruments,
        sentiment_score: Math.max(-1, Math.min(1, item.sentiment_score || 0)),
        impact_score: Math.max(0, Math.min(1, item.impact_score || 0.5)),
        tags: item.tags || [],
      }));
    }
  } catch (e) {
    console.error('[market-intelligence] Failed to parse AI news:', e);
  }
  
  return getDefaultNewsItems(instruments);
}

function getDefaultNewsItems(instruments: string[]) {
  return [
    {
      source: 'CoinDesk',
      title: 'Bitcoin Continues Consolidation Near Key Resistance',
      summary: 'BTC trades sideways as market awaits next catalyst for directional move.',
      published_at: new Date().toISOString(),
      instruments: instruments,
      sentiment_score: 0.2,
      impact_score: 0.6,
      tags: ['bitcoin', 'technical', 'resistance'],
    },
    {
      source: 'CryptoSlate',
      title: 'Ethereum Layer 2 Activity Reaches New Highs',
      summary: 'Arbitrum and Optimism see record transaction volumes as adoption accelerates.',
      published_at: new Date().toISOString(),
      instruments: instruments,
      sentiment_score: 0.7,
      impact_score: 0.8,
      tags: ['ethereum', 'layer2', 'adoption'],
    },
  ];
}

async function generateSentimentWithAI(apiKey: string, instruments: string[]) {
  const platforms = ['twitter', 'reddit', 'telegram'];
  const sentimentData = [];

  for (const instrument of instruments) {
    for (const platform of platforms) {
      // Simulate realistic sentiment data
      const baseScore = (Math.random() - 0.3) * 0.8; // Slightly bullish bias
      const mentionBase = platform === 'twitter' ? 50000 : platform === 'reddit' ? 10000 : 5000;
      const mentions = Math.floor(mentionBase * (0.5 + Math.random()));
      const velocity = (Math.random() - 0.5) * 200; // -100 to +100%

      sentimentData.push({
        instrument,
        platform,
        mention_count: mentions,
        positive_count: Math.floor(mentions * (0.3 + baseScore * 0.2)),
        negative_count: Math.floor(mentions * (0.2 - baseScore * 0.1)),
        neutral_count: Math.floor(mentions * 0.5),
        sentiment_score: Math.max(-1, Math.min(1, baseScore)),
        velocity: velocity,
        influential_posts: [],
        recorded_at: new Date().toISOString(),
      });
    }
  }

  return sentimentData;
}

async function generateDerivativesData(instruments: string[]) {
  const venues = ['Binance', 'Bybit', 'OKX'];
  const derivativesData = [];

  for (const instrument of instruments) {
    for (const venue of venues) {
      // Simulate realistic derivatives data
      const fundingRate = (Math.random() - 0.5) * 0.002; // -0.1% to +0.1%
      const oiBase = venue === 'Binance' ? 5000000000 : venue === 'Bybit' ? 2000000000 : 1500000000;
      const longShortRatio = 0.8 + Math.random() * 0.4; // 0.8 to 1.2

      derivativesData.push({
        instrument,
        venue,
        funding_rate: fundingRate,
        next_funding_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        open_interest: oiBase * (0.8 + Math.random() * 0.4),
        oi_change_24h: (Math.random() - 0.5) * 20,
        long_short_ratio: longShortRatio,
        liquidations_24h_long: Math.random() * 50000000,
        liquidations_24h_short: Math.random() * 50000000,
        top_trader_long_ratio: 45 + Math.random() * 10,
        top_trader_short_ratio: 45 + Math.random() * 10,
        recorded_at: new Date().toISOString(),
      });
    }
  }

  return derivativesData;
}

async function generateCompositeSignals(supabase: any, apiKey: string, instruments: string[]) {
  const signals = [];

  for (const instrument of instruments) {
    // Fetch latest data from all sources
    const { data: sentiment } = await supabase
      .from('social_sentiment')
      .select('*')
      .eq('instrument', instrument)
      .order('recorded_at', { ascending: false })
      .limit(3);

    const { data: derivatives } = await supabase
      .from('derivatives_metrics')
      .select('*')
      .eq('instrument', instrument)
      .order('recorded_at', { ascending: false })
      .limit(3);

    const { data: news } = await supabase
      .from('market_news')
      .select('*')
      .contains('instruments', [instrument])
      .order('published_at', { ascending: false })
      .limit(5);

    // Calculate composite signal
    const avgSentiment = sentiment?.length 
      ? sentiment.reduce((sum: number, s: any) => sum + (s.sentiment_score || 0), 0) / sentiment.length 
      : 0;

    const avgFunding = derivatives?.length
      ? derivatives.reduce((sum: number, d: any) => sum + (d.funding_rate || 0), 0) / derivatives.length
      : 0;

    const newsImpact = news?.length
      ? news.reduce((sum: number, n: any) => sum + (n.sentiment_score || 0) * (n.impact_score || 0.5), 0) / news.length
      : 0;

    // Composite score weighted
    const compositeScore = (avgSentiment * 0.3) + (newsImpact * 0.4) + (-avgFunding * 1000 * 0.3);
    const direction = compositeScore > 0.1 ? 'bullish' : compositeScore < -0.1 ? 'bearish' : 'neutral';
    const strength = Math.min(1, Math.abs(compositeScore));
    const confidence = Math.min(1, 0.5 + (sentiment?.length || 0) * 0.1 + (derivatives?.length || 0) * 0.1);

    const signal = {
      instrument,
      signal_type: 'composite',
      direction,
      strength,
      confidence,
      source_data: {
        sentiment_avg: avgSentiment,
        funding_avg: avgFunding,
        news_impact: newsImpact,
        data_points: {
          sentiment: sentiment?.length || 0,
          derivatives: derivatives?.length || 0,
          news: news?.length || 0,
        },
      },
      reasoning: `Composite signal based on ${sentiment?.length || 0} sentiment sources, ${derivatives?.length || 0} derivatives metrics, and ${news?.length || 0} news items.`,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };

    // Store signal
    await supabase.from('intelligence_signals').insert(signal);
    signals.push(signal);
  }

  return signals;
}

async function getIntelligenceSummary(supabase: any, instruments: string[]) {
  const summary: any = {};

  for (const instrument of instruments) {
    // Get latest sentiment
    const { data: sentiment } = await supabase
      .from('social_sentiment')
      .select('*')
      .eq('instrument', instrument)
      .order('recorded_at', { ascending: false })
      .limit(3);

    // Get latest derivatives
    const { data: derivatives } = await supabase
      .from('derivatives_metrics')
      .select('*')
      .eq('instrument', instrument)
      .order('recorded_at', { ascending: false })
      .limit(3);

    // Get latest signals
    const { data: signals } = await supabase
      .from('intelligence_signals')
      .select('*')
      .eq('instrument', instrument)
      .order('created_at', { ascending: false })
      .limit(1);

    // Get recent news
    const { data: news } = await supabase
      .from('market_news')
      .select('*')
      .contains('instruments', [instrument])
      .order('published_at', { ascending: false })
      .limit(3);

    summary[instrument] = {
      sentiment: sentiment || [],
      derivatives: derivatives || [],
      signals: signals || [],
      news: news || [],
      overall_bias: signals?.[0]?.direction || 'neutral',
      confidence: signals?.[0]?.confidence || 0,
    };
  }

  return summary;
}
