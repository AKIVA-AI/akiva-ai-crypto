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

    // Check role - Admin, CIO, or Ops can freeze books
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'cio', 'ops']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Requires Admin, CIO, or Ops role.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { book_id, frozen, reason } = await req.json();
    
    if (!book_id || typeof frozen !== 'boolean') {
      return new Response(JSON.stringify({ error: 'book_id and frozen (boolean) are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current book state
    const { data: currentBook, error: fetchError } = await supabaseClient
      .from('books')
      .select('*')
      .eq('id', book_id)
      .single();

    if (fetchError || !currentBook) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const beforeState = { status: currentBook.status };
    const newStatus = frozen ? 'halted' : 'active';

    // Update book status
    const { data: updatedBook, error: updateError } = await supabaseClient
      .from('books')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', book_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to freeze book' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create audit event
    await supabaseClient.from('audit_events').insert({
      action: frozen ? 'book_frozen' : 'book_unfrozen',
      resource_type: 'book',
      resource_id: book_id,
      user_id: user.id,
      user_email: user.email,
      book_id: book_id,
      before_state: beforeState,
      after_state: { status: newStatus, reason },
      severity: frozen ? 'warning' : 'info',
    });

    // Create alert for freeze events
    if (frozen) {
      await supabaseClient.from('alerts').insert({
        title: `Book Frozen: ${currentBook.name}`,
        message: reason || 'Book has been frozen by operator',
        severity: 'warning',
        source: 'freeze-book',
        metadata: { book_id, frozen_by: user.email },
      });
    }

    console.log(`Book ${book_id} ${frozen ? 'frozen' : 'unfrozen'} by ${user.email}`);

    return new Response(JSON.stringify({ success: true, book: updatedBook }), {
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
