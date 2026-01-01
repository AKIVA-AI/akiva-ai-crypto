-- 1. Add strategy lifecycle columns to strategies table
ALTER TABLE public.strategies 
ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'active' 
  CHECK (lifecycle_state IN ('active', 'quarantined', 'disabled', 'paper_only', 'cooldown')),
ADD COLUMN IF NOT EXISTS lifecycle_reason TEXT,
ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS consecutive_losses INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS execution_quality NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS quarantine_count_30d INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quarantine_expires_at TIMESTAMP WITH TIME ZONE;

-- 2. Create strategy_lifecycle_events table for transition history
CREATE TABLE IF NOT EXISTS public.strategy_lifecycle_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL, -- 'automatic' or user_id
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_strategy_lifecycle_events_strategy_id 
  ON public.strategy_lifecycle_events(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_lifecycle_events_created_at 
  ON public.strategy_lifecycle_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.strategy_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- RLS policies (all authenticated users can view, only admins/traders can modify)
CREATE POLICY "Authenticated users can view lifecycle events" 
  ON public.strategy_lifecycle_events FOR SELECT 
  USING (true);

CREATE POLICY "Admin/CIO/Trader can insert lifecycle events" 
  ON public.strategy_lifecycle_events FOR INSERT 
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'cio', 'trader']::app_role[]));

-- 3. Create decision_traces table for persistent decision trace storage
CREATE TABLE IF NOT EXISTS public.decision_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL UNIQUE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Intent details
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  target_exposure_usd NUMERIC NOT NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  strategy_name TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  signal_strength NUMERIC NOT NULL,
  
  -- Decision outcome
  decision TEXT NOT NULL CHECK (decision IN ('EXECUTED', 'BLOCKED', 'MODIFIED', 'PENDING')),
  
  -- Gate checks and reasons (stored as JSONB)
  gates_checked JSONB NOT NULL DEFAULT '[]',
  block_reasons TEXT[] DEFAULT '{}',
  reason_codes TEXT[] DEFAULT '{}',
  
  -- Market context
  regime JSONB NOT NULL DEFAULT '{}',
  
  -- Cost analysis
  costs JSONB NOT NULL DEFAULT '{}',
  
  -- Human-readable explanation
  explanation TEXT NOT NULL,
  
  -- Indexing
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_decision_traces_timestamp ON public.decision_traces(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decision_traces_instrument ON public.decision_traces(instrument);
CREATE INDEX IF NOT EXISTS idx_decision_traces_strategy_id ON public.decision_traces(strategy_id);
CREATE INDEX IF NOT EXISTS idx_decision_traces_decision ON public.decision_traces(decision);
CREATE INDEX IF NOT EXISTS idx_decision_traces_block_reasons ON public.decision_traces USING GIN(block_reasons);

-- Enable RLS
ALTER TABLE public.decision_traces ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view decision traces" 
  ON public.decision_traces FOR SELECT 
  USING (true);

CREATE POLICY "System can insert decision traces" 
  ON public.decision_traces FOR INSERT 
  WITH CHECK (true);

-- 4. Create system_health table for health check persistence
CREATE TABLE IF NOT EXISTS public.system_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  last_check_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}',
  error_message TEXT,
  
  UNIQUE(component)
);

-- Enable RLS
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view system health" 
  ON public.system_health FOR SELECT 
  USING (true);

CREATE POLICY "System can update health" 
  ON public.system_health FOR ALL 
  USING (true);

-- 5. Create market_data_metrics table for dedup verification
CREATE TABLE IF NOT EXISTS public.market_data_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL,
  symbol TEXT,
  request_count INTEGER DEFAULT 1,
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  rate_limit_hits INTEGER DEFAULT 0,
  avg_latency_ms NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique per endpoint+symbol+minute
  UNIQUE(endpoint, symbol, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_market_data_metrics_recorded_at 
  ON public.market_data_metrics(recorded_at DESC);

-- Enable RLS
ALTER TABLE public.market_data_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view market data metrics" 
  ON public.market_data_metrics FOR SELECT 
  USING (true);

CREATE POLICY "System can insert market data metrics" 
  ON public.market_data_metrics FOR INSERT 
  WITH CHECK (true);