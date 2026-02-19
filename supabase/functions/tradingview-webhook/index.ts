import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecureCorsHeaders } from "../_shared/security.ts";

// Input validation constants
const MAX_TICKER_LENGTH = 50;
const MAX_STRING_LENGTH = 500;
const MAX_PRICE = 10000000; // $10 million max price
const MIN_POSITION_SIZE_PCT = 0.1;
const MAX_POSITION_SIZE_PCT = 10;
const MAX_STOP_LOSS_DEVIATION = 0.5; // 50% max deviation from price
const MAX_TAKE_PROFIT_DEVIATION = 1.0; // 100% max deviation from price

// Simple in-memory rate limiter for webhook endpoint
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_REQUESTS = 30; // 30 requests per minute per secret
const RATE_LIMIT_WINDOW_MS = 60000;

interface TradingViewAlert {
  // Standard TradingView fields
  ticker?: string;
  exchange?: string;
  time?: string;
  interval?: string;
  
  // Custom fields from alert message
  instrument?: string;
  action?: 'buy' | 'sell' | 'close' | 'neutral' | 'long' | 'short';
  price?: number;
  strategy?: string;
  
  // Signal details
  signal_type?: string;
  strength?: number;
  confidence?: number;
  
  // Risk parameters
  stop_loss?: number;
  take_profit?: number;
  position_size_pct?: number;
  
  // Metadata
  comment?: string;
  indicator?: string;
  timeframe?: string;
  
  // Security
  secret?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: TradingViewAlert;
}

/**
 * Sanitize a string value by trimming and limiting length
 */
function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  // Remove control characters and trim
  return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

/**
 * Validate and sanitize numeric value within bounds
 */
function sanitizeNumber(value: unknown, min: number, max: number, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return defaultValue;
  return Math.min(max, Math.max(min, num));
}

/**
 * Check if rate limit is exceeded for a given key
 */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  
  entry.count++;
  return entry.count > RATE_LIMIT_REQUESTS;
}

/**
 * Comprehensive input validation for TradingView alerts
 */
