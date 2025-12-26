-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'research';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';

-- Create fills table for order fill tracking
CREATE TABLE public.fills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id),
  instrument TEXT NOT NULL,
  side order_side NOT NULL,
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  venue_fill_id TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fills viewable by authenticated" ON public.fills
  FOR SELECT USING (true);

CREATE POLICY "System can manage fills" ON public.fills
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role]));

-- Create book_budgets table for capital allocation tracking
CREATE TABLE public.book_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  allocated_capital NUMERIC NOT NULL DEFAULT 0,
  used_capital NUMERIC NOT NULL DEFAULT 0,
  max_daily_loss NUMERIC NOT NULL DEFAULT 0,
  current_daily_pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(book_id, period_start)
);

ALTER TABLE public.book_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Book budgets viewable by authenticated" ON public.book_budgets
  FOR SELECT USING (true);

CREATE POLICY "Admin/CIO can manage book budgets" ON public.book_budgets
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role]));

-- Create deployments table for strategy deployment tracking
CREATE TABLE public.deployments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id),
  venue_id UUID REFERENCES public.venues(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'active', 'paused', 'failed', 'terminated')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  deployed_by UUID REFERENCES auth.users(id),
  deployed_at TIMESTAMP WITH TIME ZONE,
  terminated_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deployments viewable by authenticated" ON public.deployments
  FOR SELECT USING (true);

CREATE POLICY "Trader and above can manage deployments" ON public.deployments
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role]));

-- Create venue_health table for venue monitoring snapshots
CREATE TABLE public.venue_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_rate NUMERIC NOT NULL DEFAULT 0,
  order_success_rate NUMERIC NOT NULL DEFAULT 100,
  last_order_time TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue health viewable by authenticated" ON public.venue_health
  FOR SELECT USING (true);

-- Create trade_intents table for strategy signal tracking
CREATE TABLE public.trade_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id),
  book_id UUID NOT NULL REFERENCES public.books(id),
  instrument TEXT NOT NULL,
  direction order_side NOT NULL,
  target_exposure_usd NUMERIC NOT NULL,
  max_loss_usd NUMERIC NOT NULL,
  invalidation_price NUMERIC,
  horizon_minutes INTEGER NOT NULL DEFAULT 60,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  liquidity_requirement TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'modified', 'rejected', 'executed', 'expired')),
  risk_decision JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.trade_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trade intents viewable by authenticated" ON public.trade_intents
  FOR SELECT USING (true);

CREATE POLICY "System can manage trade intents" ON public.trade_intents
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role]));

-- Create market_snapshots table for price data
CREATE TABLE public.market_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  instrument TEXT NOT NULL,
  bid NUMERIC NOT NULL,
  ask NUMERIC NOT NULL,
  last_price NUMERIC NOT NULL,
  volume_24h NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market snapshots viewable by authenticated" ON public.market_snapshots
  FOR SELECT USING (true);

-- Add indexes for performance
CREATE INDEX idx_fills_order_id ON public.fills(order_id);
CREATE INDEX idx_fills_executed_at ON public.fills(executed_at DESC);
CREATE INDEX idx_book_budgets_book_id ON public.book_budgets(book_id);
CREATE INDEX idx_deployments_strategy_id ON public.deployments(strategy_id);
CREATE INDEX idx_deployments_status ON public.deployments(status);
CREATE INDEX idx_venue_health_venue_id ON public.venue_health(venue_id);
CREATE INDEX idx_venue_health_recorded_at ON public.venue_health(recorded_at DESC);
CREATE INDEX idx_trade_intents_strategy_id ON public.trade_intents(strategy_id);
CREATE INDEX idx_trade_intents_status ON public.trade_intents(status);
CREATE INDEX idx_market_snapshots_venue_instrument ON public.market_snapshots(venue_id, instrument);
CREATE INDEX idx_market_snapshots_recorded_at ON public.market_snapshots(recorded_at DESC);

-- Update triggers for updated_at
CREATE TRIGGER update_book_budgets_updated_at BEFORE UPDATE ON public.book_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_deployments_updated_at BEFORE UPDATE ON public.deployments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();