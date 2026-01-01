-- Add RLS policies to allow service role to insert/update system health
CREATE POLICY "Service role can insert system health"
ON public.system_health
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update system health"
ON public.system_health
FOR UPDATE
USING (true);

-- Allow inserts from service role to venue_health for historical tracking
CREATE POLICY "Service role can insert venue health"
ON public.venue_health
FOR INSERT
WITH CHECK (true);