function validateAlert(alert: TradingViewAlert): ValidationResult {
  const errors: string[] = [];
  const sanitized: TradingViewAlert = {};

  // Validate and sanitize ticker/instrument
  const ticker = sanitizeString(alert.ticker, MAX_TICKER_LENGTH);
  const instrument = sanitizeString(alert.instrument, MAX_TICKER_LENGTH);
  sanitized.ticker = ticker || undefined;
  sanitized.instrument = instrument || undefined;
  
  if (!ticker && !instrument) {
    errors.push('No ticker or instrument provided');
  }

  // Validate action
  const validActions = ['buy', 'sell', 'close', 'neutral', 'long', 'short'];
  if (alert.action && !validActions.includes(String(alert.action).toLowerCase())) {
    errors.push(`Invalid action: ${alert.action}. Must be one of: ${validActions.join(', ')}`);
  } else {
    sanitized.action = alert.action ? String(alert.action).toLowerCase() as TradingViewAlert['action'] : undefined;
  }

  // Validate price (must be positive and reasonable)
  if (alert.price !== undefined) {
    const price = sanitizeNumber(alert.price, 0.0001, MAX_PRICE, 0);
    if (price <= 0) {
      errors.push('Price must be a positive number');
    } else {
      sanitized.price = price;
    }
  }

  // Validate strength and confidence (0-1 range)
  sanitized.strength = sanitizeNumber(alert.strength, 0, 1, 0.7);
  sanitized.confidence = sanitizeNumber(alert.confidence, 0, 1, 0.65);

  // Validate stop_loss relative to price
  if (alert.stop_loss !== undefined && sanitized.price) {
    const stopLoss = sanitizeNumber(alert.stop_loss, 0.0001, MAX_PRICE, 0);
    const deviation = Math.abs((stopLoss - sanitized.price) / sanitized.price);
    if (stopLoss <= 0) {
      errors.push('Stop loss must be a positive number');
    } else if (deviation > MAX_STOP_LOSS_DEVIATION) {
      errors.push(`Stop loss deviation (${(deviation * 100).toFixed(1)}%) exceeds maximum (${MAX_STOP_LOSS_DEVIATION * 100}%)`);
    } else {
      sanitized.stop_loss = stopLoss;
    }
  } else if (alert.stop_loss !== undefined) {
    sanitized.stop_loss = sanitizeNumber(alert.stop_loss, 0.0001, MAX_PRICE, 0);
  }

  // Validate take_profit relative to price
  if (alert.take_profit !== undefined && sanitized.price) {
    const takeProfit = sanitizeNumber(alert.take_profit, 0.0001, MAX_PRICE, 0);
    const deviation = Math.abs((takeProfit - sanitized.price) / sanitized.price);
    if (takeProfit <= 0) {
      errors.push('Take profit must be a positive number');
    } else if (deviation > MAX_TAKE_PROFIT_DEVIATION) {
      errors.push(`Take profit deviation (${(deviation * 100).toFixed(1)}%) exceeds maximum (${MAX_TAKE_PROFIT_DEVIATION * 100}%)`);
    } else {
      sanitized.take_profit = takeProfit;
    }
  } else if (alert.take_profit !== undefined) {
    sanitized.take_profit = sanitizeNumber(alert.take_profit, 0.0001, MAX_PRICE, 0);
  }

  // Validate position_size_pct
  sanitized.position_size_pct = sanitizeNumber(
    alert.position_size_pct, 
    MIN_POSITION_SIZE_PCT, 
    MAX_POSITION_SIZE_PCT, 
    2 // Default 2%
  );

  // Sanitize string fields with length limits
  sanitized.strategy = sanitizeString(alert.strategy, MAX_STRING_LENGTH) || undefined;
  sanitized.indicator = sanitizeString(alert.indicator, MAX_STRING_LENGTH) || undefined;
  sanitized.comment = sanitizeString(alert.comment, MAX_STRING_LENGTH) || undefined;
  sanitized.signal_type = sanitizeString(alert.signal_type, MAX_STRING_LENGTH) || undefined;
  sanitized.exchange = sanitizeString(alert.exchange, MAX_TICKER_LENGTH) || undefined;
  sanitized.time = sanitizeString(alert.time, MAX_STRING_LENGTH) || undefined;
  sanitized.interval = sanitizeString(alert.interval, 20) || undefined;
  sanitized.timeframe = sanitizeString(alert.timeframe, 20) || undefined;
  sanitized.secret = alert.secret; // Don't sanitize secret, just pass through

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

serve(async (req) => {
  // TradingView webhook needs to accept external origin, but uses secret validation
  const corsHeaders = getSecureCorsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('TRADINGVIEW_WEBHOOK_SECRET');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse incoming alert
    const alertText = await req.text();
    
    // Limit raw input size (prevent DoS)
    if (alertText.length > 10000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body too large' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413 }
      );
    }
    
    let rawAlert: TradingViewAlert;

    // TradingView can send JSON or plain text
    try {
      rawAlert = JSON.parse(alertText);
    } catch {
      // Parse plain text format
      rawAlert = parseTextAlert(alertText);
    }

    console.log('[tradingview-webhook] Received alert:', JSON.stringify(rawAlert));

    // Validate webhook secret if configured
    const headerSecret = req.headers.get('x-tv-secret');
    const providedSecret = rawAlert.secret || headerSecret;
    
    if (webhookSecret && webhookSecret !== providedSecret) {
      console.error('[tradingview-webhook] Invalid secret provided');
      
      // Log failed attempt
      await supabase.from('audit_events').insert({
        action: 'tradingview_auth_failed',
        resource_type: 'external_signal',
        severity: 'warning',
        after_state: { 
          alert_ticker: sanitizeString(rawAlert.ticker, MAX_TICKER_LENGTH),
          ip: req.headers.get('x-forwarded-for') || 'unknown',
        },
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid webhook secret' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Replay protection: reject alerts older than 5 minutes
    if (rawAlert.time) {
      const alertTime = new Date(rawAlert.time).getTime();
      if (!isNaN(alertTime)) {
        const age = Date.now() - alertTime;
        if (age > 300000) { // 5 minutes
          console.warn('[tradingview-webhook] Rejected stale alert, age:', age, 'ms');
          return new Response(
            JSON.stringify({ success: false, error: 'Alert too old' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        if (age < -60000) { // 1 minute in the future (clock skew tolerance)
          console.warn('[tradingview-webhook] Rejected future-dated alert');
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid alert timestamp' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
      }
    }

    // Apply rate limiting per webhook secret
    const rateLimitKey = providedSecret ? `secret:${providedSecret.slice(0, 8)}` : 'anonymous';
    if (isRateLimited(rateLimitKey)) {
      console.warn('[tradingview-webhook] Rate limit exceeded for:', rateLimitKey);
      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded. Try again later.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Validate and sanitize all inputs
    const validation = validateAlert(rawAlert);
    if (!validation.valid) {
      console.warn('[tradingview-webhook] Validation failed:', validation.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Validation failed', 
          details: validation.errors 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const alert = validation.sanitized;

    // Normalize instrument name
    const instrument = normalizeInstrument(alert.ticker || alert.instrument || '');
    if (!instrument) {
      return new Response(
        JSON.stringify({ success: false, error: 'No instrument provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Map TradingView action to our signal direction
    const direction = mapActionToDirection(alert.action);
    const signalType = alert.signal_type || alert.indicator || alert.strategy || 'tradingview_custom';
    const strength = alert.strength ?? 0.7;
    const confidence = alert.confidence ?? 0.65;

    // Create intelligence signal
    const signal = {
      instrument,
      signal_type: `tradingview_${signalType}`,
      direction,
      strength,
      confidence,
      source_data: {
        source: 'tradingview',
        exchange: alert.exchange,
        interval: alert.interval || alert.timeframe,
        price: alert.price,
        stop_loss: alert.stop_loss,
        take_profit: alert.take_profit,
        position_size_pct: alert.position_size_pct,
        comment: alert.comment,
        strategy: alert.strategy,
        indicator: alert.indicator,
        raw_time: alert.time,
        processing_ms: Date.now() - startTime,
      },
      reasoning: buildReasoning(alert, instrument, direction),
      expires_at: calculateExpiry(alert.interval),
      created_at: new Date().toISOString(),
    };

    // Store signal
    const { data: insertedSignal, error: insertError } = await supabase
      .from('intelligence_signals')
      .insert(signal)
      .select()
      .single();

    if (insertError) {
      console.error('[tradingview-webhook] Insert error:', insertError);
      throw insertError;
    }

    console.log('[tradingview-webhook] Signal created:', insertedSignal.id);

    // If action is buy/sell with sufficient confidence, create a trade intent
    if ((alert.action === 'buy' || alert.action === 'sell' || alert.action === 'long' || alert.action === 'short') && confidence >= 0.6) {
      await createTradeIntent(supabase, alert, instrument, direction, confidence);
    }

    // Create audit log
    await supabase.from('audit_events').insert({
      action: 'tradingview_signal_received',
      resource_type: 'external_signal',
      resource_id: insertedSignal.id,
      severity: 'info',
      after_state: { 
        signal_id: insertedSignal.id,
        instrument,
        direction,
        strategy: alert.strategy,
        processing_ms: Date.now() - startTime,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        signal_id: insertedSignal.id,
        instrument,
        direction,
        strength,
        confidence,
        message: `TradingView signal received for ${instrument}: ${direction}`,
        processing_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[tradingview-webhook] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }), // Don't expose internal error details
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function parseTextAlert(text: string): TradingViewAlert {
  // Parse multiple formats:
  // Format 1: "BTCUSDT buy 50000 strength=0.8 sl=49000 tp=52000"
  // Format 2: "BTC/USD,long,43500,strategy=momentum"
  // Format 3: JSON-like but malformed
  
  const alert: TradingViewAlert = {};
  const cleanText = text.trim().slice(0, 2000); // Limit text parsing length
  
  // Try comma-separated format first
  if (cleanText.includes(',')) {
    const parts = cleanText.split(',').map(p => p.trim()).slice(0, 20); // Limit parts
    if (parts.length >= 1) alert.ticker = parts[0];
    if (parts.length >= 2) {
      const action = parts[1].toLowerCase();
      if (['buy', 'sell', 'long', 'short', 'close', 'neutral'].includes(action)) {
        alert.action = action as TradingViewAlert['action'];
      }
    }
    if (parts.length >= 3 && !isNaN(parseFloat(parts[2]))) {
      alert.price = parseFloat(parts[2]);
    }
    // Parse remaining key=value pairs (limit to prevent DoS)
    for (const part of parts.slice(3).slice(0, 10)) {
      parseKeyValue(part, alert);
    }
    return alert;
  }
  
  // Space-separated format
  const parts = cleanText.split(/\s+/).slice(0, 20); // Limit parts
  
  if (parts.length >= 1) {
    alert.ticker = parts[0];
  }
  if (parts.length >= 2) {
    const action = parts[1].toLowerCase();
    if (['buy', 'sell', 'long', 'short', 'close', 'neutral'].includes(action)) {
      alert.action = action as TradingViewAlert['action'];
    }
  }
  if (parts.length >= 3 && !isNaN(parseFloat(parts[2]))) {
    alert.price = parseFloat(parts[2]);
  }

  // Parse key=value pairs (limit to prevent DoS)
  for (const part of parts.slice(3).slice(0, 10)) {
    parseKeyValue(part, alert);
  }

  return alert;
}

function parseKeyValue(part: string, alert: TradingViewAlert): void {
  const [key, value] = part.split('=');
  if (!key || !value) return;
  
  switch (key.toLowerCase()) {
    case 'strength':
    case 's':
      alert.strength = parseFloat(value);
      break;
    case 'confidence':
    case 'c':
      alert.confidence = parseFloat(value);
      break;
    case 'sl':
    case 'stoploss':
    case 'stop_loss':
      alert.stop_loss = parseFloat(value);
      break;
    case 'tp':
    case 'takeprofit':
    case 'take_profit':
      alert.take_profit = parseFloat(value);
      break;
    case 'size':
    case 'position_size':
    case 'pct':
      alert.position_size_pct = parseFloat(value);
      break;
    case 'strategy':
    case 'strat':
      alert.strategy = value;
      break;
    case 'indicator':
    case 'ind':
      alert.indicator = value;
      break;
    case 'timeframe':
    case 'tf':
    case 'interval':
      alert.timeframe = value;
      break;
    case 'comment':
    case 'msg':
      alert.comment = value;
      break;
    case 'secret':
      alert.secret = value;
      break;
  }
}

function normalizeInstrument(ticker: string): string {
  if (!ticker) return '';
  
  // Clean up common ticker formats (limit input length first)
  const normalized = ticker.slice(0, MAX_TICKER_LENGTH).toUpperCase()
    .replace(/[/_-]/g, '') // Remove separators first for processing
    .replace('PERP', '')
    .replace('PERPETUAL', '')
    .replace('.P', '')
    .replace('1000', '') // Handle Binance 1000PEPE etc
    .trim();

  // Known quote currencies
  const quotes = ['USDT', 'USDC', 'USD', 'BUSD', 'EUR', 'BTC', 'ETH'];
  
  for (const quote of quotes) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      const base = normalized.slice(0, -quote.length);
      return `${base}-${quote === 'BUSD' ? 'USDT' : quote}`;
    }
  }

  // If already formatted with separator, just normalize
  if (ticker.includes('/') || ticker.includes('-')) {
    const [base, quote] = ticker.toUpperCase().split(/[/-]/);
    if (base && quote) {
      return `${base}-${quote === 'BUSD' ? 'USDT' : quote}`;
    }
  }

  // Default: assume USDT pair
  return `${normalized}-USDT`;
}

function mapActionToDirection(action?: string): string {
  switch (action?.toLowerCase()) {
    case 'buy':
    case 'long':
      return 'bullish';
    case 'sell':
    case 'short':
      return 'bearish';
    case 'close':
    case 'neutral':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function buildReasoning(alert: TradingViewAlert, instrument: string, direction: string): string {
  const parts: string[] = [];
  
  if (alert.strategy) {
    parts.push(`Strategy: ${alert.strategy}`);
  } else if (alert.indicator) {
    parts.push(`Indicator: ${alert.indicator}`);
  } else {
    parts.push('TradingView Custom Alert');
  }
  
  parts.push(`${direction.toUpperCase()} signal on ${instrument}`);
  
  if (alert.price) {
    parts.push(`@ $${alert.price.toLocaleString()}`);
  }
  
  if (alert.timeframe || alert.interval) {
    parts.push(`(${alert.timeframe || alert.interval})`);
  }
  
  if (alert.comment) {
    parts.push(`- ${alert.comment}`);
  }
  
  return parts.join(' ');
}

function calculateExpiry(interval?: string): string {
  // Set expiry based on timeframe
  const intervalMinutes: Record<string, number> = {
    '1': 15,
    '5': 30,
    '15': 60,
    '30': 120,
    '60': 240,
    '1h': 240,
    '4h': 480,
    '1d': 1440,
    'd': 1440,
    '1w': 10080,
    'w': 10080,
  };
  
  const minutes = intervalMinutes[interval?.toLowerCase() || ''] || 240; // Default 4 hours
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function createTradeIntent(
  supabase: any,
  alert: TradingViewAlert,
  instrument: string,
  direction: string,
  confidence: number
) {
  try {
    // Get the first active PROP book for external signals
    let { data: book } = await supabase
      .from('books')
      .select('id, capital_allocated')
      .eq('status', 'active')
      .eq('type', 'PROP')
      .limit(1)
      .single();

    if (!book) {
      // Try any active book
      const { data: anyBook } = await supabase
        .from('books')
        .select('id, capital_allocated')
        .eq('status', 'active')
        .limit(1)
        .single();
      book = anyBook;
    }

    if (!book) {
      console.log('[tradingview-webhook] No active book found for trade intent');
      return;
    }

    // Get or create external signals strategy
    let { data: strategy } = await supabase
      .from('strategies')
      .select('id')
      .eq('name', 'TradingView Signals')
      .eq('book_id', book.id)
      .limit(1)
      .single();

    if (!strategy) {
      const { data: newStrategy } = await supabase
        .from('strategies')
        .insert({
          name: 'TradingView Signals',
          book_id: book.id,
          timeframe: alert.timeframe || alert.interval || '1h',
          status: 'paper',
          asset_class: 'crypto',
          config_metadata: { 
            source: 'tradingview',
            auto_created: true,
          },
          venue_scope: ['coinbase', 'binance', 'kraken'],
        })
        .select()
        .single();
      strategy = newStrategy;
    }

    if (!strategy) {
      console.log('[tradingview-webhook] Could not create strategy');
      return;
    }

    // Calculate position sizing with validated bounds
    const portfolioValue = book.capital_allocated || 100000;
    const positionSizePct = alert.position_size_pct || 2; // Already validated to 0.1-10%
    const targetExposure = Math.min(portfolioValue * (positionSizePct / 100), 10000); // Cap at $10k
    
    // Calculate stop loss
    const price = alert.price || 0;
    let stopLossPct = 0.02; // Default 2%
    
    if (alert.stop_loss && price) {
      stopLossPct = Math.abs((alert.stop_loss - price) / price);
      // Already validated in validateAlert, but double-check
      stopLossPct = Math.min(stopLossPct, MAX_STOP_LOSS_DEVIATION);
    }
    
    const maxLoss = targetExposure * stopLossPct;

    // Create trade intent
    const intent = {
      book_id: book.id,
      strategy_id: strategy.id,
      instrument,
      direction: direction === 'bullish' ? 'buy' : 'sell',
      target_exposure_usd: targetExposure,
      max_loss_usd: Math.max(maxLoss, 50), // Minimum $50 max loss
      confidence,
      horizon_minutes: getHorizonMinutes(alert.interval || alert.timeframe),
      invalidation_price: alert.stop_loss,
      liquidity_requirement: 'normal',
      status: 'pending',
      metadata: {
        source: 'tradingview',
        strategy: alert.strategy,
        indicator: alert.indicator,
        entry_price: alert.price,
        stop_loss: alert.stop_loss,
        take_profit: alert.take_profit,
        comment: alert.comment,
        timeframe: alert.interval || alert.timeframe,
      },
    };

    const { data: createdIntent, error: intentError } = await supabase
      .from('trade_intents')
      .insert(intent)
      .select()
      .single();

    if (intentError) {
      console.error('[tradingview-webhook] Intent creation error:', intentError);
    } else {
      console.log('[tradingview-webhook] Trade intent created:', createdIntent.id);
    }

  } catch (error) {
    console.error('[tradingview-webhook] Error creating trade intent:', error);
  }
}

function getHorizonMinutes(interval?: string): number {
  const horizons: Record<string, number> = {
    '1': 15,
    '5': 60,
    '15': 120,
    '30': 240,
    '60': 480,
    '1h': 480,
    '4h': 960,
    '1d': 2880,
    'd': 2880,
  };
  return horizons[interval?.toLowerCase() || ''] || 240;
}
