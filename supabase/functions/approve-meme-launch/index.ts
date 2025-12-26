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

    // Check role - Only Admin or CIO can approve meme launches
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

    const { project_id, approved, notes } = await req.json();
    
    if (!project_id || typeof approved !== 'boolean') {
      return new Response(JSON.stringify({ error: 'project_id and approved (boolean) are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current project
    const { data: currentProject, error: fetchError } = await supabaseClient
      .from('meme_projects')
      .select('*')
      .eq('id', project_id)
      .single();

    if (fetchError || !currentProject) {
      return new Response(JSON.stringify({ error: 'Meme project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const beforeState = { 
      stage: currentProject.stage, 
      go_no_go_approved: currentProject.go_no_go_approved 
    };

    // Validate stage - must be in due_diligence to approve
    if (approved && currentProject.stage !== 'due_diligence') {
      return new Response(JSON.stringify({ 
        error: `Cannot approve project in ${currentProject.stage} stage. Must be in due_diligence.` 
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamp = new Date().toISOString();
    const newStage = approved ? 'approved' : 'closed';

    // Update project
    const { data: updatedProject, error: updateError } = await supabaseClient
      .from('meme_projects')
      .update({ 
        go_no_go_approved: approved,
        approved_by: approved ? user.id : null,
        stage: newStage,
        updated_at: timestamp
      })
      .eq('id', project_id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update project' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Audit log
    await supabaseClient.from('audit_events').insert({
      action: approved ? 'meme_launch_approved' : 'meme_launch_rejected',
      resource_type: 'meme_project',
      resource_id: project_id,
      user_id: user.id,
      user_email: user.email,
      before_state: beforeState,
      after_state: { stage: newStage, go_no_go_approved: approved, notes },
      severity: approved ? 'warning' : 'info',
    });

    // Alert
    await supabaseClient.from('alerts').insert({
      title: approved 
        ? `✅ Meme Launch Approved: ${currentProject.name} ($${currentProject.ticker})`
        : `❌ Meme Launch Rejected: ${currentProject.name} ($${currentProject.ticker})`,
      message: notes || (approved ? 'Project approved for launch' : 'Project did not pass go/no-go'),
      severity: approved ? 'warning' : 'info',
      source: 'approve-meme-launch',
      metadata: { project_id, ticker: currentProject.ticker, approved_by: user.email },
    });

    // Create completion task for the meme project if approved
    if (approved) {
      await supabaseClient.from('meme_tasks').insert({
        project_id,
        title: 'Execute Launch',
        description: 'Project approved - execute launch sequence',
        category: 'launch',
      });
    }

    console.log(`Meme project ${project_id} ${approved ? 'APPROVED' : 'rejected'} by ${user.email}`);

    return new Response(JSON.stringify({ 
      success: true, 
      project: updatedProject,
      decision: approved ? 'approved' : 'rejected'
    }), {
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
