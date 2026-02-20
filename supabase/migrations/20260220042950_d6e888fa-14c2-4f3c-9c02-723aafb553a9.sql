
-- Schedule health-check every 2 minutes
SELECT cron.schedule(
  'health-check-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amvakxshlojoshdfcqos.supabase.co/functions/v1/health-check',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmFreHNobG9qb3NoZGZjcW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDQ4NDcsImV4cCI6MjA4MjQyMDg0N30._iBiyX2TiOINC7-yLI2TG5k168H7oam-wuiUHVWZ-w8"}'::jsonb,
    body := '{"time": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule market data + monitoring every minute
SELECT cron.schedule(
  'scheduled-monitor-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amvakxshlojoshdfcqos.supabase.co/functions/v1/scheduled-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmFreHNobG9qb3NoZGZjcW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDQ4NDcsImV4cCI6MjA4MjQyMDg0N30._iBiyX2TiOINC7-yLI2TG5k168H7oam-wuiUHVWZ-w8"}'::jsonb,
    body := '{"task": "all"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule data cleanup daily at midnight UTC
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 0 * * *',
  $$
  SELECT public.cleanup_old_metrics();
  SELECT public.cleanup_old_market_snapshots();
  $$
);
