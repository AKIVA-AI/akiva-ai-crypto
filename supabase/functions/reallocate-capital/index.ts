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
    
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check role - only Admin/CIO can reallocate capital
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'cio']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Requires Admin or CIO role.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { book_id, new_capital } = await req.json();
    
    if (!book_id || typeof new_capital !== 'number') {
      return new Response(JSON.stringify({ error: 'book_id and new_capital are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current book state for audit
    const { data: currentBook, error: fetchError } = await supabaseClient
      .from('books')
      .select('*')
      .eq('id', book_id)
      .single();

    if (fetchError || !currentBook) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const beforeState = { capital_allocated: currentBook.capital_allocated };

    // Update book capital
    const { data: updatedBook, error: updateError } = await supabaseClient
      .from('books')
      .update({ capital_allocated: new_capital, updated_at: new Date().toISOString() })
      .eq('id', book_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update book' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create audit event
    await supabaseClient.from('audit_events').insert({
      action: 'capital_reallocated',
      resource_type: 'book',
      resource_id: book_id,
      user_id: user.id,
      user_email: user.email,
      book_id: book_id,
      before_state: beforeState,
      after_state: { capital_allocated: new_capital },
      severity: 'info',
    });

    console.log(`Capital reallocated for book ${book_id}: ${beforeState.capital_allocated} -> ${new_capital} by ${user.email}`);

    return new Response(JSON.stringify({ success: true, book: updatedBook }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
