-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cio', 'trader', 'research', 'ops', 'auditor', 'viewer');

-- Create book type enum
CREATE TYPE public.book_type AS ENUM ('HEDGE', 'PROP', 'MEME');

-- Create status enums
CREATE TYPE public.strategy_status AS ENUM ('off', 'paper', 'live');
CREATE TYPE public.venue_status AS ENUM ('healthy', 'degraded', 'offline');
CREATE TYPE public.order_status AS ENUM ('open', 'filled', 'rejected', 'cancelled');
CREATE TYPE public.order_side AS ENUM ('buy', 'sell');
CREATE TYPE public.book_status AS ENUM ('active', 'frozen');
CREATE TYPE public.meme_project_stage AS ENUM ('opportunity', 'build', 'launch', 'post_launch', 'completed');
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, role)
);

-- Books table
CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type book_type NOT NULL,
  capital_allocated DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  current_exposure DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  max_drawdown_limit DECIMAL(5, 2) DEFAULT 10 NOT NULL,
  risk_tier INTEGER DEFAULT 1 NOT NULL,
  status book_status DEFAULT 'active' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Book budgets / risk limits
CREATE TABLE public.risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  max_daily_loss DECIMAL(20, 2) NOT NULL,
  max_intraday_drawdown DECIMAL(5, 2) NOT NULL,
  max_leverage DECIMAL(5, 2) NOT NULL,
  max_concentration DECIMAL(5, 2) NOT NULL,
  max_correlation_exposure DECIMAL(5, 2) DEFAULT 30 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(book_id)
);

-- Strategies table
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  asset_class TEXT DEFAULT 'Crypto' NOT NULL,
  timeframe TEXT NOT NULL,
  risk_tier INTEGER DEFAULT 1 NOT NULL,
  status strategy_status DEFAULT 'off' NOT NULL,
  venue_scope TEXT[] DEFAULT '{}' NOT NULL,
  intent_schema JSONB DEFAULT '{}' NOT NULL,
  config_metadata JSONB DEFAULT '{}' NOT NULL,
  last_signal_time TIMESTAMPTZ,
  pnl DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  max_drawdown DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Strategy signals (mock)
CREATE TABLE public.strategy_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL,
  instrument TEXT NOT NULL,
  direction order_side NOT NULL,
  strength DECIMAL(3, 2) NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Venues table
CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  status venue_status DEFAULT 'healthy' NOT NULL,
  latency_ms INTEGER DEFAULT 50 NOT NULL,
  error_rate DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  fee_tier TEXT DEFAULT 'standard' NOT NULL,
  supported_instruments TEXT[] DEFAULT '{}' NOT NULL,
  max_order_size DECIMAL(20, 2),
  restricted_order_types TEXT[] DEFAULT '{}' NOT NULL,
  is_enabled BOOLEAN DEFAULT true NOT NULL,
  last_heartbeat TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Positions table
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  instrument TEXT NOT NULL,
  side order_side NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  mark_price DECIMAL(20, 8) NOT NULL,
  unrealized_pnl DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  realized_pnl DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  leverage DECIMAL(5, 2) DEFAULT 1 NOT NULL,
  liquidation_price DECIMAL(20, 8),
  is_open BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  instrument TEXT NOT NULL,
  side order_side NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8),
  status order_status DEFAULT 'open' NOT NULL,
  latency_ms INTEGER,
  slippage DECIMAL(10, 4),
  filled_size DECIMAL(20, 8) DEFAULT 0 NOT NULL,
  filled_price DECIMAL(20, 8),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Risk breaches table
CREATE TABLE public.risk_breaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  breach_type TEXT NOT NULL,
  description TEXT NOT NULL,
  current_value DECIMAL(20, 2) NOT NULL,
  limit_value DECIMAL(20, 2) NOT NULL,
  severity alert_severity DEFAULT 'warning' NOT NULL,
  recommended_action TEXT,
  is_resolved BOOLEAN DEFAULT false NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Circuit breaker events
CREATE TABLE public.circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  triggered_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Meme projects
CREATE TABLE public.meme_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  stage meme_project_stage DEFAULT 'opportunity' NOT NULL,
  viral_score DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  social_velocity DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  narrative_tags TEXT[] DEFAULT '{}' NOT NULL,
  liquidity_signal TEXT,
  holder_concentration DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  go_no_go_approved BOOLEAN DEFAULT false NOT NULL,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Meme tasks (checklist)
