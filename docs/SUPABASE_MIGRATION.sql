-- =====================================================
-- COMPLETE SUPABASE SCHEMA MIGRATION
-- Run this on your Supabase Pro instance
-- =====================================================

-- =====================================================
-- 1. ENUMS
-- =====================================================

CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.app_role AS ENUM ('admin', 'cio', 'trader', 'research', 'ops', 'auditor', 'viewer');
CREATE TYPE public.book_status AS ENUM ('active', 'frozen');
CREATE TYPE public.book_type AS ENUM ('HEDGE', 'PROP', 'MEME');
CREATE TYPE public.meme_project_stage AS ENUM ('opportunity', 'build', 'launch', 'post_launch', 'completed');
CREATE TYPE public.order_side AS ENUM ('buy', 'sell');
CREATE TYPE public.order_status AS ENUM ('open', 'filled', 'rejected', 'cancelled');
CREATE TYPE public.strategy_status AS ENUM ('off', 'paper', 'live');
CREATE TYPE public.venue_status AS ENUM ('healthy', 'degraded', 'offline');

-- =====================================================
-- 2. TABLES
-- =====================================================

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
    id uuid NOT NULL PRIMARY KEY,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Agents table
CREATE TABLE public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL,
    status text NOT NULL DEFAULT 'offline',
    version text NOT NULL DEFAULT '1.0.0',
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    capabilities text[] NOT NULL DEFAULT '{}'::text[],
    cpu_usage numeric NOT NULL DEFAULT 0,
    memory_usage numeric NOT NULL DEFAULT 0,
    uptime numeric NOT NULL DEFAULT 0,
    last_heartbeat timestamp with time zone NOT NULL DEFAULT now(),
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Alerts table
CREATE TABLE public.alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    message text NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'info',
    source text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    is_resolved boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Books table
CREATE TABLE public.books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type book_type NOT NULL,
    status book_status NOT NULL DEFAULT 'active',
    capital_allocated numeric NOT NULL DEFAULT 0,
    current_exposure numeric NOT NULL DEFAULT 0,
    max_drawdown_limit numeric NOT NULL DEFAULT 10,
    risk_tier integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Venues table
CREATE TABLE public.venues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    status venue_status NOT NULL DEFAULT 'healthy',
    is_enabled boolean NOT NULL DEFAULT true,
    fee_tier text NOT NULL DEFAULT 'standard',
    latency_ms integer NOT NULL DEFAULT 50,
    error_rate numeric NOT NULL DEFAULT 0,
    max_order_size numeric,
    supported_instruments text[] NOT NULL DEFAULT '{}'::text[],
    restricted_order_types text[] NOT NULL DEFAULT '{}'::text[],
    last_heartbeat timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategies table
CREATE TABLE public.strategies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL REFERENCES public.books(id),
    name text NOT NULL,
    status strategy_status NOT NULL DEFAULT 'off',
    asset_class text NOT NULL DEFAULT 'Crypto',
    timeframe text NOT NULL,
    risk_tier integer NOT NULL DEFAULT 1,
    venue_scope text[] NOT NULL DEFAULT '{}'::text[],
    config_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    intent_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    pnl numeric NOT NULL DEFAULT 0,
    max_drawdown numeric NOT NULL DEFAULT 0,
    last_signal_time timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Positions table
CREATE TABLE public.positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL REFERENCES public.books(id),
    strategy_id uuid REFERENCES public.strategies(id),
    venue_id uuid REFERENCES public.venues(id),
    instrument text NOT NULL,
    side order_side NOT NULL,
    size numeric NOT NULL,
    entry_price numeric NOT NULL,
    mark_price numeric NOT NULL,
    liquidation_price numeric,
    leverage numeric NOT NULL DEFAULT 1,
    unrealized_pnl numeric NOT NULL DEFAULT 0,
    realized_pnl numeric NOT NULL DEFAULT 0,
    is_open boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL REFERENCES public.books(id),
    strategy_id uuid REFERENCES public.strategies(id),
    venue_id uuid REFERENCES public.venues(id),
    instrument text NOT NULL,
    side order_side NOT NULL,
    size numeric NOT NULL,
    price numeric,
    status order_status NOT NULL DEFAULT 'open',
    filled_size numeric NOT NULL DEFAULT 0,
    filled_price numeric,
    slippage numeric,
    latency_ms integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Fills table
