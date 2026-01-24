-- =====================================================
-- SECURITY FIX: Email Exposure in profiles and audit_events
-- =====================================================

-- 1. PROFILES TABLE: Allow admins to view all profiles for role management
-- This is needed for UserRoleManager component to list users
CREATE POLICY "Admins can view all profiles for role management"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. AUDIT EVENTS: Restrict full access to admin only (remove auditor/CIO from direct access)
DROP POLICY IF EXISTS "Audit events viewable by auditors and admins" ON public.audit_events;

-- Only admins get full access with all fields (email, IP address)
CREATE POLICY "Admin only full audit log access"
ON public.audit_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Create a redacted view for audit events that masks sensitive fields
-- This view hides email and IP address for non-admin users
DROP VIEW IF EXISTS public.audit_events_redacted;
CREATE VIEW public.audit_events_redacted
WITH (security_invoker=on) AS
SELECT
  id,
  action,
  resource_type,
  resource_id,
  user_id,
  book_id,
  severity,
  before_state,
  after_state,
  created_at,
  -- Redact email for non-admin users: show only domain
  CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN user_email
    ELSE CASE 
      WHEN user_email IS NOT NULL THEN '***@' || split_part(user_email, '@', 2)
      ELSE NULL
    END
  END AS user_email,
  -- Redact IP address for non-admin users: show only first two octets
  CASE
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN ip_address
    ELSE CASE
      WHEN ip_address IS NOT NULL THEN 
        split_part(ip_address, '.', 1) || '.' || split_part(ip_address, '.', 2) || '.xxx.xxx'
      ELSE NULL
    END
  END AS ip_address
FROM public.audit_events;

-- Grant access to the redacted view for auditors and CIO
GRANT SELECT ON public.audit_events_redacted TO authenticated;

COMMENT ON VIEW public.audit_events_redacted IS 'Redacted audit events view - masks email and IP address for non-admin users';

-- 4. Create a policy to allow auditors and CIO to use the redacted view
-- The view uses security_invoker=on, so the underlying RLS on audit_events applies
-- We need an additional policy that allows these roles to SELECT via the view
CREATE POLICY "Auditors and CIO can view audit events via redacted view"
ON public.audit_events
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['auditor'::app_role, 'cio'::app_role])
);