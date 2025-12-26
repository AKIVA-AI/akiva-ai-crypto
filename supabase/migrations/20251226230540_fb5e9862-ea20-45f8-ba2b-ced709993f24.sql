-- =============================================
-- SECURITY FIXES: P0 Priority - RLS Hardening
-- =============================================

-- 1. FIX: Profiles table - users can only see their OWN profile
-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create restrictive policy: users see only their own profile
CREATE POLICY "Users can only view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2. FIX: Orders table - restrict to trader roles and above
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Orders are viewable by authenticated users" ON public.orders;

-- Create role-based policy for viewing orders
CREATE POLICY "Orders viewable by traders and above"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- 3. FIX: User roles table - restrict visibility
-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "User roles are viewable by authenticated users" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;

-- Create restrictive policy: admins see all, users see only their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4. FIX: Positions table - restrict to trader roles and above
DROP POLICY IF EXISTS "Positions are viewable by authenticated users" ON public.positions;
DROP POLICY IF EXISTS "Authenticated users can view positions" ON public.positions;

CREATE POLICY "Positions viewable by traders and above"
ON public.positions
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- 5. FIX: Strategies table - restrict to appropriate roles
DROP POLICY IF EXISTS "Strategies are viewable by authenticated users" ON public.strategies;
DROP POLICY IF EXISTS "Authenticated users can view strategies" ON public.strategies;

CREATE POLICY "Strategies viewable by research and above"
ON public.strategies
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'research'::app_role])
);

-- 6. FIX: Fills table - restrict trading data
DROP POLICY IF EXISTS "Fills are viewable by authenticated users" ON public.fills;
DROP POLICY IF EXISTS "Authenticated users can view fills" ON public.fills;

CREATE POLICY "Fills viewable by traders and above"
ON public.fills
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- 7. FIX: Trade intents - restrict to traders
DROP POLICY IF EXISTS "Trade intents are viewable by authenticated users" ON public.trade_intents;
DROP POLICY IF EXISTS "Authenticated users can view trade intents" ON public.trade_intents;

CREATE POLICY "Trade intents viewable by traders and above"
ON public.trade_intents
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role])
);

-- 8. FIX: Audit events - restrict to auditors and admins
DROP POLICY IF EXISTS "Audit events are viewable by authenticated users" ON public.audit_events;
DROP POLICY IF EXISTS "Authenticated users can view audit events" ON public.audit_events;

CREATE POLICY "Audit events viewable by auditors and admins"
ON public.audit_events
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'auditor'::app_role, 'cio'::app_role])
);

-- 9. FIX: Risk breaches - restrict to risk-relevant roles
DROP POLICY IF EXISTS "Risk breaches are viewable by authenticated users" ON public.risk_breaches;
DROP POLICY IF EXISTS "Authenticated users can view risk breaches" ON public.risk_breaches;

CREATE POLICY "Risk breaches viewable by risk roles"
ON public.risk_breaches
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role])
);

-- 10. FIX: Books - restrict financial data
DROP POLICY IF EXISTS "Books are viewable by authenticated users" ON public.books;
DROP POLICY IF EXISTS "Authenticated users can view books" ON public.books;

CREATE POLICY "Books viewable by traders and above"
ON public.books
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role, 'research'::app_role])
);

-- 11. FIX: Global settings - admin only
DROP POLICY IF EXISTS "Global settings are viewable by authenticated users" ON public.global_settings;
DROP POLICY IF EXISTS "Authenticated users can view global settings" ON public.global_settings;

CREATE POLICY "Global settings viewable by admins and ops"
ON public.global_settings
FOR SELECT
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role])
);

-- Ensure INSERT/UPDATE/DELETE policies are restrictive for critical tables

-- Orders: only traders can create
DROP POLICY IF EXISTS "Traders can create orders" ON public.orders;
CREATE POLICY "Traders can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role])
);

-- Orders: only traders can update their orders
DROP POLICY IF EXISTS "Traders can update orders" ON public.orders;
CREATE POLICY "Traders can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role])
);

-- Global settings: only admins can update
DROP POLICY IF EXISTS "Admins can update global settings" ON public.global_settings;
CREATE POLICY "Admins can update global settings"
ON public.global_settings
FOR UPDATE
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role])
);

-- User roles: only admins can modify
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);