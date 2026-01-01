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
 * - Update venue health with REAL API checks
 * - Process pending trade intents
 * - Check exchange API connectivity
 */

interface MonitorResult {
  task: string;
  success: boolean;
  details: Record<string, unknown>;
  duration_ms: number;
}

interface ExchangeHealthResult {
  exchange: string;
  online: boolean;
  latency_ms: number;
  error?: string;
}

// Check Coinbase API health
async function checkCoinbaseHealth(): Promise<ExchangeHealthResult> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.coinbase.com/v2/time', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      return { exchange: 'coinbase', online: true, latency_ms: latency };
    }
    return { exchange: 'coinbase', online: false, latency_ms: latency, error: `HTTP ${response.status}` };
  } catch (error) {
    return { exchange: 'coinbase', online: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Check Kraken API health
async function checkKrakenHealth(): Promise<ExchangeHealthResult> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.kraken.com/0/public/Time', {
      method: 'GET',
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      const data = await response.json();
      if (data.error && data.error.length > 0) {
        return { exchange: 'kraken', online: false, latency_ms: latency, error: data.error.join(', ') };
      }
      return { exchange: 'kraken', online: true, latency_ms: latency };
    }
    return { exchange: 'kraken', online: false, latency_ms: latency, error: `HTTP ${response.status}` };
  } catch (error) {
    return { exchange: 'kraken', online: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Check Binance US API health
async function checkBinanceUSHealth(): Promise<ExchangeHealthResult> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.binance.us/api/v3/time', {
      method: 'GET',
    });
    const latency = Date.now() - start;
    
    if (response.ok) {
      return { exchange: 'binance_us', online: true, latency_ms: latency };
    }
    return { exchange: 'binance_us', online: false, latency_ms: latency, error: `HTTP ${response.status}` };
  } catch (error) {
    return { exchange: 'binance_us', online: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Check CoinGecko API health (market data)
async function checkCoinGeckoHealth(): Promise<ExchangeHealthResult> {
  const start = Date.now();
  const apiKey = Deno.env.get('COINGECKO_API_KEY');
  try {
    const url = apiKey 
      ? 'https://pro-api.coingecko.com/api/v3/ping'
      : 'https://api.coingecko.com/api/v3/ping';
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-cg-pro-api-key'] = apiKey;
    }
    
    const response = await fetch(url, { method: 'GET', headers });
    const latency = Date.now() - start;
    
    if (response.ok) {
      return { exchange: 'coingecko', online: true, latency_ms: latency };
    }
    return { exchange: 'coingecko', online: false, latency_ms: latency, error: `HTTP ${response.status}` };
  } catch (error) {
    return { exchange: 'coingecko', online: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Send Telegram alert for critical issues
async function sendTelegramAlert(title: string, message: string, severity: 'info' | 'warning' | 'critical' = 'critical') {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!botToken || !chatId) {
    console.log('[scheduled-monitor] Telegram not configured, skipping alert');
    return;
  }
  
  const severityEmojis = { info: 'ℹ️', warning: '⚠️', critical: '🔴' };
  const emoji = severityEmojis[severity];
  
  const formattedMessage = `
${emoji} *${title}*

${message}

_Sent by Scheduled Monitor_
`.trim();

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formattedMessage,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    console.log('[scheduled-monitor] Telegram alert sent');
  } catch (error) {
    console.error('[scheduled-monitor] Failed to send Telegram alert:', error);
  }
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

    // Task 2: Exchange API Health Check (NEW - checks real APIs)
    if (task === 'all' || task === 'exchange_health') {
      const taskStart = Date.now();
      
      // Check all exchanges in parallel
      const [coinbase, kraken, binanceUS, coingecko] = await Promise.all([
        checkCoinbaseHealth(),
        checkKrakenHealth(),
        checkBinanceUSHealth(),
        checkCoinGeckoHealth(),
      ]);
      
      const exchangeResults = [coinbase, kraken, binanceUS, coingecko];
      const offlineExchanges = exchangeResults.filter(e => !e.online);
      const highLatencyExchanges = exchangeResults.filter(e => e.online && e.latency_ms > 2000);
      
      // Persist to system_health table
      for (const result of exchangeResults) {
        await supabase
          .from('system_health')
          .upsert({
            component: `exchange_${result.exchange}`,
            status: result.online ? (result.latency_ms > 2000 ? 'degraded' : 'healthy') : 'unhealthy',
            details: { latency_ms: result.latency_ms },
            error_message: result.error || null,
            last_check_at: new Date().toISOString(),
          }, { onConflict: 'component' });
      }
      
      // Persist to venue_health table for historical tracking
      for (const result of exchangeResults) {
        await supabase
          .from('venue_health')
          .insert({
            venue_id: '00000000-0000-0000-0000-000000000000', // Placeholder
            status: result.online ? 'healthy' : 'degraded',
            latency_ms: result.latency_ms,
            error_rate: result.online ? 0 : 100,
            order_success_rate: result.online ? 100 : 0,
            last_error: result.error || null,
            metadata: { exchange: result.exchange },
          });
      }
      
      // Alert if any exchange is down
      if (offlineExchanges.length > 0) {
        const offlineNames = offlineExchanges.map(e => e.exchange).join(', ');
        
        await supabase.from('alerts').insert({
          title: 'Exchange Offline',
          message: `The following exchanges are offline: ${offlineNames}`,
          severity: 'critical',
          source: 'scheduled-monitor',
          metadata: { offline_exchanges: offlineExchanges },
        });
        
        // Send Telegram alert
        await sendTelegramAlert(
          '🚨 Exchange Offline',
          `The following exchanges are DOWN:\n${offlineExchanges.map(e => `• ${e.exchange}: ${e.error}`).join('\n')}\n\nCheck connectivity immediately!`,
          'critical'
        );
      }
      
      // Alert if high latency
      if (highLatencyExchanges.length > 0) {
        const highLatencyNames = highLatencyExchanges.map(e => `${e.exchange} (${e.latency_ms}ms)`).join(', ');
        
        await supabase.from('alerts').insert({
          title: 'High Exchange Latency',
          message: `High latency detected: ${highLatencyNames}`,
          severity: 'warning',
          source: 'scheduled-monitor',
        });
      }
      
      results.push({
        task: 'exchange_health',
        success: true,
        details: {
          exchanges_checked: exchangeResults.length,
          online: exchangeResults.filter(e => e.online).length,
          offline: offlineExchanges.length,
          high_latency: highLatencyExchanges.length,
          results: exchangeResults,
        },
        duration_ms: Date.now() - taskStart,
      });
    }

    // Task 3: Position Risk Check
    if (task === 'all' || task === 'position_risk') {
      const taskStart = Date.now();
      
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
      
      if (riskBreaches.length > 0) {
        await supabase.from('risk_breaches').insert(
          riskBreaches.map(breach => ({
            ...breach,
            severity: 'warning' as const,
          }))
        );
        
        await supabase.from('alerts').insert({
          title: 'Risk Breaches Detected',
          message: `${riskBreaches.length} risk limit violations detected across positions`,
          severity: 'warning',
          source: 'scheduled-monitor',
          metadata: { breaches: riskBreaches },
        });
        
        // Send Telegram alert for risk breaches
        await sendTelegramAlert(
          '⚠️ Risk Limit Breach',
          `${riskBreaches.length} risk violations detected:\n${riskBreaches.slice(0, 3).map(b => `• ${b.description}`).join('\n')}`,
          'warning'
        );
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

    // Task 4: Signal Processing
    if (task === 'all' || task === 'signals') {
      const taskStart = Date.now();
      
      const { data: signals } = await supabase
        .from('intelligence_signals')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      const signalsByInstrument: Record<string, Array<{ direction: string; confidence: number | null }>> = {};
      for (const signal of signals || []) {
        if (!signalsByInstrument[signal.instrument]) {
          signalsByInstrument[signal.instrument] = [];
        }
        signalsByInstrument[signal.instrument]!.push(signal);
      }
      
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

    // Task 5: Venue Health Check (DB-based)
    if (task === 'all' || task === 'venue_health') {
      const taskStart = Date.now();
      
      const { data: venues } = await supabase
        .from('venues')
        .select('*')
        .eq('is_enabled', true);
      
      const degradedVenues: string[] = [];
      
      for (const venue of venues || []) {
        const lastHeartbeat = new Date(venue.last_heartbeat);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (lastHeartbeat < fiveMinutesAgo && venue.status === 'healthy') {
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

    // Task 6: Process Pending Trade Intents
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
        const createdAt = new Date(intent.created_at);
        const expiryTime = new Date(createdAt.getTime() + intent.horizon_minutes * 60 * 1000);
        
        if (new Date() > expiryTime) {
          await supabase
            .from('trade_intents')
            .update({ 
              status: 'expired',
              processed_at: new Date().toISOString(),
            })
            .eq('id', intent.id);
          processedCount++;
        }
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

    // Task 7: Agent Heartbeat Check
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
        
        await sendTelegramAlert(
          '🤖 Agent Offline',
          `The following agents have stopped responding:\n${offlineAgents.map(a => `• ${a}`).join('\n')}`,
          'critical'
        );
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
