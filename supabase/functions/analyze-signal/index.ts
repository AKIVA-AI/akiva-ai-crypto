import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  signalId?: string;
  strategyId?: string;
  instrument?: string;
  analysisType: 'signal_explanation' | 'parameter_optimization' | 'market_context';
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
    const { signalId, strategyId, instrument, analysisType } = await req.json() as AnalysisRequest;

    console.log(`[analyze-signal] Analysis type: ${analysisType}, signal: ${signalId}, strategy: ${strategyId}`);

    // Fetch relevant data based on analysis type
    let contextData: any = {};

    if (signalId) {
      const { data: signal } = await supabase
        .from('strategy_signals')
        .select('*, strategies(name, config_metadata, timeframe, asset_class)')
        .eq('id', signalId)
        .single();
      contextData.signal = signal;
    }

    if (strategyId) {
      const { data: strategy } = await supabase
        .from('strategies')
        .select('*')
        .eq('id', strategyId)
        .single();
      contextData.strategy = strategy;

      // Get recent signals for this strategy
      const { data: recentSignals } = await supabase
        .from('strategy_signals')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(10);
      contextData.recentSignals = recentSignals;

      // Get recent intents
      const { data: recentIntents } = await supabase
        .from('trade_intents')
        .select('*')
        .eq('strategy_id', strategyId)
        .order('created_at', { ascending: false })
        .limit(5);
      contextData.recentIntents = recentIntents;
    }

    if (instrument) {
      const { data: marketData } = await supabase
        .from('market_snapshots')
        .select('*')
        .eq('instrument', instrument)
        .order('recorded_at', { ascending: false })
        .limit(20);
      contextData.marketData = marketData;
    }

    // Build prompt based on analysis type
    let systemPrompt = `You are an expert quantitative trading analyst. Analyze trading signals, strategies, and market data to provide actionable insights. Be concise but thorough. Format responses with clear sections using markdown.`;
    
    let userPrompt = '';

    switch (analysisType) {
      case 'signal_explanation':
        userPrompt = `Explain this trading signal and its implications:

Signal Data:
${JSON.stringify(contextData.signal, null, 2)}

Provide:
1. **Signal Summary**: What this signal indicates
2. **Technical Basis**: Why the strategy generated this signal
3. **Confidence Assessment**: Evaluate the signal strength (${contextData.signal?.strength || 'N/A'})
4. **Risk Considerations**: Key risks to monitor
5. **Suggested Actions**: Recommended position sizing and entry approach`;
        break;

      case 'parameter_optimization':
        userPrompt = `Analyze this strategy's configuration and suggest optimizations:

Strategy Configuration:
${JSON.stringify(contextData.strategy, null, 2)}

Recent Signal Performance:
${JSON.stringify(contextData.recentSignals?.slice(0, 5), null, 2)}

Recent Trade Intents:
${JSON.stringify(contextData.recentIntents, null, 2)}

Provide:
1. **Performance Assessment**: Current strategy behavior
2. **Parameter Review**: Evaluate current configuration
3. **Optimization Suggestions**: Specific parameter adjustments with rationale
4. **Risk Tuning**: Suggestions for risk parameters
5. **Timeframe Considerations**: Any temporal adjustments recommended`;
        break;

      case 'market_context':
        userPrompt = `Provide market context analysis for ${instrument}:

Recent Market Data:
${JSON.stringify(contextData.marketData?.slice(0, 10), null, 2)}

${contextData.signal ? `Active Signal: ${JSON.stringify(contextData.signal, null, 2)}` : ''}

Provide:
1. **Market Regime**: Current market conditions (trending/ranging/volatile)
2. **Key Levels**: Important support/resistance zones
3. **Volatility Assessment**: Current volatility context
4. **Trading Outlook**: Short-term directional bias
5. **Risk Factors**: Key market risks to monitor`;
        break;
    }

    console.log(`[analyze-signal] Calling Lovable AI for ${analysisType}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[analyze-signal] AI API error: ${errorText}`);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices?.[0]?.message?.content || 'No analysis generated';

    console.log(`[analyze-signal] Analysis complete, ${analysis.length} chars`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis,
        analysisType,
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[analyze-signal] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});