import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CopilotRequest {
  message: string;
  context?: {
    instrument?: string;
    positions?: any[];
    portfolio_value?: number;
  };
  conversation_history?: { role: string; content: string }[];
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
    const body = await req.json().catch(() => ({}));
    const { message, context, conversation_history = [] } = body as CopilotRequest;

    // Handle health check
    if (body.action === 'health_check') {
      return new Response(
        JSON.stringify({ success: true, status: 'healthy' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[trading-copilot] Query: ${message.substring(0, 100)}...`);

    // Fetch latest market intelligence
    const { data: signals } = await supabase
      .from('intelligence_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('is_open', true)
      .limit(20);

    const { data: recentNews } = await supabase
      .from('market_news')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(5);

    const { data: derivativesData } = await supabase
      .from('derivatives_metrics')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(10);

    // Build system prompt with real data
    const systemPrompt = buildSystemPrompt({
      signals: signals || [],
      positions: positions || [],
      news: recentNews || [],
      derivatives: derivativesData || [],
      userContext: context,
    });

    // Call Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversation_history.slice(-10),
          { role: 'user', content: message }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[trading-copilot] AI error:', errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('AI service error');
    }

    const aiData = await response.json();
    const aiMessage = aiData.choices?.[0]?.message?.content || 'I apologize, I was unable to generate a response. Please try again.';

    // Parse for actionable insights
    const insights = extractInsights(aiMessage, signals || []);

    return new Response(
      JSON.stringify({
        success: true,
        message: aiMessage,
        insights,
        context_used: {
          signals_count: signals?.length || 0,
          positions_count: positions?.length || 0,
          news_count: recentNews?.length || 0,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[trading-copilot] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function buildSystemPrompt(data: {
  signals: any[];
  positions: any[];
  news: any[];
  derivatives: any[];
  userContext?: any;
}) {
  const { signals, positions, news, derivatives, userContext } = data;

  // Format signals
  const signalsSummary = signals.length > 0
    ? signals.map(s => `${s.instrument}: ${s.direction} (strength: ${(s.strength * 100).toFixed(0)}%, confidence: ${(s.confidence * 100).toFixed(0)}%)`).join('; ')
    : 'No active signals';

  // Format positions
  const positionsSummary = positions.length > 0
    ? positions.map(p => `${p.instrument}: ${p.side} ${p.size} @ $${p.entry_price} (PnL: $${p.unrealized_pnl?.toFixed(2) || '0'})`).join('; ')
    : 'No open positions';

  // Format news
  const newsSummary = news.length > 0
    ? news.map(n => `[${n.source}] ${n.title} (sentiment: ${(n.sentiment_score * 100).toFixed(0)}%)`).join('; ')
    : 'No recent news';

  // Format derivatives
  const derivativesSummary = derivatives.length > 0
    ? derivatives.slice(0, 3).map(d => `${d.instrument}@${d.venue}: funding ${(d.funding_rate * 100).toFixed(4)}%, L/S ratio ${d.long_short_ratio?.toFixed(2) || 'N/A'}`).join('; ')
    : 'No derivatives data';

  return `You are an expert AI trading copilot for a sophisticated crypto trading platform. You provide actionable insights, market analysis, and trading recommendations based on real-time data.

CURRENT MARKET INTELLIGENCE:
- Active Signals: ${signalsSummary}
- Open Positions: ${positionsSummary}
- Recent News: ${newsSummary}
- Derivatives: ${derivativesSummary}

${userContext?.instrument ? `User is focused on: ${userContext.instrument}` : ''}
${userContext?.portfolio_value ? `Portfolio value: $${userContext.portfolio_value.toLocaleString()}` : ''}

GUIDELINES:
1. Be concise but thorough. Traders value precision.
2. Always cite data when making recommendations (e.g., "Based on the 72% bullish signal strength...")
3. Highlight risks alongside opportunities
4. Use proper trading terminology
5. When suggesting trades, include entry, stop-loss, and take-profit levels
6. Consider position sizing and risk management
7. Reference funding rates and L/S ratios for perpetual futures analysis
8. If asked about specific coins, use the available signals and news data

FORMATTING:
- Use bullet points for clarity
- Bold key numbers and recommendations
- Include confidence levels when appropriate
- End with a clear action or recommendation`;
}

function extractInsights(message: string, signals: any[]) {
  const insights: any = {
    mentioned_instruments: [],
    suggested_actions: [],
    risk_level: 'moderate',
    confidence: 0.7,
  };

  // Extract mentioned instruments
  const instruments = ['BTC', 'ETH', 'SOL', 'ARB', 'OP', 'AVAX', 'MATIC', 'LINK'];
  for (const instrument of instruments) {
    if (message.toLowerCase().includes(instrument.toLowerCase())) {
      insights.mentioned_instruments.push(instrument);
    }
  }

  // Detect action suggestions
  const buyPatterns = /\b(buy|long|accumulate|enter)\b/gi;
  const sellPatterns = /\b(sell|short|exit|reduce)\b/gi;
  const holdPatterns = /\b(hold|wait|observe)\b/gi;

  if (buyPatterns.test(message)) insights.suggested_actions.push('BUY');
  if (sellPatterns.test(message)) insights.suggested_actions.push('SELL');
  if (holdPatterns.test(message)) insights.suggested_actions.push('HOLD');

  // Assess risk level from keywords
  if (/\b(high risk|dangerous|volatile|caution)\b/gi.test(message)) {
    insights.risk_level = 'high';
  } else if (/\b(low risk|safe|conservative)\b/gi.test(message)) {
    insights.risk_level = 'low';
  }

  // Match with signals
  if (signals.length > 0) {
    const avgConfidence = signals.reduce((sum, s) => sum + (s.confidence || 0), 0) / signals.length;
    insights.confidence = avgConfidence;
  }

  return insights;
}
