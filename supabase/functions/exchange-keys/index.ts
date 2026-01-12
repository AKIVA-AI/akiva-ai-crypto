/**
 * Exchange Keys Edge Function
 *
 * Securely manages exchange API keys with server-side encryption.
 * Supports: create, update, delete operations on user_exchange_keys table.
 *
 * Security:
 * - Uses AES-256 encryption via pgcrypto
 * - Encryption key stored in Supabase secrets
 * - Rate limited operations
 * - Full audit logging
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getSecureCorsHeaders,
  validateAuth,
  rateLimitMiddleware,
  RATE_LIMITS,
} from "../_shared/security.ts";

// Get encryption key from environment (stored in Supabase secrets)
const getEncryptionKey = (): string => {
  const key = Deno.env.get('EXCHANGE_KEY_ENCRYPTION_KEY');
  if (!key) {
    throw new Error('EXCHANGE_KEY_ENCRYPTION_KEY not configured');
  }
  return key;
};

// Validate exchange type
const VALID_EXCHANGES = ['coinbase', 'kraken', 'binance', 'bybit', 'okx', 'mexc', 'hyperliquid'];

// Validate permissions
const VALID_PERMISSIONS = ['read', 'trade', 'withdraw'];

interface AddKeyRequest {
  exchange: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  permissions: string[];
}

interface UpdateKeyRequest {
  id: string;
  label?: string;
  permissions?: string[];
  is_active?: boolean;
}

interface DeleteKeyRequest {
  id: string;
}

serve(async (req) => {
  const corsHeaders = getSecureCorsHeaders(req.headers.get('Origin'));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for encryption functions
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    const { user, error: authError } = await validateAuth(supabase, authHeader);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: authError || 'Authentication failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Apply rate limiting (10 key operations per minute)
    const rateLimitResponse = rateLimitMiddleware(user.id, RATE_LIMITS.validate, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse request
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'list': {
        // Fetch keys for the authenticated user (no encrypted data returned)
        const { data: keyList, error: listError } = await supabase
          .from('user_exchange_keys')
          .select('id, user_id, exchange, label, permissions, is_active, is_validated, last_validated_at, validation_error, created_at, updated_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (listError) {
          throw new Error(`Failed to fetch keys: ${listError.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, keys: keyList || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'add': {
        const params: AddKeyRequest = body;
        
        // Validate required fields
        if (!params.exchange || !params.label || !params.apiKey || !params.apiSecret) {
          throw new Error('Missing required fields: exchange, label, apiKey, apiSecret');
        }

        // Validate exchange
        if (!VALID_EXCHANGES.includes(params.exchange)) {
          throw new Error(`Invalid exchange. Must be one of: ${VALID_EXCHANGES.join(', ')}`);
        }

        // Validate permissions
        const permissions = params.permissions || ['read'];
        for (const perm of permissions) {
          if (!VALID_PERMISSIONS.includes(perm)) {
            throw new Error(`Invalid permission: ${perm}. Must be one of: ${VALID_PERMISSIONS.join(', ')}`);
          }
        }

        // Validate label length
        if (params.label.length > 100) {
          throw new Error('Label must be 100 characters or less');
        }

        // Encrypt credentials using database function
        const encryptionKey = getEncryptionKey();
        
        const { data: encryptedApiKey, error: encApiKeyErr } = await supabase
          .rpc('encrypt_api_key', { plaintext: params.apiKey, encryption_key: encryptionKey });
        
        if (encApiKeyErr) throw new Error('Failed to encrypt API key');

        const { data: encryptedApiSecret, error: encApiSecretErr } = await supabase
          .rpc('encrypt_api_key', { plaintext: params.apiSecret, encryption_key: encryptionKey });
        
        if (encApiSecretErr) throw new Error('Failed to encrypt API secret');

        let encryptedPassphrase = null;
        if (params.passphrase) {
          const { data: encPass, error: encPassErr } = await supabase
            .rpc('encrypt_api_key', { plaintext: params.passphrase, encryption_key: encryptionKey });
          
          if (encPassErr) throw new Error('Failed to encrypt passphrase');
          encryptedPassphrase = encPass;
        }

        // Insert the encrypted key
        const { data: newKey, error: insertError } = await supabase
          .from('user_exchange_keys')
          .insert({
            user_id: user.id,
            exchange: params.exchange,
            label: params.label,
            api_key_encrypted: encryptedApiKey,
            api_secret_encrypted: encryptedApiSecret,
            passphrase_encrypted: encryptedPassphrase,
            permissions: permissions,
            encryption_version: 1,
          })
          .select('id, exchange, label, permissions, is_active, is_validated, created_at, updated_at')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            throw new Error(`An API key with label "${params.label}" already exists for this exchange`);
          }
          throw new Error(`Failed to save key: ${insertError.message}`);
        }

        // Log the audit event
        await supabase.from('exchange_key_audit_log').insert({
          user_id: user.id,
          exchange: params.exchange,
          action: 'created',
          metadata: { keyId: newKey.id, label: params.label },
        });

        return new Response(
          JSON.stringify({ success: true, key: newKey }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 }
        );
      }

      case 'update': {
        const params: UpdateKeyRequest = body;
        
        if (!params.id) {
          throw new Error('Missing required field: id');
        }

        // Build update object
        const updates: Record<string, unknown> = {};
        
        if (params.label !== undefined) {
          if (params.label.length > 100) {
            throw new Error('Label must be 100 characters or less');
          }
          updates.label = params.label;
        }

        if (params.permissions !== undefined) {
          for (const perm of params.permissions) {
            if (!VALID_PERMISSIONS.includes(perm)) {
              throw new Error(`Invalid permission: ${perm}`);
            }
          }
          updates.permissions = params.permissions;
        }

        if (params.is_active !== undefined) {
          updates.is_active = params.is_active;
        }

        if (Object.keys(updates).length === 0) {
          throw new Error('No valid fields to update');
        }

        // Update the key (RLS ensures user can only update their own)
        const { data: updatedKey, error: updateError } = await supabase
          .from('user_exchange_keys')
          .update(updates)
          .eq('id', params.id)
          .eq('user_id', user.id)
          .select('id, exchange, label, permissions, is_active, is_validated, created_at, updated_at')
          .single();

        if (updateError || !updatedKey) {
          throw new Error('Key not found or update failed');
        }

        // Log the audit event
        await supabase.from('exchange_key_audit_log').insert({
          user_id: user.id,
          exchange: updatedKey.exchange,
          action: 'updated',
          metadata: { keyId: params.id, updates },
        });

        return new Response(
          JSON.stringify({ success: true, key: updatedKey }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      case 'delete': {
        const params: DeleteKeyRequest = body;
        
        if (!params.id) {
          throw new Error('Missing required field: id');
        }

        // Get the key first for audit logging
        const { data: keyToDelete, error: fetchError } = await supabase
          .from('user_exchange_keys')
          .select('id, exchange, label')
          .eq('id', params.id)
          .eq('user_id', user.id)
          .single();

        if (fetchError || !keyToDelete) {
          throw new Error('Key not found');
        }

        // Delete the key
        const { error: deleteError } = await supabase
          .from('user_exchange_keys')
          .delete()
          .eq('id', params.id)
          .eq('user_id', user.id);

        if (deleteError) {
          throw new Error(`Failed to delete key: ${deleteError.message}`);
        }

        // Log the audit event
        await supabase.from('exchange_key_audit_log').insert({
          user_id: user.id,
          exchange: keyToDelete.exchange,
          action: 'deleted',
          metadata: { keyId: params.id, label: keyToDelete.label },
        });

        return new Response(
          JSON.stringify({ success: true, deleted: params.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}. Use 'add', 'update', or 'delete'`);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
