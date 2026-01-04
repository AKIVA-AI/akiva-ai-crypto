/**
 * OMS Client - Shared utilities for intent-based order management
 * 
 * This module provides utilities for creating trade intents instead of
 * directly writing to orders/fills tables. All execution flows should
 * emit intents that are picked up by the OMS backend service.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface LegDefinition {
  venue: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price?: number;
  order_type?: 'market' | 'limit';
  reduce_only?: boolean;
}

export interface TradeIntent {
  tenant_id: string;
  intent_id: string;
  legs_json: {
    [key: string]: LegDefinition;
  };
  status: 'pending' | 'submitted' | 'filled' | 'cancelled' | 'failed';
  idempotency_key?: string;
}

/**
 * Create a multi-leg trade intent
 * This is the ONLY way edge functions should initiate trades
 */
export async function createMultiLegIntent(
  supabase: SupabaseClient,
  intent: Omit<TradeIntent, 'created_at'>
): Promise<{ intent_id: string; error?: string }> {
  try {
    // Validate tenant_id
    if (!intent.tenant_id) {
      throw new Error('tenant_id is required');
    }

    // Validate intent_id
    if (!intent.intent_id) {
      throw new Error('intent_id is required');
    }

    // Validate legs
    if (!intent.legs_json || Object.keys(intent.legs_json).length === 0) {
      throw new Error('At least one leg is required');
    }

    // Insert intent
    const { data, error } = await supabase
      .from('multi_leg_intents')
      .insert({
        tenant_id: intent.tenant_id,
        intent_id: intent.intent_id,
        legs_json: intent.legs_json,
        status: intent.status || 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate idempotency key
      if (error.code === '23505' && intent.idempotency_key) {
        console.log('[OMS Client] Duplicate idempotency key, intent already exists');
        return { intent_id: intent.intent_id, error: 'DUPLICATE_INTENT' };
      }
      throw error;
    }

    console.log('[OMS Client] Intent created:', data.intent_id);
    return { intent_id: data.intent_id };
  } catch (error) {
    console.error('[OMS Client] Failed to create intent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return { intent_id: '', error: errorMessage };
  }
}

/**
 * Get the current user's tenant_id
 * This should be called at the start of every edge function
 */
export async function getTenantId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('current_tenant_id');
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[OMS Client] Failed to get tenant_id:', error);
    return null;
  }
}

/**
 * Log an audit event
 * All risk actions should be logged
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  event: {
    tenant_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    after_state: any;
    user_id?: string;
  }
): Promise<void> {
  try {
    await supabase.from('audit_events').insert({
      ...event,
      created_at: new Date().toISOString(),
    });
    console.log('[OMS Client] Audit event logged:', event.action);
  } catch (error) {
    console.error('[OMS Client] Failed to log audit event:', error);
    // Don't throw - audit logging failure shouldn't break the main flow
  }
}

/**
 * Generate an idempotency key
 * Format: {operation}_{symbol}_{timestamp}
 */
export function generateIdempotencyKey(operation: string, symbol: string): string {
  return `${operation}_${symbol}_${Date.now()}`;
}

/**
 * Check if an intent with the same idempotency key already exists
 */
export async function checkIdempotency(
  supabase: SupabaseClient,
  tenant_id: string,
  idempotency_key: string
): Promise<{ exists: boolean; intent_id?: string }> {
  try {
    const { data, error } = await supabase
      .from('multi_leg_intents')
      .select('intent_id')
      .eq('tenant_id', tenant_id)
      .eq('idempotency_key', idempotency_key)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return {
      exists: !!data,
      intent_id: data?.intent_id,
    };
  } catch (error) {
    console.error('[OMS Client] Failed to check idempotency:', error);
    return { exists: false };
  }
}
