import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Parse body for POST requests
    let body = {};
    if (req.method === 'POST') {
      body = await req.json();
    }

    // Route handlers
    switch (path) {
      case 'overview': {
        // Get dashboard metrics
        const [booksResult, positionsResult, ordersResult, settingsResult] = await Promise.all([
          supabase.from('books').select('*'),
          supabase.from('positions').select('*').eq('is_open', true),
          supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
          supabase.from('global_settings').select('*').single(),
        ]);

        const totalAUM = booksResult.data?.reduce((sum, book) => sum + Number(book.capital_allocated), 0) || 0;
        const totalExposure = positionsResult.data?.reduce((sum, pos) => sum + Math.abs(Number(pos.size) * Number(pos.mark_price)), 0) || 0;
        const totalUnrealizedPnL = positionsResult.data?.reduce((sum, pos) => sum + Number(pos.unrealized_pnl), 0) || 0;

        return new Response(JSON.stringify({
          aum: totalAUM,
          exposure: totalExposure,
          unrealizedPnl: totalUnrealizedPnL,
          openPositions: positionsResult.data?.length || 0,
          recentOrders: ordersResult.data?.length || 0,
          paperMode: settingsResult.data?.paper_trading_mode ?? true,
          killSwitch: settingsResult.data?.global_kill_switch ?? false,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'positions': {
        const bookId = url.searchParams.get('book_id');
        let query = supabase.from('positions').select('*, books(name), strategies(name), venues(name)').eq('is_open', true);
        
        if (bookId) {
          query = query.eq('book_id', bookId);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'orders': {
        const status = url.searchParams.get('status');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        
        let query = supabase.from('orders').select('*, books(name), strategies(name), venues(name)').order('created_at', { ascending: false }).limit(limit);
        
        if (status) {
          query = query.eq('status', status);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'place-order': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
        }

        const { book_id, instrument, side, size, price, order_type = 'market', strategy_id, venue_id } = body as any;

        // Validate required fields
        if (!book_id || !instrument || !side || !size) {
          return new Response(JSON.stringify({ error: 'Missing required fields: book_id, instrument, side, size' }), { status: 400, headers: corsHeaders });
        }

        // Check global kill switch
        const { data: settings } = await supabase.from('global_settings').select('global_kill_switch, paper_trading_mode').single();
        if (settings?.global_kill_switch) {
          return new Response(JSON.stringify({ error: 'Trading is halted - kill switch is active' }), { status: 403, headers: corsHeaders });
        }

        // Check book status
        const { data: book } = await supabase.from('books').select('status, capital_allocated, current_exposure').eq('id', book_id).single();
        if (!book) {
          return new Response(JSON.stringify({ error: 'Book not found' }), { status: 404, headers: corsHeaders });
        }
        if (book.status !== 'active') {
          return new Response(JSON.stringify({ error: `Book is ${book.status} - cannot place orders` }), { status: 403, headers: corsHeaders });
        }

        // Calculate notional and check exposure limits
        const notional = size * (price || 0);
        const newExposure = Number(book.current_exposure) + notional;
        const maxExposure = Number(book.capital_allocated) * 2; // 2x leverage max

        if (newExposure > maxExposure) {
          return new Response(JSON.stringify({ 
            error: 'Order would exceed exposure limits',
            current_exposure: book.current_exposure,
            max_exposure: maxExposure,
            requested_notional: notional
          }), { status: 403, headers: corsHeaders });
        }

        // Create order (paper mode - simulate fill)
        const orderId = crypto.randomUUID();
        const isPaperMode = settings?.paper_trading_mode ?? true;
        
        const simulatedSlippage = Math.random() * 0.002; // 0-0.2% slippage
        const fillPrice = price ? (side === 'buy' ? price * (1 + simulatedSlippage) : price * (1 - simulatedSlippage)) : null;
        
        const orderData = {
          id: orderId,
          book_id,
          strategy_id: strategy_id || null,
          venue_id: venue_id || null,
          instrument,
          side,
          size,
          price,
          status: isPaperMode ? 'filled' : 'open',
          filled_size: isPaperMode ? size : 0,
          filled_price: isPaperMode ? fillPrice : null,
          slippage: isPaperMode ? simulatedSlippage * 100 : null,
          latency_ms: isPaperMode ? Math.floor(Math.random() * 80) + 20 : null,
        };

        const { data: order, error: orderError } = await supabase.from('orders').insert(orderData).select().single();
        if (orderError) throw orderError;

        // If paper mode and filled, create/update position
        if (isPaperMode && fillPrice) {
          // Check for existing position
          const { data: existingPos } = await supabase
            .from('positions')
            .select('*')
            .eq('book_id', book_id)
            .eq('instrument', instrument)
            .eq('is_open', true)
            .single();

          if (existingPos) {
            // Update existing position
            const newSize = side === existingPos.side 
              ? Number(existingPos.size) + size 
              : Number(existingPos.size) - size;

            if (Math.abs(newSize) < 0.0001) {
              // Close position
              await supabase.from('positions').update({ is_open: false }).eq('id', existingPos.id);
            } else {
              // Update size
              await supabase.from('positions').update({ 
                size: Math.abs(newSize),
                side: newSize > 0 ? existingPos.side : (existingPos.side === 'buy' ? 'sell' : 'buy'),
                mark_price: fillPrice,
              }).eq('id', existingPos.id);
            }
          } else {
            // Create new position
            await supabase.from('positions').insert({
              book_id,
              strategy_id: strategy_id || null,
              venue_id: venue_id || null,
              instrument,
              side,
              size,
              entry_price: fillPrice,
              mark_price: fillPrice,
              unrealized_pnl: 0,
              is_open: true,
            });
          }

          // Update book exposure
          await supabase.from('books').update({ current_exposure: newExposure }).eq('id', book_id);

          // Create fill record
          await supabase.from('fills').insert({
            order_id: orderId,
            venue_id: venue_id || null,
            instrument,
            side,
            size,
            price: fillPrice,
            fee: size * fillPrice * 0.001, // 0.1% fee
          });
        }

        // Audit log
        await supabase.from('audit_events').insert({
          action: 'order_placed',
          resource_type: 'order',
          resource_id: orderId,
          book_id,
          after_state: { order: orderData, paper_mode: isPaperMode },
        });

        console.log(`Order placed: ${orderId} - ${instrument} ${side} ${size} @ ${price || 'market'} (paper: ${isPaperMode})`);

        return new Response(JSON.stringify({
          success: true,
          order,
          paper_mode: isPaperMode,
          message: isPaperMode ? 'Order filled (paper trading)' : 'Order submitted',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'venues': {
        const { data, error } = await supabase.from('venues').select('*, venue_health(*)').eq('is_enabled', true);
        if (error) throw error;
        
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'health': {
        const { data: settings } = await supabase.from('global_settings').select('*').single();
        const { count: venueCount } = await supabase.from('venues').select('*', { count: 'exact', head: true }).eq('is_enabled', true);
        const { count: posCount } = await supabase.from('positions').select('*', { count: 'exact', head: true }).eq('is_open', true);

        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          paper_mode: settings?.paper_trading_mode ?? true,
          kill_switch: settings?.global_kill_switch ?? false,
          enabled_venues: venueCount,
          open_positions: posCount,
          version: '1.0.0',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ 
          error: 'Not found',
          available_endpoints: ['overview', 'positions', 'orders', 'place-order', 'venues', 'health']
        }), { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error('Trading API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});