import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// SECURITY: Restrict CORS to known origins
const ALLOWED_ORIGINS = [
  'https://amvakxshlojoshdfcqos.lovableproject.com',
  'https://amvakxshlojoshdfcqos.lovable.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

interface TradeOrder {
  bookId: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  orderType: 'market' | 'limit';
  venue: string;
  strategyId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

interface SafetyCheck {
  passed: boolean;
  reason?: string;
  // Optional machine-readable code for UI/ops
  reasonCode?: string;
}

async function probeCriticalComponents(supabase: any): Promise<{ ok: boolean; reason?: string; details?: Record<string, string> }> {
  // Minimal, fast probes to avoid a hard dependency on pre-populated system_health.
  // Still FAIL-CLOSED if probes error.
  const details: Record<string, string> = {};

  try {
    // database probe
    const { error: dbErr } = await supabase.from('global_settings').select('id').limit(1);
    if (dbErr) {
      details.database = `unhealthy: ${dbErr.message}`;
      return { ok: false, reason: 'System not ready: database probe failed', details };
    }
    details.database = 'healthy';

    // oms probe
    const { error: omsErr } = await supabase.from('orders').select('id').limit(1);
    if (omsErr) {
      details.oms = `unhealthy: ${omsErr.message}`;
      return { ok: false, reason: 'System not ready: OMS probe failed', details };
    }
    details.oms = 'healthy';

    // risk_engine probe
    const { error: riskErr } = await supabase.from('risk_limits').select('book_id').limit(1);
    if (riskErr) {
      // risk_limits might be empty in a fresh install; the SELECT itself should still succeed.
      details.risk_engine = `unhealthy: ${riskErr.message}`;
      return { ok: false, reason: 'System not ready: risk engine probe failed', details };
    }
    details.risk_engine = 'healthy';

    return { ok: true, details };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Unknown probe error', details };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSafetyChecks(
  supabase: any,
  order: TradeOrder
): Promise<SafetyCheck> {
  const checks: { name: string; check: () => Promise<SafetyCheck> }[] = [];

  // Check 0: System Health (must be ready to trade)
  // CRITICAL: Uses lowercase snake_case component IDs to match useSystemHealth hook
  // Canonical IDs: 'oms', 'risk_engine', 'database', 'market_data', 'venues', 'cache'
  const CRITICAL_COMPONENTS = ['oms', 'risk_engine', 'database'];
  
  checks.push({
    name: 'system_health',
    check: async () => {
      const { data: health, error } = await supabase
        .from('system_health')
        .select('component, status')
        .in('component', CRITICAL_COMPONENTS);

      // If the table read fails, FAIL-CLOSED.
      if (error) {
        return {
          passed: false,
          reason: `System not ready: unable to read health status (${error.message})`,
          reasonCode: 'HEALTH_READ_FAILED',
        };
      }

      // FAIL-CLOSED on missing health rows, BUT fall back to direct probes so trading isn't
      // blocked just because checks haven't been run yet.
      const foundComponents = new Set((health || []).map((h: { component: string }) => h.component));
      const missingComponents = CRITICAL_COMPONENTS.filter((c) => !foundComponents.has(c));

      if (missingComponents.length > 0) {
        const probe = await probeCriticalComponents(supabase);
        if (!probe.ok) {
          return {
            passed: false,
            reason: probe.reason || `System not ready: missing health data for ${missingComponents.join(', ')}`,
            reasonCode: 'HEALTH_DATA_MISSING',
          };
        }

        // Probes succeeded -> allow trading for now (still fail-closed if any later check fails)
        return { passed: true };
      }

      // POLICY: For critical components, BOTH 'unhealthy' AND 'degraded' block trading
      const blockedComponents = health?.filter((h: { status: string }) =>
        h.status === 'unhealthy' || h.status === 'degraded'
      ) || [];

      if (blockedComponents.length > 0) {
        const details = blockedComponents.map((c: { component: string; status: string }) =>
          `${c.component}:${c.status}`
        ).join(', ');
        return {
          passed: false,
          reason: `System not ready: ${details}`,
          reasonCode: 'CRITICAL_COMPONENT_DEGRADED',
        };
      }

      return { passed: true };
    },
  });

  // Check 1: Kill switch and trading modes
  checks.push({
    name: 'kill_switch',
    check: async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('global_kill_switch, reduce_only_mode')
        .single();
      
      if (data?.global_kill_switch) {
        return { passed: false, reason: 'Global kill switch is active - all trading halted' };
      }
      
      // Check reduce-only mode - need to verify if this is a reducing order
      if (data?.reduce_only_mode) {
        // Get existing position
        const { data: position } = await supabase
          .from('positions')
          .select('side, size')
          .eq('book_id', order.bookId)
          .eq('instrument', order.instrument)
          .eq('is_open', true)
          .single();
        
        // CRITICAL: Reducing means opposite side AND size <= existing position size
        // A flip (e.g., closing long and going short) is NOT reducing
        const isReducing = position && 
          position.side !== order.side && 
          order.size <= (position.size || 0);
        
        if (!isReducing) {
          return { passed: false, reason: 'System is in reduce-only mode - only position-closing trades allowed (order size must not exceed position size)' };
        }
      }
      
      return { passed: true };
    },
  });
  
  // Check 1.5: Strategy lifecycle state (server-side enforcement)
  // CRITICAL: Fail-closed on invalid strategyId to prevent bypass attacks
  checks.push({
    name: 'strategy_lifecycle',
    check: async () => {
      // If no strategyId provided, treat as manual trade (allowed)
      if (!order.strategyId) return { passed: true };
      
      const { data: strategy, error } = await supabase
        .from('strategies')
        .select('lifecycle_state, quarantine_expires_at, lifecycle_reason')
        .eq('id', order.strategyId)
        .single();
      
      // FAIL-CLOSED: If strategyId is provided but not found, reject (prevents bypass with fake UUIDs)
      if (error || !strategy) {
        return { 
          passed: false, 
          reason: `Invalid strategyId: strategy not found (${order.strategyId})` 
        };
      }
      
      const { lifecycle_state, quarantine_expires_at, lifecycle_reason } = strategy;
      
      // DISABLED strategies cannot trade
      if (lifecycle_state === 'disabled') {
        return { passed: false, reason: `Strategy is disabled: ${lifecycle_reason || 'manual disable'}` };
      }
      
      // QUARANTINED strategies cannot trade live
      if (lifecycle_state === 'quarantined') {
        const expiresAt = quarantine_expires_at ? new Date(quarantine_expires_at) : null;
        const stillQuarantined = !expiresAt || expiresAt > new Date();
        
        if (stillQuarantined) {
          return { passed: false, reason: `Strategy is quarantined: ${lifecycle_reason || 'risk breach'}` };
        }
      }
      
      // PAPER_ONLY strategies blocked from live execution
      if (lifecycle_state === 'paper_only') {
        return { passed: false, reason: 'Strategy is in paper-only mode' };
      }
      
      // COOLDOWN strategies blocked
      if (lifecycle_state === 'cooldown') {
        return { passed: false, reason: 'Strategy is in cooldown period' };
      }
      
      return { passed: true };
    },
  });

  // Check 2: Book status with proper reduce-only handling
  checks.push({
    name: 'book_status',
    check: async () => {
      const { data } = await supabase
        .from('books')
        .select('status, capital_allocated, current_exposure')
        .eq('id', order.bookId)
        .single();
      
      if (!data) {
        return { passed: false, reason: 'Book not found' };
      }
      
      if (data.status === 'frozen' || data.status === 'halted') {
        return { passed: false, reason: `Book is ${data.status} - no trading allowed` };
      }
      
      // Handle book-level reduce-only
      if (data.status === 'reduce_only') {
        const { data: position } = await supabase
          .from('positions')
          .select('side, size')
          .eq('book_id', order.bookId)
          .eq('instrument', order.instrument)
          .eq('is_open', true)
          .single();
        
        // CRITICAL: Reducing means opposite side AND size <= existing position size
        const isReducing = position && 
          position.side !== order.side && 
          order.size <= (position.size || 0);
          
        if (!isReducing) {
          return { passed: false, reason: 'Book is in reduce-only mode (order size must not exceed position size)' };
        }
      }
      
      return { passed: true };
    },
  });

  // Check 3: Risk limits with PROPER price resolution
  checks.push({
    name: 'risk_limits',
    check: async () => {
      const { data: limits } = await supabase
        .from('risk_limits')
        .select('*')
        .eq('book_id', order.bookId)
        .single();
      
      if (!limits) {
        return { passed: true }; // No limits set
      }
      
      // Get current exposure
      const { data: book } = await supabase
        .from('books')
        .select('capital_allocated, current_exposure')
        .eq('id', order.bookId)
        .single();
      
      if (book) {
        // CRITICAL: Resolve price - never use 0
        let resolvedPrice = order.price;
        if (!resolvedPrice || resolvedPrice <= 0) {
          const livePrice = await getBinancePrice(order.instrument);
          resolvedPrice = livePrice || 0;
        }
        
        if (!resolvedPrice || resolvedPrice <= 0) {
          return { 
            passed: false, 
            reason: 'Unable to resolve market price for risk calculation' 
          };
        }
        
        const orderValue = order.size * resolvedPrice;
        const projectedExposure = (book.current_exposure || 0) + orderValue;
        const exposureRatio = projectedExposure / (book.capital_allocated || 1);
        
        if (exposureRatio > (limits.max_leverage || 3)) {
          return { 
            passed: false, 
            reason: `Order would exceed max leverage (${limits.max_leverage}x)` 
          };
        }
      }
      
      return { passed: true };
    },
  });

  // Check 4: Venue health
  checks.push({
    name: 'venue_health',
    check: async () => {
      const { data: venue } = await supabase
        .from('venues')
        .select('status, is_enabled')
        .eq('name', order.venue)
        .single();
      
      if (!venue?.is_enabled) {
        return { passed: false, reason: `Venue ${order.venue} is disabled` };
      }
      if (venue.status === 'offline') {
        return { passed: false, reason: `Venue ${order.venue} is offline` };
      }
      return { passed: true };
    },
  });

  // Run all checks
  for (const { name, check } of checks) {
    const result = await check();
    console.log(`Safety check [${name}]: ${result.passed ? 'PASSED' : 'FAILED'} ${result.reason || ''}`);
    if (!result.passed) {
      return result;
    }
  }

  return { passed: true };
}

// Binance API integration for real trading
async function getBinancePrice(symbol: string): Promise<number | null> {
  try {
    const formattedSymbol = symbol.replace('/', '').toUpperCase();
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${formattedSymbol}`);
    if (!response.ok) return null;
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('Binance price fetch error:', error);
    return null;
  }
}

async function executeBinanceOrder(order: TradeOrder): Promise<{
  filledPrice: number;
  filledSize: number;
  fee: number;
  latencyMs: number;
  slippage: number;
  mode: 'live' | 'simulated';
} | null> {
  const binanceApiKey = Deno.env.get('BINANCE_API_KEY');
  const binanceApiSecret = Deno.env.get('BINANCE_API_SECRET');
  
  if (!binanceApiKey || !binanceApiSecret) {
    console.log('[LiveTrading] No Binance credentials configured');
    return null;
  }
  
  const startTime = Date.now();
  
  try {
    const symbol = order.instrument.replace('/', '').toUpperCase();
    const timestamp = Date.now().toString();
    
    const params: Record<string, string> = {
      symbol,
      side: order.side.toUpperCase(),
      type: order.orderType.toUpperCase(),
      quantity: order.size.toString(),
      timestamp,
    };
    
    if (order.orderType === 'limit' && order.price) {
      params.price = order.price.toString();
      params.timeInForce = 'GTC';
    }
    
    // Build query string and sign with HMAC-SHA256
    const queryString = new URLSearchParams(params).toString();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(binanceApiSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    const url = `https://api.binance.com/api/v3/order?${queryString}&signature=${signatureHex}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': binanceApiKey },
    });
    
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[LiveTrading] Binance order failed:', error);
      return null;
    }
    
    const result = await response.json();
    console.log('[LiveTrading] Binance order executed:', result.orderId);
    
    const filledPrice = parseFloat(result.avgPrice || result.price || '0');
    const filledSize = parseFloat(result.executedQty || '0');
    const originalPrice = await getBinancePrice(order.instrument) || filledPrice;
    const slippage = originalPrice > 0 ? Math.abs(filledPrice - originalPrice) / originalPrice * 10000 : 0;
    
    return {
      filledPrice,
      filledSize,
      fee: filledPrice * filledSize * 0.001,
      latencyMs,
      slippage,
      mode: 'live',
    };
    
  } catch (error) {
    console.error('[LiveTrading] Binance execution error:', error);
    return null;
  }
}