CREATE TABLE public.fills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id),
    venue_id uuid REFERENCES public.venues(id),
    instrument text NOT NULL,
    side order_side NOT NULL,
    size numeric NOT NULL,
    price numeric NOT NULL,
    fee numeric NOT NULL DEFAULT 0,
    venue_fill_id text,
    executed_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Book budgets table
CREATE TABLE public.book_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL REFERENCES public.books(id),
    allocated_capital numeric NOT NULL DEFAULT 0,
    used_capital numeric NOT NULL DEFAULT 0,
    max_daily_loss numeric NOT NULL DEFAULT 0,
    current_daily_pnl numeric NOT NULL DEFAULT 0,
    period_start date NOT NULL,
    period_end date NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Risk limits table
CREATE TABLE public.risk_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL UNIQUE REFERENCES public.books(id),
    max_daily_loss numeric NOT NULL,
    max_intraday_drawdown numeric NOT NULL,
    max_leverage numeric NOT NULL,
    max_concentration numeric NOT NULL,
    max_correlation_exposure numeric NOT NULL DEFAULT 30,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Risk breaches table
CREATE TABLE public.risk_breaches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid NOT NULL REFERENCES public.books(id),
    breach_type text NOT NULL,
    description text NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'warning',
    current_value numeric NOT NULL,
    limit_value numeric NOT NULL,
    recommended_action text,
    is_resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Trade intents table
CREATE TABLE public.trade_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id uuid NOT NULL REFERENCES public.strategies(id),
    book_id uuid NOT NULL REFERENCES public.books(id),
    instrument text NOT NULL,
    direction order_side NOT NULL,
    target_exposure_usd numeric NOT NULL,
    max_loss_usd numeric NOT NULL,
    confidence numeric NOT NULL,
    horizon_minutes integer NOT NULL DEFAULT 60,
    liquidity_requirement text NOT NULL DEFAULT 'normal',
    invalidation_price numeric,
    status text NOT NULL DEFAULT 'pending',
    risk_decision jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    processed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Strategy signals table
CREATE TABLE public.strategy_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id uuid NOT NULL REFERENCES public.strategies(id),
    instrument text NOT NULL,
    signal_type text NOT NULL,
    direction order_side NOT NULL,
    strength numeric NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Deployments table
CREATE TABLE public.deployments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id uuid NOT NULL REFERENCES public.strategies(id),
    book_id uuid NOT NULL REFERENCES public.books(id),
    venue_id uuid REFERENCES public.venues(id),
    status text NOT NULL DEFAULT 'pending',
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    deployed_by uuid,
    deployed_at timestamp with time zone,
    terminated_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Audit events table
CREATE TABLE public.audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    user_id uuid,
    user_email text,
    book_id uuid REFERENCES public.books(id),
    severity alert_severity NOT NULL DEFAULT 'info',
    before_state jsonb,
    after_state jsonb,
    ip_address text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Circuit breaker events table
CREATE TABLE public.circuit_breaker_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id uuid REFERENCES public.books(id),
    trigger_type text NOT NULL,
    action_taken text NOT NULL,
    triggered_by uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Global settings table
CREATE TABLE public.global_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    global_kill_switch boolean NOT NULL DEFAULT false,
    reduce_only_mode boolean NOT NULL DEFAULT false,
    paper_trading_mode boolean NOT NULL DEFAULT false,
    meme_module_enabled boolean NOT NULL DEFAULT true,
    dex_venues_enabled boolean NOT NULL DEFAULT true,
    api_base_url text NOT NULL DEFAULT '',
    updated_by uuid,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Venue health table
