-- Account deletion support: cooling-off period and deactivation
-- Adds deactivated_at and deletion_scheduled_at columns to profiles
-- Creates RPC for scheduling account deletion with 7-day cooling-off

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'deactivated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deactivated_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'deletion_scheduled_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN deletion_scheduled_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'company'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN company text DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'timezone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN timezone text DEFAULT 'UTC';
  END IF;
END $$;

-- RPC: Schedule account deletion with 7-day cooling-off
CREATE OR REPLACE FUNCTION public.schedule_account_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is the account owner
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only delete your own account';
  END IF;

  UPDATE public.profiles
  SET
    deactivated_at = now(),
    deletion_scheduled_at = now() + interval '7 days',
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- RPC: Cancel account deletion (during cooling-off period)
CREATE OR REPLACE FUNCTION public.cancel_account_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
  SET
    deactivated_at = NULL,
    deletion_scheduled_at = NULL,
    updated_at = now()
  WHERE id = p_user_id
    AND deletion_scheduled_at > now(); -- Can only cancel during cooling-off
END;
$$;
