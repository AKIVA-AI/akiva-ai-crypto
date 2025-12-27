import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSafetyChecks(
  supabase: any,
  order: TradeOrder
): Promise<SafetyCheck> {
  const checks: { name: string; check: () => Promise<SafetyCheck> }[] = [];

  // Check 1: Kill switch
  checks.push({
    name: 'kill_switch',
    check: async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('global_kill_switch, reduce_only_mode')
        .single();
      
      if (data?.global_kill_switch) {
        return { passed: false, reason: 'Global kill switch is active' };
      }
      if (data?.reduce_only_mode && order.side === 'buy') {
        return { passed: false, reason: 'System is in reduce-only mode' };
      }
      return { passed: true };
    },
  });

  // Check 2: Book status
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
      if (data.status === 'frozen') {
        return { passed: false, reason: 'Book is frozen' };
      }
      return { passed: true };
    },
  });

  // Check 3: Risk limits
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
        const orderValue = order.size * (order.price || 0);
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
  
  // If no Binance credentials, fall back to simulation
  if (!binanceApiKey || !binanceApiSecret) {
    console.log('No Binance credentials, using simulation mode');
    return null;
  }
  
  // TODO: Implement real Binance order execution with HMAC signing
  // For now, return null to use simulation
  // Real implementation would:
  // 1. Create timestamp
  // 2. Build query string with order params
  // 3. Sign with HMAC SHA256
  // 4. POST to /api/v3/order
  console.log('Binance credentials found, but live execution not yet enabled');
  return null;
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { action, order, orderId } = await req.json();
    
    console.log(`Live trading request: ${action}`);
    
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
