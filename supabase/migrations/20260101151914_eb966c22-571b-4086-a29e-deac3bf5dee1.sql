-- Update the cron job with correct anon key
SELECT cron.unschedule(1);

SELECT cron.schedule(
  'scheduled-health-monitor',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amvakxshlojoshdfcqos.supabase.co/functions/v1/scheduled-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmFreHNobG9qb3NoZGZjcW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDQ4NDcsImV4cCI6MjA4MjQyMDg0N30._iBiyX2TiOINC7-yLI2TG5k168H7oam-wuiUHVWZ-w8"}'::jsonb,
    body := '{"task": "all"}'::jsonb
  );
  $$
);