CREATE TABLE public.venue_health (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES public.venues(id),
    status text NOT NULL DEFAULT 'unknown',
    latency_ms integer NOT NULL DEFAULT 0,
    error_rate numeric NOT NULL DEFAULT 0,
    order_success_rate numeric NOT NULL DEFAULT 100,
    last_order_time timestamp with time zone,
    last_error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Market snapshots table
CREATE TABLE public.market_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id uuid NOT NULL REFERENCES public.venues(id),
    instrument text NOT NULL,
    bid numeric NOT NULL,
    ask numeric NOT NULL,
    last_price numeric NOT NULL,
    volume_24h numeric,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Meme projects table
CREATE TABLE public.meme_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    ticker text NOT NULL,
    stage meme_project_stage NOT NULL DEFAULT 'opportunity',
    viral_score numeric NOT NULL DEFAULT 0,
    social_velocity numeric NOT NULL DEFAULT 0,
    holder_concentration numeric NOT NULL DEFAULT 0,
    narrative_tags text[] NOT NULL DEFAULT '{}'::text[],
    liquidity_signal text,
    go_no_go_approved boolean NOT NULL DEFAULT false,
    approved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Meme metrics table
CREATE TABLE public.meme_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.meme_projects(id),
    pnl numeric NOT NULL DEFAULT 0,
    liquidity_health numeric NOT NULL DEFAULT 100,
    slippage numeric NOT NULL DEFAULT 0,
    exit_progress numeric NOT NULL DEFAULT 0,
    incident_count integer NOT NULL DEFAULT 0,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Meme tasks table
CREATE TABLE public.meme_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.meme_projects(id),
    title text NOT NULL,
    description text,
    category text NOT NULL,
    is_completed boolean NOT NULL DEFAULT false,
    completed_by uuid,
    due_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Notification channels table
CREATE TABLE public.notification_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL,
    webhook_url text NOT NULL,
    is_enabled boolean NOT NULL DEFAULT true,
    alert_types text[] NOT NULL DEFAULT ARRAY['critical', 'warning'],
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Notification logs table
CREATE TABLE public.notification_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id uuid REFERENCES public.alerts(id),
    channel_id uuid REFERENCES public.notification_channels(id),
    status text NOT NULL,
    error_message text,
    sent_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Wallets table
CREATE TABLE public.wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    address text NOT NULL,
    network text NOT NULL,
    type text NOT NULL DEFAULT 'hot',
    currency text NOT NULL DEFAULT 'USDC',
    balance numeric NOT NULL DEFAULT 0,
    usd_value numeric NOT NULL DEFAULT 0,
    signers integer NOT NULL DEFAULT 1,
    required_signers integer NOT NULL DEFAULT 1,
    pending_approvals integer NOT NULL DEFAULT 0,
    is_watch_only boolean NOT NULL DEFAULT true,
    last_synced_at timestamp with time zone,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Whale wallets table
CREATE TABLE public.whale_wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    address text NOT NULL,
    network text NOT NULL,
    label text,
    category text,
    balance numeric DEFAULT 0,
    is_tracked boolean DEFAULT true,
    last_activity_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Whale transactions table
CREATE TABLE public.whale_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id uuid REFERENCES public.whale_wallets(id),
    tx_hash text NOT NULL,
    instrument text NOT NULL,
    network text NOT NULL,
    from_address text NOT NULL,
    to_address text NOT NULL,
    amount numeric NOT NULL,
    usd_value numeric,
    direction text NOT NULL,
    block_number bigint,
    gas_price numeric,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Intelligence signals table
CREATE TABLE public.intelligence_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument text NOT NULL,
    signal_type text NOT NULL,
    direction text NOT NULL,
    strength numeric,
    confidence numeric,
    reasoning text,
    source_data jsonb DEFAULT '{}'::jsonb,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Market news table
CREATE TABLE public.market_news (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    source text NOT NULL,
    url text,
    summary text,
    raw_content text,
    sentiment_score numeric,
    impact_score numeric,
    instruments text[] DEFAULT '{}'::text[],
    tags text[] DEFAULT '{}'::text[],
    published_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Social sentiment table
CREATE TABLE public.social_sentiment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument text NOT NULL,
    platform text NOT NULL,
    sentiment_score numeric,
    mention_count integer DEFAULT 0,
    positive_count integer DEFAULT 0,
    negative_count integer DEFAULT 0,
    neutral_count integer DEFAULT 0,
    velocity numeric DEFAULT 0,
    influential_posts jsonb DEFAULT '[]'::jsonb,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Onchain metrics table
CREATE TABLE public.onchain_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument text NOT NULL,
    network text NOT NULL,
    active_addresses integer DEFAULT 0,
    transaction_count integer DEFAULT 0,
    whale_transactions integer DEFAULT 0,
    exchange_inflow numeric DEFAULT 0,
    exchange_outflow numeric DEFAULT 0,
    holder_count integer DEFAULT 0,
    holder_concentration numeric DEFAULT 0,
    smart_money_flow numeric DEFAULT 0,
    gas_used numeric DEFAULT 0,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Derivatives metrics table
CREATE TABLE public.derivatives_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument text NOT NULL,
    venue text NOT NULL,
    funding_rate numeric,
    next_funding_time timestamp with time zone,
    open_interest numeric,
    oi_change_24h numeric,
    long_short_ratio numeric,
    liquidations_24h_long numeric,
    liquidations_24h_short numeric,
    top_trader_long_ratio numeric,
    top_trader_short_ratio numeric,
    recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Arbitrage executions table
CREATE TABLE public.arbitrage_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id text NOT NULL,
    symbol text NOT NULL,
    buy_exchange text NOT NULL,
    sell_exchange text NOT NULL,
    buy_price numeric NOT NULL,
    sell_price numeric NOT NULL,
    quantity numeric NOT NULL,
    spread_percent numeric NOT NULL,
    gross_profit numeric NOT NULL,
    net_profit numeric NOT NULL,
    trading_fees numeric NOT NULL DEFAULT 0,
    withdrawal_fee numeric NOT NULL DEFAULT 0,
    slippage numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    buy_order_id text,
    sell_order_id text,
    error_message text,
    executed_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- =====================================================
-- 3. FUNCTIONS
-- =====================================================

-- Update updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Has role function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
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

-- Has any role function
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean
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

-- Handle new user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Audit event logging function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _severity alert_severity;
  _resource_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
  END IF;
  
  _resource_type := TG_TABLE_NAME;
  
  IF TG_TABLE_NAME IN ('global_settings', 'user_roles', 'books') THEN
    _severity := 'warning';
  ELSE
    _severity := 'info';
  END IF;

  INSERT INTO public.audit_events (
    action,
    resource_type,
    resource_id,
    user_id,
    severity,
    before_state,
    after_state
  ) VALUES (
    _action,
    _resource_type,
    COALESCE(NEW.id::text, OLD.id::text),
    auth.uid(),
    _severity,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Auth trigger for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_breaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_breaker_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meme_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onchain_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derivatives_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitrage_executions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RLS POLICIES
-- =====================================================

-- Profiles policies
CREATE POLICY "Users can only view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can manage user roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert user roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update user roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete user roles" ON public.user_roles FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Agents policies
CREATE POLICY "Agents viewable by ops and admin" ON public.agents FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Ops and admin can manage agents" ON public.agents FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Alerts policies
CREATE POLICY "Alerts viewable by ops and above" ON public.alerts FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops', 'trader']::app_role[]));
CREATE POLICY "System can manage alerts" ON public.alerts FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Books policies
CREATE POLICY "Books viewable by traders and above" ON public.books FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops', 'research']::app_role[]));
CREATE POLICY "Admin/CIO can manage books" ON public.books FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Venues policies
CREATE POLICY "Venues viewable by traders and above" ON public.venues FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops', 'research']::app_role[]));
CREATE POLICY "Admin/CIO/Ops can manage venues" ON public.venues FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Strategies policies
CREATE POLICY "Strategies viewable by research and above" ON public.strategies FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'research']::app_role[]));
CREATE POLICY "Trader and above can manage strategies" ON public.strategies FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Positions policies
CREATE POLICY "Positions viewable by traders and above" ON public.positions FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "System can manage positions" ON public.positions FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Orders policies
CREATE POLICY "Orders viewable by traders and above" ON public.orders FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "System can manage orders" ON public.orders FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));
CREATE POLICY "Traders can create orders" ON public.orders FOR INSERT WITH CHECK (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));
CREATE POLICY "Traders can update orders" ON public.orders FOR UPDATE USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Fills policies
CREATE POLICY "Fills viewable by traders and above" ON public.fills FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "System can manage fills" ON public.fills FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Book budgets policies
CREATE POLICY "Book budgets viewable by traders and above" ON public.book_budgets FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can manage book budgets" ON public.book_budgets FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Risk limits policies
CREATE POLICY "Risk limits viewable by traders and above" ON public.risk_limits FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can manage risk limits" ON public.risk_limits FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Risk breaches policies
CREATE POLICY "Risk breaches viewable by risk roles" ON public.risk_breaches FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "System can manage risk breaches" ON public.risk_breaches FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Trade intents policies
CREATE POLICY "Trade intents viewable by traders and above" ON public.trade_intents FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));
CREATE POLICY "System can manage trade intents" ON public.trade_intents FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Strategy signals policies
CREATE POLICY "Strategy signals viewable by authenticated" ON public.strategy_signals FOR SELECT USING (true);

