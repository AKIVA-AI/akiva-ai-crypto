import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check role - Only Admin or CIO can activate kill switch
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'cio']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Requires Admin or CIO role.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { book_id, activate, reason } = await req.json();
    
    if (typeof activate !== 'boolean') {
      return new Response(JSON.stringify({ error: 'activate (boolean) is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamp = new Date().toISOString();

    if (book_id) {
      // Per-book kill switch
      const { data: currentBook } = await supabaseClient
        .from('books')
        .select('*')
        .eq('id', book_id)
        .single();

      if (!currentBook) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const beforeState = { status: currentBook.status };
      const newStatus = activate ? 'halted' : 'active';

      await supabaseClient
        .from('books')
        .update({ status: newStatus, updated_at: timestamp })
        .eq('id', book_id);

      // Also halt all strategies in this book
      if (activate) {
        await supabaseClient
          .from('strategies')
          .update({ status: 'off', updated_at: timestamp })
          .eq('book_id', book_id);
      }

      // Record circuit breaker event
      await supabaseClient.from('circuit_breaker_events').insert({
        book_id,
        trigger_type: 'manual_kill_switch',
        action_taken: activate ? 'book_halted' : 'book_resumed',
        triggered_by: user.id,
        metadata: { reason, user_email: user.email },
      });

      // Audit log
      await supabaseClient.from('audit_events').insert({
        action: activate ? 'kill_switch_activated' : 'kill_switch_deactivated',
        resource_type: 'book',
        resource_id: book_id,
        user_id: user.id,
        user_email: user.email,
        book_id,
        before_state: beforeState,
        after_state: { status: newStatus, reason },
        severity: 'critical',
      });

      // Alert
      await supabaseClient.from('alerts').insert({
        title: activate ? `🚨 KILL SWITCH: ${currentBook.name}` : `Kill Switch Released: ${currentBook.name}`,
        message: reason || (activate ? 'Emergency halt activated' : 'Trading resumed'),
        severity: 'critical',
        source: 'kill-switch',
        metadata: { book_id, activated_by: user.email },
      });

      console.log(`Kill switch ${activate ? 'ACTIVATED' : 'deactivated'} for book ${book_id} by ${user.email}`);

      return new Response(JSON.stringify({ success: true, book_id, status: newStatus }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Global kill switch
      const { data: currentSettings } = await supabaseClient
        .from('global_settings')
        .select('*')
        .limit(1)
        .single();

      const beforeState = { global_kill_switch: currentSettings?.global_kill_switch || false };

      // Update global settings
      await supabaseClient
        .from('global_settings')
        .update({ 
          global_kill_switch: activate, 
          updated_at: timestamp,
          updated_by: user.id 
        });

      // Halt all books if activating
      if (activate) {
        await supabaseClient
          .from('books')
          .update({ status: 'halted', updated_at: timestamp });

        await supabaseClient
          .from('strategies')
          .update({ status: 'off', updated_at: timestamp });
      }

      // Record circuit breaker event
      await supabaseClient.from('circuit_breaker_events').insert({
        trigger_type: 'global_kill_switch',
        action_taken: activate ? 'all_trading_halted' : 'trading_resumed',
        triggered_by: user.id,
        metadata: { reason, user_email: user.email },
      });

      // Audit log
      await supabaseClient.from('audit_events').insert({
        action: activate ? 'global_kill_switch_activated' : 'global_kill_switch_deactivated',
        resource_type: 'global_settings',
        resource_id: 'global',
        user_id: user.id,
        user_email: user.email,
        before_state: beforeState,
        after_state: { global_kill_switch: activate, reason },
        severity: 'critical',
      });

      // Alert
      await supabaseClient.from('alerts').insert({
        title: activate ? '🚨🚨 GLOBAL KILL SWITCH ACTIVATED 🚨🚨' : 'Global Kill Switch Released',
        message: reason || (activate ? 'ALL TRADING HALTED' : 'Trading operations resumed'),
        severity: 'critical',
        source: 'kill-switch',
        metadata: { global: true, activated_by: user.email },
      });

      console.log(`GLOBAL kill switch ${activate ? 'ACTIVATED' : 'deactivated'} by ${user.email}`);

      return new Response(JSON.stringify({ success: true, global: true, active: activate }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
