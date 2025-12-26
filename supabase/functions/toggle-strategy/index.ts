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

    // Check role - Admin, CIO, or Trader can toggle strategies
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'cio', 'trader']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Requires Admin, CIO, or Trader role.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { strategy_id, target_status } = await req.json();
    
    if (!strategy_id) {
      return new Response(JSON.stringify({ error: 'strategy_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current strategy
    const { data: currentStrategy, error: fetchError } = await supabaseClient
      .from('strategies')
      .select('*')
      .eq('id', strategy_id)
      .single();

    if (fetchError || !currentStrategy) {
      return new Response(JSON.stringify({ error: 'Strategy not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const beforeState = { status: currentStrategy.status };
    
    // Determine new status (cycle: off -> paper -> live -> off, or use target_status)
    let newStatus = target_status;
    if (!target_status) {
      const statusCycle: Record<string, string> = { off: 'paper', paper: 'live', live: 'off' };
      newStatus = statusCycle[currentStrategy.status as string] || 'off';
    }

    // Validate status
    if (!['off', 'paper', 'live'].includes(newStatus)) {
      return new Response(JSON.stringify({ error: 'Invalid status. Must be off, paper, or live.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update strategy
    const { data: updatedStrategy, error: updateError } = await supabaseClient
      .from('strategies')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', strategy_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update strategy' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create audit event
    await supabaseClient.from('audit_events').insert({
      action: 'strategy_status_changed',
      resource_type: 'strategy',
      resource_id: strategy_id,
      user_id: user.id,
      user_email: user.email,
      book_id: currentStrategy.book_id,
      before_state: beforeState,
      after_state: { status: newStatus },
      severity: newStatus === 'live' ? 'warning' : 'info',
    });

    // Alert when going live
    if (newStatus === 'live' && beforeState.status !== 'live') {
      await supabaseClient.from('alerts').insert({
        title: `Strategy Activated: ${currentStrategy.name}`,
        message: `Strategy ${currentStrategy.name} is now LIVE`,
        severity: 'warning',
        source: 'toggle-strategy',
        metadata: { strategy_id, activated_by: user.email },
      });
    }

    console.log(`Strategy ${strategy_id} status changed: ${beforeState.status} -> ${newStatus} by ${user.email}`);

    return new Response(JSON.stringify({ success: true, strategy: updatedStrategy }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
