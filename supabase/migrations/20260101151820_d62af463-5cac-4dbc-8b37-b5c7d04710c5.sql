-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the health monitor to run every 5 minutes
SELECT cron.schedule(
  'scheduled-health-monitor',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amvakxshlojoshdfcqos.supabase.co/functions/v1/scheduled-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmFreHNobG9qb3NoZGZjcW9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njg0NDg0NywiZXhwIjoyMDgyNDIwODQ3fQ.YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{"task": "all"}'::jsonb
  );
  $$
);