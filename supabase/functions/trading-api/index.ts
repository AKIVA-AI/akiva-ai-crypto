import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  getSecureCorsHeaders,
  validateAuth,
  rateLimitMiddleware,
  RATE_LIMITS
} from "../_shared/security.ts";
import {
  validatePlaceOrderInput,
  validationErrorResponse,
} from "../_shared/validation.ts";

serve(async (req) => {
  const corsHeaders = getSecureCorsHeaders(req.headers.get('Origin'));
  
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
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // Empty body is fine for some requests
      }
    }

    // SECURITY: Authenticate user for all operations (except health_check and detect_region)
    const isPublicAction = body.action === 'health_check' || body.action === 'detect_region';
    const isWriteOperation = path === 'place-order' || body.action === 'place_order';
    let userId: string | null = null;
    
    if (!isPublicAction) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // For write operations, verify user has trading permissions
      if (isWriteOperation) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'cio', 'trader']);
        
        if (!roleData || roleData.length === 0) {
          console.log(`Unauthorized trading attempt by user ${user.id}`);
          await supabase.from('audit_events').insert({
            action: 'unauthorized_trading_attempt',
            resource_type: 'order',
            user_id: user.id,
            user_email: user.email,
            severity: 'warning',
          });
          return new Response(JSON.stringify({ error: 'Insufficient permissions for trading' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      userId = user.id;
    }

    // Handle detect_region action for server-side geo detection using MaxMind GeoLite2
    if (body.action === 'detect_region') {
      // Get client IP from headers
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || req.headers.get('cf-connecting-ip') 
        || req.headers.get('x-real-ip')
        || 'unknown';
      
      console.log(`[REGION DETECTION] Client IP: ${clientIp}`);
      
      // MaxMind GeoLite2 integration
      const maxmindLicenseKey = Deno.env.get('MAXMIND_LICENSE_KEY');
      
      if (maxmindLicenseKey && clientIp && clientIp !== 'unknown') {
        try {
          // Use MaxMind GeoLite2 web service
          const geoResponse = await fetch(
            `https://geolite.info/geoip/v2.1/country/${clientIp}`,
            {
              headers: {
                'Authorization': `Basic ${btoa(`${Deno.env.get('MAXMIND_ACCOUNT_ID') || '0'}:${maxmindLicenseKey}`)}`,
              },
            }
          );
          
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            const countryCode = geoData.country?.iso_code || 'Unknown';
            const isUS = countryCode === 'US';
            
            console.log(`[REGION DETECTION] MaxMind result: ${countryCode}, isUS: ${isUS}`);
            
            // Log metric
            await supabase.from('performance_metrics').insert({
              function_name: 'trading-api',
              endpoint: 'detect_region',
              latency_ms: 0,
              success: true,
              metadata: { country: countryCode, isUS, source: 'maxmind' },
            });
            
            return new Response(JSON.stringify({
              country: countryCode,
              countryName: geoData.country?.names?.en || countryCode,
              continent: geoData.continent?.code,
              isUS,
              source: 'maxmind_geolite2',
              note: isUS 
                ? 'US location detected - some features restricted per US regulations'
                : 'International location - full feature access',
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else {
            console.warn(`[REGION DETECTION] MaxMind API error: ${geoResponse.status}`);
          }
        } catch (e) {
          console.error('[REGION DETECTION] MaxMind lookup failed:', e);
        }
      }
      
      // Fallback: Use Cloudflare headers if available
      const cfCountry = req.headers.get('cf-ipcountry');
      if (cfCountry) {
        const isUS = cfCountry === 'US';
        console.log(`[REGION DETECTION] Cloudflare fallback: ${cfCountry}, isUS: ${isUS}`);
        
        return new Response(JSON.stringify({
          country: cfCountry,
          isUS,
          source: 'cloudflare',
          note: isUS 
            ? 'US location detected - some features restricted per US regulations'
            : 'International location - full feature access',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      // Final fallback: Default to international (safe fallback)
      console.log('[REGION DETECTION] No geo data available, defaulting to international');
      return new Response(JSON.stringify({
        country: 'Unknown',
        isUS: false,
        source: 'fallback',
        note: 'Could not determine location - defaulting to international access. Actual enforcement happens at trade execution.',
        clientIp: clientIp !== 'unknown' ? 'detected' : 'unknown',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle health_check action from body (for Operations page health checks)
    if (body.action === 'health_check') {
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
        
        // Audit log: track access to sensitive trading data
        await supabase.from('audit_events').insert({
          action: 'view_positions',
          resource_type: 'position',
          user_id: userId,
          severity: 'info',
          after_state: { count: data?.length || 0, book_id: bookId },
        });
        
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'orders': {
        const status = url.searchParams.get('status');
        const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '50')), 500); // Bound limit 1-500
        
        let query = supabase.from('orders').select('*, books(name), strategies(name), venues(name)').order('created_at', { ascending: false }).limit(limit);
        
        if (status) {
          query = query.eq('status', status);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Audit log: track access to sensitive trading data
        await supabase.from('audit_events').insert({
          action: 'view_orders',
          resource_type: 'order',
          user_id: userId,
          severity: 'info',
          after_state: { count: data?.length || 0, status, limit },
        });
        
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'place-order': {
        if (req.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
        }

        // Validate input with comprehensive schema validation
        const validationResult = validatePlaceOrderInput(body);
        if (!validationResult.success) {
          console.log(`[TRADING] Input validation failed: ${validationResult.errors?.join(', ')}`);
          return validationErrorResponse(validationResult.errors || [], corsHeaders);
        }
        
        const { book_id, instrument, side, size, price, order_type = 'market', strategy_id, venue_id } = validationResult.data!;

        // Check global kill switch and settings
        const { data: settings } = await supabase.from('global_settings').select('global_kill_switch, paper_trading_mode, reduce_only_mode').single();
        
        if (settings?.global_kill_switch) {
          console.log('[TRADING GATE] Order blocked: Kill switch active');
          return new Response(JSON.stringify({ error: 'Trading is halted - kill switch is active' }), { status: 403, headers: corsHeaders });
        }

        // Check book status
        const { data: book } = await supabase.from('books').select('status, capital_allocated, current_exposure').eq('id', book_id).single();
        if (!book) {
          return new Response(JSON.stringify({ error: 'Book not found' }), { status: 404, headers: corsHeaders });
        }
        if (book.status === 'halted' || book.status === 'frozen') {
          console.log(`[TRADING GATE] Order blocked: Book is ${book.status}`);
          return new Response(JSON.stringify({ error: `Book is ${book.status} - cannot place orders` }), { status: 403, headers: corsHeaders });
        }

        // Check for existing position (for reduce-only logic)
        const { data: existingPosition } = await supabase
          .from('positions')
          .select('side, size')
          .eq('book_id', book_id)
          .eq('instrument', instrument)
          .eq('is_open', true)
          .single();

        // CRITICAL: Reducing means opposite side AND size <= existing position size
        // A flip (e.g., closing long and going short) is NOT reducing
        const isReducingPosition = existingPosition && 
          existingPosition.side !== side && 
          size <= (existingPosition.size || 0);

        // Enforce reduce-only mode
        if (settings?.reduce_only_mode || book.status === 'reduce_only') {
          if (!isReducingPosition) {
            console.log('[TRADING GATE] Order blocked: Reduce-only mode, not a reducing order');
            return new Response(JSON.stringify({ 
              error: 'Only position-reducing trades are allowed in reduce-only mode',
              reduce_only_mode: true
            }), { status: 403, headers: corsHeaders });
          }
        }

        // CRITICAL: Resolve market price - NEVER use price || 0
        let resolvedPrice = price;
        if (!resolvedPrice || resolvedPrice <= 0) {
          // Try to fetch live price from Binance
          try {
            const binanceSymbol = instrument.replace(/[/-]/g, '').toUpperCase();
            const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              resolvedPrice = parseFloat(priceData.price);
              console.log(`[PRICE RESOLUTION] Fetched ${instrument} price: ${resolvedPrice}`);
            }
          } catch (e) {
            console.error('[PRICE RESOLUTION] Binance fetch failed:', e);
          }
        }

        // Reject if price still not resolved
        if (!resolvedPrice || resolvedPrice <= 0) {
          console.log('[TRADING GATE] Order rejected: Unable to resolve price');
          return new Response(JSON.stringify({ 
            error: 'Unable to resolve market price - cannot calculate risk. Please provide a price or try again.',
            price_required: true
          }), { status: 400, headers: corsHeaders });
        }

        // Calculate notional with RESOLVED price (never 0)
        const notional = size * resolvedPrice;
        
        // CRITICAL: Side-aware exposure calculation
        // Buys ADD to exposure, sells SUBTRACT (reduce exposure)
        // For existing positions, closing reduces exposure
        let exposureDelta = notional;
        if (side === 'sell' || isReducingPosition) {
          exposureDelta = -notional; // Sells reduce exposure
        }
        
        const newExposure = Number(book.current_exposure) + exposureDelta;
        const maxExposure = Number(book.capital_allocated) * 2; // 2x leverage max

        // Skip exposure check for reducing positions
        if (!isReducingPosition && newExposure > maxExposure) {
          console.log(`[TRADING GATE] Order rejected: Exposure limit exceeded (${newExposure} > ${maxExposure})`);
          return new Response(JSON.stringify({ 
            error: 'Order would exceed exposure limits',
            current_exposure: book.current_exposure,
            max_exposure: maxExposure,
            requested_notional: notional,
            exposure_delta: exposureDelta
          }), { status: 403, headers: corsHeaders });
        }

        const orderId = crypto.randomUUID();
        const isPaperMode = settings?.paper_trading_mode ?? true;
        
        // Use resolved price for simulation
        const simulatedSlippage = Math.random() * 0.002; // 0-0.2% slippage
        const fillPrice = side === 'buy' ? resolvedPrice * (1 + simulatedSlippage) : resolvedPrice * (1 - simulatedSlippage);
        
        const orderData = {
          id: orderId,
          book_id,
          strategy_id: strategy_id || null,
          venue_id: venue_id || null,
          instrument,
          side,
          size,
          price: resolvedPrice,
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