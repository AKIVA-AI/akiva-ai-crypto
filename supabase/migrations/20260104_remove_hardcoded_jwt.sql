-- =============================================================================
-- Remove Hardcoded JWT Migration
-- Date: 2026-01-04
-- Addresses: P0-2 - Hardcoded JWTs in migrations expose credentials
-- =============================================================================

-- SECURITY CRITICAL:
-- The previous migrations (20260101151820, 20260101151914) contained hardcoded
-- JWT tokens in the cron job setup. These tokens have been exposed in version
-- control and must be rotated.
--
-- ACTION REQUIRED:
-- 1. Rotate the service_role and anon keys in Supabase Dashboard
-- 2. Update all edge functions and clients with new keys
-- 3. This migration removes the insecure cron jobs
-- =============================================================================

-- Remove the insecure cron jobs that contain hardcoded tokens
-- The cron extension stores jobs by name, so we can drop by name
DO $$
BEGIN
  -- Try to unschedule by name first
  PERFORM cron.unschedule('scheduled-health-monitor');
EXCEPTION
  WHEN OTHERS THEN
    -- Job may not exist or may have different ID, try by ID
    BEGIN
      PERFORM cron.unschedule(1);
    EXCEPTION
      WHEN OTHERS THEN
        NULL; -- Ignore if doesn't exist
    END;
END;
$$;

-- =============================================================================
-- Create a secure cron job setup using Supabase Vault
-- The token should be stored in vault, not in migration files
-- =============================================================================

-- First, check if vault extension is available
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Store the anon key in vault (to be set manually via Supabase Dashboard)
-- This creates a placeholder - the actual secret must be set via Dashboard
-- INSERT INTO vault.secrets (name, secret) 
-- VALUES ('supabase_anon_key', 'SET_VIA_DASHBOARD')
-- ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- Create a function to get the anon key from vault
-- This allows cron jobs to use secrets without hardcoding
-- =============================================================================
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  
  RETURN secret_value;
END;
$$;

-- Restrict to service role only
REVOKE ALL ON FUNCTION get_vault_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vault_secret(TEXT) TO service_role;

-- =============================================================================
-- NOTE: After running this migration, you must:
-- 
-- 1. Go to Supabase Dashboard > Settings > Vault
-- 2. Add a secret named 'supabase_anon_key' with your anon key
-- 3. Run this SQL to recreate the cron job securely:
--
-- SELECT cron.schedule(
--   'scheduled-health-monitor',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-monitor',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || get_vault_secret('supabase_anon_key')
--     ),
--     body := '{"task": "all"}'::jsonb
--   );
--   $$
-- );
--
-- 4. CRITICAL: Rotate your Supabase keys in Dashboard > Settings > API
--    The old keys have been exposed in git history
-- =============================================================================

-- Add a comment as a reminder
COMMENT ON EXTENSION supabase_vault IS 
'Used for secure storage of API keys and secrets. 
Store supabase_anon_key here for cron jobs instead of hardcoding.';