-- Deployments policies
CREATE POLICY "Deployments viewable by traders and above" ON public.deployments FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'research']::app_role[]));
CREATE POLICY "Trader and above can manage deployments" ON public.deployments FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- Audit events policies
CREATE POLICY "Audit events viewable by auditors and admins" ON public.audit_events FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'auditor', 'cio']::app_role[]));
CREATE POLICY "System can insert audit events" ON public.audit_events FOR INSERT WITH CHECK (true);

-- Circuit breaker events policies
CREATE POLICY "Circuit breaker events viewable by ops and admin" ON public.circuit_breaker_events FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can create circuit breaker events" ON public.circuit_breaker_events FOR INSERT WITH CHECK (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Global settings policies
CREATE POLICY "Global settings viewable by admins and ops" ON public.global_settings FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can manage global settings" ON public.global_settings FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));
CREATE POLICY "Admins can update global settings" ON public.global_settings FOR UPDATE USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Venue health policies
CREATE POLICY "Venue health viewable by authenticated" ON public.venue_health FOR SELECT USING (true);

-- Market snapshots policies
CREATE POLICY "Market snapshots viewable by authenticated" ON public.market_snapshots FOR SELECT USING (true);

-- Meme projects policies
CREATE POLICY "Meme projects viewable by traders and above" ON public.meme_projects FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'research']::app_role[]));
CREATE POLICY "Admin/CIO can manage meme projects" ON public.meme_projects FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Meme metrics policies
CREATE POLICY "Meme metrics viewable by authenticated" ON public.meme_metrics FOR SELECT USING (true);

