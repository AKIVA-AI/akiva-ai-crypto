/**
 * Tenant Guard - Multi-tenant RLS enforcement utilities
 * 
 * This module provides utilities for enforcing tenant isolation
 * in edge functions. All edge functions should use these guards
 * to ensure they respect tenant_id.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
  userId: string;
  tenantId: string;
  email?: string;
}

/**
 * Require tenant_id for the current user
 * Throws if user has no tenant
 */
export async function requireTenantId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('current_tenant_id');
  
  if (error) {
    console.error('[Tenant Guard] RPC error:', error);
    throw new Error('Failed to get tenant_id');
  }
  
  if (!data) {
    throw new Error('Unauthorized: No tenant_id found for user. User must be assigned to a tenant.');
  }
  
  return data;
}

/**
 * Require authentication and tenant_id
 * Returns both userId and tenantId
 */
export async function requireAuth(supabase: SupabaseClient): Promise<AuthContext> {
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    console.error('[Tenant Guard] Auth error:', authError);
    throw new Error('Unauthorized: Authentication failed');
  }
  
  if (!user) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  // Get tenant_id
  const tenantId = await requireTenantId(supabase);
  
  return {
    userId: user.id,
    tenantId,
    email: user.email,
  };
}

/**
 * Validate that a resource belongs to the current tenant
 * Use this when accepting resource IDs from the client
 */
export async function validateTenantResource(
  supabase: SupabaseClient,
  table: string,
  resourceId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('tenant_id')
      .eq('id', resourceId)
      .single();

    if (error) {
      console.error('[Tenant Guard] Resource validation error:', error);
      return false;
    }

    return data?.tenant_id === tenantId;
  } catch (error) {
    console.error('[Tenant Guard] Resource validation failed:', error);
    return false;
  }
}

/**
 * Create a tenant-scoped query builder
 * Automatically adds tenant_id filter
 */
export function tenantQuery<T = any>(
  supabase: SupabaseClient,
  table: string,
  tenantId: string
) {
  return supabase
    .from(table)
    .select<'*', T>('*')
    .eq('tenant_id', tenantId);
}

/**
 * Check if user has required role within their tenant
 */
export async function requireRole(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  requiredRoles: string[]
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      console.error('[Tenant Guard] Role check error:', error);
      return false;
    }

    return requiredRoles.includes(data.role);
  } catch (error) {
    console.error('[Tenant Guard] Role check failed:', error);
    return false;
  }
}

/**
 * Middleware-style tenant guard for edge functions
 * Returns a Response if unauthorized, null if authorized
 */
export async function tenantGuard(
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<{ auth: AuthContext; error: null } | { auth: null; error: Response }> {
  try {
    const auth = await requireAuth(supabase);
    return { auth, error: null };
  } catch (error) {
    console.error('[Tenant Guard] Authorization failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authorization failed';
    return {
      auth: null,
      error: new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      ),
    };
  }
}
