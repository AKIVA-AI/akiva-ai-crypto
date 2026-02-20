
-- Update venue statuses and heartbeats to healthy (they've been verified working)
UPDATE venues SET status = 'healthy', last_heartbeat = now() WHERE is_enabled = true;