-- Meme tasks policies
CREATE POLICY "Meme tasks viewable by ops and above" ON public.meme_tasks FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Ops and above can manage meme tasks" ON public.meme_tasks FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Notification channels policies
CREATE POLICY "Notification channels viewable by admin and ops" ON public.notification_channels FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can manage notification channels" ON public.notification_channels FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Notification logs policies
CREATE POLICY "Notification logs viewable by admin and ops" ON public.notification_logs FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops', 'auditor']::app_role[]));
CREATE POLICY "System can manage notification logs" ON public.notification_logs FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));

-- Wallets policies
CREATE POLICY "Wallets viewable by admin and CIO" ON public.wallets FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'ops']::app_role[]));
CREATE POLICY "Admin/CIO can manage wallets" ON public.wallets FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin', 'cio']::app_role[]));

-- Whale wallets policies
CREATE POLICY "Authenticated users can read whale wallets" ON public.whale_wallets FOR SELECT USING (true);
CREATE POLICY "Service role can manage whale wallets" ON public.whale_wallets FOR ALL USING (true) WITH CHECK (true);

-- Whale transactions policies
CREATE POLICY "Authenticated users can read whale transactions" ON public.whale_transactions FOR SELECT USING (true);
CREATE POLICY "Service role can manage whale transactions" ON public.whale_transactions FOR ALL USING (true) WITH CHECK (true);

-- Intelligence signals policies
CREATE POLICY "Authenticated users can read intelligence signals" ON public.intelligence_signals FOR SELECT USING (true);
CREATE POLICY "Service role can manage intelligence signals" ON public.intelligence_signals FOR ALL USING (true) WITH CHECK (true);

-- Market news policies
CREATE POLICY "Authenticated users can read market news" ON public.market_news FOR SELECT USING (true);
CREATE POLICY "Service role can manage market news" ON public.market_news FOR ALL USING (true) WITH CHECK (true);

-- Social sentiment policies
CREATE POLICY "Authenticated users can read social sentiment" ON public.social_sentiment FOR SELECT USING (true);
CREATE POLICY "Service role can manage social sentiment" ON public.social_sentiment FOR ALL USING (true) WITH CHECK (true);

-- Onchain metrics policies
CREATE POLICY "Authenticated users can read onchain metrics" ON public.onchain_metrics FOR SELECT USING (true);
CREATE POLICY "Service role can manage onchain metrics" ON public.onchain_metrics FOR ALL USING (true) WITH CHECK (true);

-- Derivatives metrics policies
CREATE POLICY "Authenticated users can read derivatives metrics" ON public.derivatives_metrics FOR SELECT USING (true);
CREATE POLICY "Service role can manage derivatives metrics" ON public.derivatives_metrics FOR ALL USING (true) WITH CHECK (true);

-- Arbitrage executions policies
CREATE POLICY "Arbitrage executions viewable by traders and above" ON public.arbitrage_executions FOR SELECT USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader', 'ops']::app_role[]));
CREATE POLICY "Traders can create arbitrage executions" ON public.arbitrage_executions FOR INSERT WITH CHECK (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));
CREATE POLICY "Traders can update arbitrage executions" ON public.arbitrage_executions FOR UPDATE USING (has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- =====================================================
-- 7. INSERT DEFAULT DATA
-- =====================================================

-- Insert default global settings
INSERT INTO public.global_settings (id, global_kill_switch, reduce_only_mode, paper_trading_mode)
VALUES (gen_random_uuid(), false, false, false);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