CREATE TABLE public.meme_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.meme_projects(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN DEFAULT false NOT NULL,
  completed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Meme metrics (post-launch)
CREATE TABLE public.meme_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.meme_projects(id) ON DELETE CASCADE NOT NULL,
  pnl DECIMAL(20, 2) DEFAULT 0 NOT NULL,
  liquidity_health DECIMAL(5, 2) DEFAULT 100 NOT NULL,
  slippage DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  exit_progress DECIMAL(5, 2) DEFAULT 0 NOT NULL,
  incident_count INTEGER DEFAULT 0 NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity alert_severity DEFAULT 'info' NOT NULL,
  source TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  is_resolved BOOLEAN DEFAULT false NOT NULL,
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Audit events (immutable log)
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  severity alert_severity DEFAULT 'info' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Global settings
CREATE TABLE public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_kill_switch BOOLEAN DEFAULT false NOT NULL,
  reduce_only_mode BOOLEAN DEFAULT false NOT NULL,
  meme_module_enabled BOOLEAN DEFAULT true NOT NULL,
  dex_venues_enabled BOOLEAN DEFAULT true NOT NULL,
  paper_trading_mode BOOLEAN DEFAULT false NOT NULL,
  api_base_url TEXT DEFAULT '' NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_breaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_breaker_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

-- RLS Policies

-- Profiles: users can read all, update own
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles: only admin can manage, all authenticated can view
CREATE POLICY "User roles viewable by authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage user roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Books: all authenticated can view, admin/cio can modify
CREATE POLICY "Books viewable by authenticated" ON public.books
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO can manage books" ON public.books
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Risk limits: all authenticated can view, admin/cio can modify
CREATE POLICY "Risk limits viewable by authenticated" ON public.risk_limits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO can manage risk limits" ON public.risk_limits
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Strategies: all authenticated can view
CREATE POLICY "Strategies viewable by authenticated" ON public.strategies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Trader and above can manage strategies" ON public.strategies
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Strategy signals: all authenticated can view
CREATE POLICY "Strategy signals viewable by authenticated" ON public.strategy_signals
  FOR SELECT TO authenticated USING (true);

-- Venues: all authenticated can view, admin/cio/ops can modify
CREATE POLICY "Venues viewable by authenticated" ON public.venues
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO/Ops can manage venues" ON public.venues
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Positions: all authenticated can view
CREATE POLICY "Positions viewable by authenticated" ON public.positions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage positions" ON public.positions
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Orders: all authenticated can view
CREATE POLICY "Orders viewable by authenticated" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage orders" ON public.orders
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Risk breaches: all authenticated can view
CREATE POLICY "Risk breaches viewable by authenticated" ON public.risk_breaches
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage risk breaches" ON public.risk_breaches
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Circuit breaker events: all authenticated can view
CREATE POLICY "Circuit breaker events viewable by authenticated" ON public.circuit_breaker_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO can create circuit breaker events" ON public.circuit_breaker_events
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Meme projects: all authenticated can view
CREATE POLICY "Meme projects viewable by authenticated" ON public.meme_projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO can manage meme projects" ON public.meme_projects
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Meme tasks: all authenticated can view
CREATE POLICY "Meme tasks viewable by authenticated" ON public.meme_tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ops and above can manage meme tasks" ON public.meme_tasks
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Meme metrics: all authenticated can view
CREATE POLICY "Meme metrics viewable by authenticated" ON public.meme_metrics
  FOR SELECT TO authenticated USING (true);

-- Alerts: all authenticated can view
CREATE POLICY "Alerts viewable by authenticated" ON public.alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can manage alerts" ON public.alerts
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Audit events: all authenticated can view, system can insert
CREATE POLICY "Audit events viewable by authenticated" ON public.audit_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert audit events" ON public.audit_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- Global settings: all authenticated can view, admin/cio can modify
CREATE POLICY "Global settings viewable by authenticated" ON public.global_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/CIO can manage global settings" ON public.global_settings
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Trigger for new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  -- Default to viewer role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_risk_limits_updated_at BEFORE UPDATE ON public.risk_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_meme_projects_updated_at BEFORE UPDATE ON public.meme_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_meme_tasks_updated_at BEFORE UPDATE ON public.meme_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meme_metrics;