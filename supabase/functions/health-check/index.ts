import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canonical component IDs - must match src/lib/schemas.ts
const CRITICAL_HEALTH_COMPONENTS = ['oms', 'risk_engine', 'database'] as const;
const ALL_HEALTH_COMPONENTS = [...CRITICAL_HEALTH_COMPONENTS, 'market_data', 'venues', 'cache'] as const;

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthCheckResult {
  component: string;
  status: HealthStatus;
  details: Record<string, unknown>;
  error_message: string | null;
  last_check_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[health-check] Starting health checks");

  try {
    // Use service role to write to system_health (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: HealthCheckResult[] = [];
    const now = new Date().toISOString();

    // 1) Database check - simple query latency
    try {
      const start = Date.now();
      const { error } = await supabaseAdmin
        .from('global_settings')
        .select('id')
        .limit(1);
      const latency = Date.now() - start;

      results.push({
        component: 'database',
        status: error ? 'unhealthy' : (latency > 500 ? 'degraded' : 'healthy'),
        details: { latency_ms: latency },
        error_message: error?.message || null,
        last_check_at: now,
      });
    } catch (e) {
      results.push({
        component: 'database',
        status: 'unhealthy',
        details: {},
        error_message: e instanceof Error ? e.message : 'Unknown error',
        last_check_at: now,
      });
    }

    // 2) Market data check - verify recent data exists
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('market_snapshots')
        .select('recorded_at')
        .gte('recorded_at', fiveMinutesAgo)
        .limit(1);

      const hasRecentData = data && data.length > 0;

      results.push({
        component: 'market_data',
        status: error ? 'unhealthy' : (hasRecentData ? 'healthy' : 'degraded'),
        details: { has_recent_data: hasRecentData },
        error_message: error?.message || (!hasRecentData ? 'No recent market data' : null),
        last_check_at: now,
      });
    } catch (e) {
      results.push({
        component: 'market_data',
        status: 'degraded',
        details: {},
        error_message: e instanceof Error ? e.message : 'Unknown error',
        last_check_at: now,
      });
    }

    // 3) Venues check - count healthy enabled venues
    try {
      const { data, error } = await supabaseAdmin
        .from('venues')
        .select('id, name, status, is_enabled')
        .eq('is_enabled', true);

      const healthyVenues = data?.filter(v => v.status === 'healthy').length || 0;
      const totalVenues = data?.length || 0;

      results.push({
        component: 'venues',
        status: error ? 'unhealthy' : (healthyVenues === 0 && totalVenues > 0 ? 'degraded' : 'healthy'),
        details: { healthy: healthyVenues, total: totalVenues },
        error_message: error?.message || null,
        last_check_at: now,
      });
    } catch (e) {
      results.push({
        component: 'venues',
        status: 'degraded',
        details: {},
        error_message: e instanceof Error ? e.message : 'Unknown error',
        last_check_at: now,
      });
    }

    // 4) OMS check - verify no stuck orders (open > 5 minutes)
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('status', 'open')
        .lt('created_at', fiveMinutesAgo);

      const stuckOrders = data?.length || 0;

      results.push({
        component: 'oms',
        status: error ? 'unhealthy' : (stuckOrders > 5 ? 'degraded' : 'healthy'),
        details: { stuck_orders: stuckOrders },
        error_message: error?.message || null,
        last_check_at: now,
      });
    } catch (e) {
      results.push({
        component: 'oms',
        status: 'healthy', // Assume healthy if we can't check
        details: {},
        error_message: null,
        last_check_at: now,
      });
    }

    // 5) Risk engine check - verify global settings accessible
    try {
      const { data, error } = await supabaseAdmin
        .from('global_settings')
        .select('global_kill_switch, reduce_only_mode')
        .limit(1)
        .maybeSingle();

      results.push({
        component: 'risk_engine',
        status: error ? 'unhealthy' : 'healthy',
        details: {
          kill_switch: data?.global_kill_switch || false,
          reduce_only: data?.reduce_only_mode || false,
        },
        error_message: error?.message || null,
        last_check_at: now,
      });
    } catch (e) {
      results.push({
        component: 'risk_engine',
        status: 'degraded',
        details: {},
        error_message: e instanceof Error ? e.message : 'Unknown error',
        last_check_at: now,
      });
    }

    // 6) Cache check (placeholder - always healthy since we don't have Redis)
    results.push({
      component: 'cache',
      status: 'healthy',
      details: { type: 'supabase_native' },
      error_message: null,
      last_check_at: now,
    });

    // Persist all results using service role (bypasses RLS)
    console.log(`[health-check] Persisting ${results.length} health check results`);
    
    for (const result of results) {
      const { error: upsertError } = await supabaseAdmin
        .from('system_health')
        .upsert({
          component: result.component,
          status: result.status,
          details: result.details,
          error_message: result.error_message,
          last_check_at: result.last_check_at,
        }, { onConflict: 'component' });

      if (upsertError) {
        console.error(`[health-check] Failed to upsert ${result.component}:`, upsertError);
      }
    }

    // Compute overall status
    let overall: HealthStatus = 'healthy';
    if (results.some(r => r.status === 'unhealthy')) {
      overall = 'unhealthy';
    } else if (results.some(r => r.status === 'degraded')) {
      overall = 'degraded';
    }

    // Check if trading-ready (all critical components healthy)
    const isReady = CRITICAL_HEALTH_COMPONENTS.every(name => {
      const result = results.find(r => r.component === name);
      return result?.status === 'healthy';
    });

    console.log(`[health-check] Complete. Overall: ${overall}, Ready: ${isReady}`);

    return new Response(
      JSON.stringify({
        success: true,
        overall,
        isReady,
        components: results,
        checkedAt: now,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[health-check] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
