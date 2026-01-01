-- Create performance_metrics table for operational monitoring
CREATE TABLE public.performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  endpoint TEXT,
  latency_ms INTEGER NOT NULL,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for querying by function and time
CREATE INDEX idx_performance_metrics_function_time ON public.performance_metrics (function_name, recorded_at DESC);
CREATE INDEX idx_performance_metrics_recorded_at ON public.performance_metrics (recorded_at DESC);

-- Enable RLS
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view metrics (for dashboard)
CREATE POLICY "Authenticated users can view metrics"
  ON public.performance_metrics
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert (edge functions)
CREATE POLICY "Service role can insert metrics"
  ON public.performance_metrics
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add function for cleanup of old metrics (keep 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.performance_metrics
  WHERE recorded_at < now() - INTERVAL '7 days';
END;
$$;