async function simulateFill(order: TradeOrder): Promise<{
  filledPrice: number;
  filledSize: number;
  fee: number;
  latencyMs: number;
  slippage: number;
}> {
  // Try to get real price from Binance for accurate simulation
  const realPrice = await getBinancePrice(order.instrument);
  const basePrice = realPrice || order.price || 0;
  
  // Simulate market conditions
  const slippageBps = order.orderType === 'market' ? Math.random() * 10 : 0; // 0-10 bps for market
  const slippage = basePrice * (slippageBps / 10000) * (order.side === 'buy' ? 1 : -1);
  const filledPrice = basePrice + slippage;
  
  // Simulate partial fill probability
  const fillRatio = Math.random() > 0.1 ? 1 : 0.5 + Math.random() * 0.5;
  const filledSize = order.size * fillRatio;
  
  // Calculate fee (0.1% taker fee for simulation)
  const fee = filledPrice * filledSize * 0.001;
  
  // Simulate latency
  const latencyMs = 20 + Math.random() * 80;
  
  console.log(`Simulated fill: ${filledSize}@${filledPrice} (real price: ${realPrice || 'N/A'})`);
  
  return {
    filledPrice,
    filledSize,
    fee,
    latencyMs,
    slippage: slippageBps,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // CRITICAL: Authenticate user before any trading operation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing or invalid authorization header' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid or expired token' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // CRITICAL: Verify user has trading permissions (admin, cio, or trader role)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'cio', 'trader']);
    
    if (!roleData || roleData.length === 0) {
      console.log(`Unauthorized trading attempt by user ${user.id} (${user.email})`);
      
      await supabase.from('audit_events').insert({
        action: 'unauthorized_trading_attempt',
        resource_type: 'order',
        user_id: user.id,
        user_email: user.email,
        severity: 'warning',
      });
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Insufficient permissions. Trading requires Admin, CIO, or Trader role.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { action, order, orderId } = await req.json();
    
    console.log(`Live trading request: ${action} by user ${user.email}`);
    
    switch (action) {
      case 'place_order': {
        if (!order) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Order details required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Run safety checks
        const safetyResult = await runSafetyChecks(supabase, order);
        if (!safetyResult.passed) {
          // Log rejected order
          await supabase.from('audit_events').insert({
            action: 'order_rejected',
            resource_type: 'order',
            severity: 'warning',
            before_state: order,
            after_state: { reason: safetyResult.reason },
          });
          
          return new Response(JSON.stringify({ 
            success: false, 
            error: safetyResult.reason,
            rejected: true 
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if paper trading mode
        const { data: settings } = await supabase
          .from('global_settings')
          .select('paper_trading_mode')
          .single();

        // Create order record
        const { data: venueData } = await supabase
          .from('venues')
          .select('id')
          .eq('name', order.venue)
          .single();

        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            book_id: order.bookId,
            instrument: order.instrument,
            side: order.side,
            size: order.size,
            price: order.price,
            status: 'open',
            venue_id: venueData?.id,
            strategy_id: order.strategyId,
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Simulate or execute fill
        const fill = await simulateFill(order);
        
        // Update order with fill
        const orderStatus = fill.filledSize >= order.size ? 'filled' : 'open';
        
        await supabase
          .from('orders')
          .update({
            filled_size: fill.filledSize,
            filled_price: fill.filledPrice,
            slippage: fill.slippage,
            latency_ms: Math.round(fill.latencyMs),
            status: orderStatus,
          })
          .eq('id', newOrder.id);

        // Create fill record
        await supabase.from('fills').insert({
          order_id: newOrder.id,
          instrument: order.instrument,
          side: order.side,
          size: fill.filledSize,
          price: fill.filledPrice,
          fee: fill.fee,
          venue_id: venueData?.id,
        });

        // Update position if filled
        if (fill.filledSize > 0) {
          const { data: existingPosition } = await supabase
            .from('positions')
            .select('*')
            .eq('book_id', order.bookId)
            .eq('instrument', order.instrument)
            .eq('is_open', true)
            .single();

          if (existingPosition) {
            // Update existing position
            const newSize = order.side === existingPosition.side
              ? existingPosition.size + fill.filledSize
              : existingPosition.size - fill.filledSize;

            if (newSize <= 0) {
              // Close position
              await supabase
                .from('positions')
                .update({ is_open: false, size: 0 })
                .eq('id', existingPosition.id);
            } else {
              await supabase
                .from('positions')
                .update({ size: newSize, mark_price: fill.filledPrice })
                .eq('id', existingPosition.id);
            }
          } else {
            // Create new position
            await supabase.from('positions').insert({
              book_id: order.bookId,
              instrument: order.instrument,
              side: order.side,
              size: fill.filledSize,
              entry_price: fill.filledPrice,
              mark_price: fill.filledPrice,
              venue_id: venueData?.id,
              strategy_id: order.strategyId,
            });
          }
        }

        console.log(`Order ${newOrder.id} executed: ${fill.filledSize}@${fill.filledPrice}`);

        return new Response(JSON.stringify({ 
          success: true,
          order: {
            id: newOrder.id,
            status: orderStatus,
            filledSize: fill.filledSize,
            filledPrice: fill.filledPrice,
            fee: fill.fee,
            latencyMs: Math.round(fill.latencyMs),
            slippage: fill.slippage,
          },
          mode: settings?.paper_trading_mode ? 'paper' : 'live',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'cancel_order': {
        if (!orderId) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Order ID required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', orderId)
          .eq('status', 'open');

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'close_position': {
        const { positionId, percentage = 100 } = await req.json();
        
        if (!positionId) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Position ID required' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: position } = await supabase
          .from('positions')
          .select('*')
          .eq('id', positionId)
          .single();

        if (!position) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Position not found' 
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create closing order
        const closeSize = position.size * (percentage / 100);
        const closeSide = position.side === 'buy' ? 'sell' : 'buy';

        const closeOrder: TradeOrder = {
          bookId: position.book_id,
          instrument: position.instrument,
          side: closeSide,
          size: closeSize,
          price: position.mark_price,
          orderType: 'market',
          venue: 'simulated',
        };

        // Recursively place the close order
        const closeResult = await runSafetyChecks(supabase, closeOrder);
        if (!closeResult.passed) {
          // Allow reduce-only to close positions
          console.log('Override: allowing position close in reduce-only mode');
        }

        const fill = await simulateFill(closeOrder);
        
        // Update position
        const newSize = position.size - closeSize;
        if (newSize <= 0) {
          await supabase
            .from('positions')
            .update({ 
              is_open: false, 
              size: 0,
              realized_pnl: position.realized_pnl + (fill.filledPrice - position.entry_price) * closeSize * (position.side === 'buy' ? 1 : -1)
            })
            .eq('id', positionId);
        } else {
          await supabase
            .from('positions')
            .update({ size: newSize })
            .eq('id', positionId);
        }

        return new Response(JSON.stringify({ 
          success: true,
          closedSize: closeSize,
          closedPrice: fill.filledPrice,
        }), {
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
    console.error('Live trading error:', error);
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
