import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scheduled Monitor - Runs on cron schedule for 24/7 monitoring
 * 
 * Tasks:
 * - Check open positions for risk breaches
 * - Monitor signals and generate alerts
 * - Check kill switch status
 * - Update venue health
 * - Process pending trade intents
 */

interface MonitorResult {
  task: string;
  success: boolean;
  details: Record<string, unknown>;
  duration_ms: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: MonitorResult[] = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { task } = await req.json().catch(() => ({ task: 'all' }));
    
    console.log(`[scheduled-monitor] Starting task: ${task}`);

    // Task 1: Check Kill Switch
    if (task === 'all' || task === 'kill_switch') {
      const taskStart = Date.now();
      const { data: settings } = await supabase
        .from('global_settings')
        .select('global_kill_switch, paper_trading_mode')
        .single();
      
      if (settings?.global_kill_switch) {
        // Kill switch is active - close all positions
        await supabase
          .from('alerts')
          .insert({
            title: 'Kill Switch Active',
            message: 'Global kill switch is enabled. All trading halted.',
            severity: 'critical',
            source: 'scheduled-monitor',
          });
      }
      
      results.push({
        task: 'kill_switch',
        success: true,
        details: { 
          kill_switch_active: settings?.global_kill_switch || false,
          paper_mode: settings?.paper_trading_mode || true
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 2: Position Risk Check
    if (task === 'all' || task === 'position_risk') {
      const taskStart = Date.now();
      
      // Get open positions with their books and risk limits
      const { data: positions } = await supabase
        .from('positions')
        .select(`
          *,
          books!inner(
            id, name, capital_allocated, max_drawdown_limit,
            risk_limits(max_daily_loss, max_leverage, max_concentration)
          )
        `)
        .eq('is_open', true);
      
      const riskBreaches: Array<{book_id: string; breach_type: string; current_value: number; limit_value: number; description: string}> = [];
      
      for (const position of positions || []) {
        const book = position.books;
        const riskLimits = book?.risk_limits?.[0];
        
        if (!riskLimits) continue;
        
        // Check drawdown
        const pnlPercent = (position.unrealized_pnl / book.capital_allocated) * 100;
        if (pnlPercent < -riskLimits.max_daily_loss) {
          riskBreaches.push({
            book_id: book.id,
            breach_type: 'daily_loss',
            current_value: Math.abs(pnlPercent),
            limit_value: riskLimits.max_daily_loss,
            description: `Position ${position.instrument} exceeds daily loss limit`,
          });
        }
        
        // Check concentration
        const positionValue = position.size * position.mark_price;
        const concentration = (positionValue / book.capital_allocated) * 100;
        if (concentration > riskLimits.max_concentration) {
          riskBreaches.push({
            book_id: book.id,
            breach_type: 'concentration',
            current_value: concentration,
            limit_value: riskLimits.max_concentration,
            description: `Position ${position.instrument} exceeds concentration limit`,
          });
        }
      }
      
      // Insert risk breaches
      if (riskBreaches.length > 0) {
        await supabase.from('risk_breaches').insert(
          riskBreaches.map(breach => ({
            ...breach,
            severity: 'warning' as const,
          }))
        );
        
        // Create alert
        await supabase.from('alerts').insert({
          title: 'Risk Breaches Detected',
          message: `${riskBreaches.length} risk limit violations detected across positions`,
          severity: 'warning',
          source: 'scheduled-monitor',
          metadata: { breaches: riskBreaches },
        });
      }
      
      results.push({
        task: 'position_risk',
        success: true,
        details: {
          positions_checked: positions?.length || 0,
          breaches_found: riskBreaches.length,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 3: Signal Processing
    if (task === 'all' || task === 'signals') {
      const taskStart = Date.now();
      
      // Get unexpired signals
      const { data: signals } = await supabase
        .from('intelligence_signals')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      // Group by instrument and find consensus
      const signalsByInstrument: Record<string, Array<{ direction: string; confidence: number | null }>> = {};
      for (const signal of signals || []) {
        if (!signalsByInstrument[signal.instrument]) {
          signalsByInstrument[signal.instrument] = [];
        }
        signalsByInstrument[signal.instrument]!.push(signal);
      }
      
      // Check for strong consensus signals
      const strongSignals: string[] = [];
      for (const [instrument, instrumentSignals] of Object.entries(signalsByInstrument)) {
        if (!instrumentSignals) continue;
        const bullish = instrumentSignals.filter(s => s.direction === 'bullish').length;
        const bearish = instrumentSignals.filter(s => s.direction === 'bearish').length;
        const total = instrumentSignals.length;
        
        if (total >= 3) {
          const bullishRatio = bullish / total;
          const bearishRatio = bearish / total;
          
          if (bullishRatio >= 0.7) {
            strongSignals.push(`${instrument}: Strong bullish consensus (${Math.round(bullishRatio * 100)}%)`);
          } else if (bearishRatio >= 0.7) {
            strongSignals.push(`${instrument}: Strong bearish consensus (${Math.round(bearishRatio * 100)}%)`);
          }
        }
      }
      
      if (strongSignals.length > 0) {
        await supabase.from('alerts').insert({
          title: 'Strong Signal Consensus',
          message: strongSignals.join('; '),
          severity: 'info',
          source: 'scheduled-monitor',
        });
      }
      
      results.push({
        task: 'signals',
        success: true,
        details: {
          active_signals: signals?.length || 0,
          instruments_analyzed: Object.keys(signalsByInstrument).length,
          strong_consensus: strongSignals.length,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 4: Venue Health Check
    if (task === 'all' || task === 'venue_health') {
      const taskStart = Date.now();
      
      const { data: venues } = await supabase
        .from('venues')
        .select('*')
        .eq('is_enabled', true);
      
      const degradedVenues: string[] = [];
      
      for (const venue of venues || []) {
        // Check if venue hasn't had a heartbeat in 5 minutes
        const lastHeartbeat = new Date(venue.last_heartbeat);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (lastHeartbeat < fiveMinutesAgo && venue.status === 'healthy') {
          // Mark as degraded
          await supabase
            .from('venues')
            .update({ status: 'degraded' })
            .eq('id', venue.id);
          
          degradedVenues.push(venue.name);
        }
      }
      
      if (degradedVenues.length > 0) {
        await supabase.from('alerts').insert({
          title: 'Venue Connectivity Issues',
          message: `Venues showing degraded status: ${degradedVenues.join(', ')}`,
          severity: 'warning',
          source: 'scheduled-monitor',
        });
      }
      
      results.push({
        task: 'venue_health',
        success: true,
        details: {
          venues_checked: venues?.length || 0,
          degraded: degradedVenues.length,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 5: Process Pending Trade Intents
    if (task === 'all' || task === 'trade_intents') {
      const taskStart = Date.now();
      
      const { data: pendingIntents } = await supabase
        .from('trade_intents')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);
      
      let processedCount = 0;
      
      for (const intent of pendingIntents || []) {
        // Check if intent is still valid (not expired based on horizon)
        const createdAt = new Date(intent.created_at);
        const expiryTime = new Date(createdAt.getTime() + intent.horizon_minutes * 60 * 1000);
        
        if (new Date() > expiryTime) {
          // Expire the intent
          await supabase
            .from('trade_intents')
            .update({ 
              status: 'expired',
              processed_at: new Date().toISOString(),
            })
            .eq('id', intent.id);
          processedCount++;
        }
        // Note: Actual order execution would happen via Python backend or manual approval
      }
      
      results.push({
        task: 'trade_intents',
        success: true,
        details: {
          pending_intents: pendingIntents?.length || 0,
          expired: processedCount,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 6: Agent Heartbeat Check
    if (task === 'all' || task === 'agent_health') {
      const taskStart = Date.now();
      
      const { data: agents } = await supabase
        .from('agents')
        .select('*');
      
      const offlineAgents: string[] = [];
      
      for (const agent of agents || []) {
        const lastHeartbeat = new Date(agent.last_heartbeat);
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        if (lastHeartbeat < twoMinutesAgo && agent.status === 'running') {
          await supabase
            .from('agents')
            .update({ status: 'stopped', error_message: 'Heartbeat timeout' })
            .eq('id', agent.id);
          
          offlineAgents.push(agent.name);
        }
      }
      
      if (offlineAgents.length > 0) {
        await supabase.from('alerts').insert({
          title: 'Agent Offline',
          message: `Agents stopped responding: ${offlineAgents.join(', ')}`,
          severity: 'critical',
          source: 'scheduled-monitor',
        });
      }
      
      results.push({
        task: 'agent_health',
        success: true,
        details: {
          agents_checked: agents?.length || 0,
          offline: offlineAgents.length,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[scheduled-monitor] Completed in ${totalDuration}ms`);

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      total_duration_ms: totalDuration,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[scheduled-monitor] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
