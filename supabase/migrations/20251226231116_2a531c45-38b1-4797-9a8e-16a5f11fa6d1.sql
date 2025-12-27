-- =============================================
-- SECURITY FIXES: Remove duplicate permissive policies
-- =============================================

-- Remove overly broad policies that conflict with role-based ones

-- Profiles: remove the broad "authenticated users" policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- User roles: remove broad policy
DROP POLICY IF EXISTS "User roles viewable by authenticated" ON public.user_roles;

-- Orders: remove broad policy  
DROP POLICY IF EXISTS "Orders viewable by authenticated" ON public.orders;

-- Positions: remove broad policy
DROP POLICY IF EXISTS "Positions viewable by authenticated" ON public.positions;

-- Fills: remove broad policy
DROP POLICY IF EXISTS "Fills viewable by authenticated" ON public.fills;

-- Strategies: remove broad policy
DROP POLICY IF EXISTS "Strategies viewable by authenticated" ON public.strategies;

-- Trade intents: remove broad policy
DROP POLICY IF EXISTS "Trade intents viewable by authenticated" ON public.trade_intents;

-- Audit events: remove broad policy (should be auditors only)
DROP POLICY IF EXISTS "Audit events viewable by authenticated" ON public.audit_events;

-- Risk breaches: remove broad policy
DROP POLICY IF EXISTS "Risk breaches viewable by authenticated" ON public.risk_breaches;

-- Books: remove broad policy
DROP POLICY IF EXISTS "Books viewable by authenticated" ON public.books;

-- Global settings: remove broad policy
DROP POLICY IF EXISTS "Global settings viewable by authenticated" ON public.global_settings;

-- Wallets: restrict to admin/CIO only (sensitive financial data)
DROP POLICY IF EXISTS "Wallets viewable by authenticated" ON public.wallets;
CREATE POLICY "Wallets viewable by admin and CIO"
ON public.wallets
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Agents: restrict to ops/admin only (system architecture)
DROP POLICY IF EXISTS "Agents viewable by authenticated" ON public.agents;
CREATE POLICY "Agents viewable by ops and admin"
ON public.agents
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Book budgets: restrict to traders and above
DROP POLICY IF EXISTS "Book budgets viewable by authenticated" ON public.book_budgets;
CREATE POLICY "Book budgets viewable by traders and above"
ON public.book_budgets
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- Circuit breaker events: restrict to ops/admin
DROP POLICY IF EXISTS "Circuit breaker events viewable by authenticated" ON public.circuit_breaker_events;
CREATE POLICY "Circuit breaker events viewable by ops and admin"
ON public.circuit_breaker_events
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Deployments: restrict to traders and above
DROP POLICY IF EXISTS "Deployments viewable by authenticated" ON public.deployments;
CREATE POLICY "Deployments viewable by traders and above"
ON public.deployments
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'research'::app_role])
);

-- Risk limits: restrict to traders and above
DROP POLICY IF EXISTS "Risk limits viewable by authenticated" ON public.risk_limits;
CREATE POLICY "Risk limits viewable by traders and above"
ON public.risk_limits
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- Venues: restrict to traders and above
DROP POLICY IF EXISTS "Venues viewable by authenticated" ON public.venues;
CREATE POLICY "Venues viewable by traders and above"
ON public.venues
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role, 'research'::app_role])
);

-- Notification channels: restrict to admin/ops
DROP POLICY IF EXISTS "Notification channels viewable by authenticated" ON public.notification_channels;
CREATE POLICY "Notification channels viewable by admin and ops"
ON public.notification_channels
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Notification logs: restrict to admin/ops  
DROP POLICY IF EXISTS "Notification logs viewable by authenticated" ON public.notification_logs;
CREATE POLICY "Notification logs viewable by admin and ops"
ON public.notification_logs
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role, 'auditor'::app_role])
);

-- Meme projects: restrict to traders and above
DROP POLICY IF EXISTS "Meme projects viewable by authenticated" ON public.meme_projects;
CREATE POLICY "Meme projects viewable by traders and above"
ON public.meme_projects
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'research'::app_role])
);

-- Meme tasks: restrict to ops and above
DROP POLICY IF EXISTS "Meme tasks viewable by authenticated" ON public.meme_tasks;
CREATE POLICY "Meme tasks viewable by ops and above"
ON public.meme_tasks
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Alerts: restrict to ops and above (not all authenticated)
DROP POLICY IF EXISTS "Alerts viewable by authenticated" ON public.alerts;
CREATE POLICY "Alerts viewable by ops and above"
ON public.alerts
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role, 'trader'::app_role])
);