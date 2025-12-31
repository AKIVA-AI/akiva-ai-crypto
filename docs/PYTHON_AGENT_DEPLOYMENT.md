# Python Agent Deployment Guide

## Overview

The Python backend provides advanced trading capabilities that run 24/7 independently of the frontend. This includes strategy execution, ML-based risk assessment, and complex order routing.

---

## Hybrid Architecture

The system uses a hybrid approach:

| Layer | Technology | Purpose | Runtime |
|-------|------------|---------|---------|
| **Frontend** | React/Lovable | Dashboard, user interaction | Always on |
| **Edge Functions** | Deno/Supabase | Lightweight tasks, API calls | On-demand |
| **Cron Monitor** | pg_cron + Edge | Scheduled monitoring | Every 1-5 min |
| **Python Backend** | FastAPI/Docker | Heavy compute, ML, strategies | 24/7 |

---

## Edge Function Cron Jobs (Already Configured)

These run automatically via Supabase pg_cron:

### scheduled-monitor
Runs every minute, handles:
- Kill switch status check
- Position risk monitoring
- Signal consensus detection
- Venue health verification
- Trade intent expiration
- Agent heartbeat monitoring

### Setting Up Cron Jobs

Run this SQL in Supabase SQL Editor:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule monitor to run every minute
SELECT cron.schedule(
  'trading-monitor-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://amvakxshlojoshdfcqos.supabase.co/functions/v1/scheduled-monitor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmFreHNobG9qb3NoZGZjcW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDQ4NDcsImV4cCI6MjA4MjQyMDg0N30._iBiyX2TiOINC7-yLI2TG5k168H7oam-wuiUHVWZ-w8"}'::jsonb,
    body := '{"task": "all"}'::jsonb
  );
  $$
);

-- Check cron jobs
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Python Backend Deployment

### Prerequisites

- Docker installed locally or on deployment platform
- Python 3.11+
- Access to Supabase project credentials

### Environment Variables

Create `.env` file for Python backend:

```env
# Supabase
SUPABASE_URL=https://amvakxshlojoshdfcqos.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database
DATABASE_URL=postgresql://postgres:[password]@db.amvakxshlojoshdfcqos.supabase.co:5432/postgres

# Trading (optional - for live trading)
COINBASE_API_KEY=your_key
COINBASE_API_SECRET=your_secret
KRAKEN_API_KEY=your_key
KRAKEN_API_SECRET=your_secret

# Agent Config
AGENT_MODE=paper  # paper or live
LOG_LEVEL=INFO
```

### Docker Deployment

```bash
# Build
cd backend
docker build -t cryptoops-agents .

# Run locally
docker run -d \
  --name cryptoops-agents \
  --env-file .env \
  -p 8000:8000 \
  cryptoops-agents

# Check logs
docker logs -f cryptoops-agents
```

### Northflank Deployment

1. **Create New Service**
   - Go to Northflank dashboard
   - Create new service from Dockerfile
   - Point to `backend/` directory

2. **Configure Environment**
   - Add all env variables from `.env`
   - Set `PORT=8000`

3. **Set Resources**
   - Minimum: 0.5 vCPU, 512MB RAM
   - Recommended: 1 vCPU, 1GB RAM

4. **Enable Always On**
   - Set replicas to 1
   - Enable auto-restart
   - Configure health check endpoint: `/health`

### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Render Deployment

1. Create new Web Service
2. Connect GitHub repo
3. Set root directory to `backend`
4. Add environment variables
5. Deploy

---

## Agent Architecture

### Signal Agent
- Monitors `intelligence_signals` table
- Generates trade intents based on signal consensus
- Runs every 30 seconds

### Risk Agent
- Monitors open positions for limit breaches
- Enforces kill switch when triggered
- Runs every 10 seconds

### Execution Agent
- Processes approved trade intents
- Routes orders to optimal venues
- Handles fills and position updates
- Runs every 5 seconds

### Starting Agents

The Python backend starts all agents on boot:

```python
# backend/app/main.py
from app.agents.agent_orchestrator import AgentOrchestrator

orchestrator = AgentOrchestrator()
orchestrator.start_all()
```

Each agent sends heartbeats to the `agents` table every 30 seconds.

---

## Health Monitoring

### Agent Health Check

```bash
curl https://your-backend-url/health
```

Response:
```json
{
  "status": "healthy",
  "agents": {
    "signal_agent": "running",
    "risk_agent": "running", 
    "execution_agent": "running"
  },
  "uptime_seconds": 3600
}
```

### Database Heartbeats

Agents update `last_heartbeat` in the `agents` table. The `scheduled-monitor` edge function will mark agents as offline if heartbeat is stale (>2 minutes).

---

## Cost Estimates

| Platform | Tier | Monthly Cost | Notes |
|----------|------|--------------|-------|
| Northflank | Starter | ~$20 | 0.5 vCPU, 512MB |
| Northflank | Pro | ~$50 | 1 vCPU, 1GB |
| Railway | Hobby | ~$5-20 | Usage-based |
| Render | Starter | ~$7 | 0.5 GB RAM |
| Render | Pro | ~$25 | 2 GB RAM |

---

## Troubleshooting

### Agent Not Starting
1. Check environment variables are set
2. Verify database connectivity
3. Check Docker logs: `docker logs cryptoops-agents`

### Heartbeat Failures
1. Verify network connectivity to Supabase
2. Check service role key is valid
3. Review agent error logs

### High Latency
1. Deploy closer to Supabase region (if possible)
2. Increase instance resources
3. Optimize database queries

---

## Security Considerations

- Never expose service role key in frontend
- Use environment variables for all secrets
- Rotate API keys regularly
- Monitor audit logs for suspicious activity
- Enable IP allowlisting on Supabase if possible
