-- Create agents table to replace mock data
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('market-data', 'strategy', 'execution', 'risk', 'treasury', 'ops')),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'degraded')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  uptime NUMERIC NOT NULL DEFAULT 0,
  cpu_usage NUMERIC NOT NULL DEFAULT 0,
  memory_usage NUMERIC NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  error_message TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create wallets table for treasury
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('ethereum', 'bitcoin', 'solana', 'base', 'arbitrum', 'optimism', 'polygon')),
  type TEXT NOT NULL DEFAULT 'hot' CHECK (type IN ('hot', 'cold', 'multisig')),
  currency TEXT NOT NULL DEFAULT 'USDC',
  balance NUMERIC NOT NULL DEFAULT 0,
  usd_value NUMERIC NOT NULL DEFAULT 0,
  pending_approvals INTEGER NOT NULL DEFAULT 0,
  signers INTEGER NOT NULL DEFAULT 1,
  required_signers INTEGER NOT NULL DEFAULT 1,
  is_watch_only BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Agents policies - viewable by authenticated, managed by ops/admin
CREATE POLICY "Agents viewable by authenticated"
  ON public.agents FOR SELECT
  USING (true);

CREATE POLICY "Ops and admin can manage agents"
  ON public.agents FOR ALL
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role]));

-- Wallets policies - viewable by authenticated, managed by admin/cio
CREATE POLICY "Wallets viewable by authenticated"
  ON public.wallets FOR SELECT
  USING (true);

CREATE POLICY "Admin/CIO can manage wallets"
  ON public.wallets FOR ALL
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role]));

-- Create update triggers
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;

-- Insert seed data for agents
INSERT INTO public.agents (name, type, status, version, capabilities, uptime, cpu_usage, memory_usage) VALUES
  ('MarketData-Prime', 'market-data', 'online', '2.4.1', ARRAY['websocket-feeds', 'order-book-l2', 'trade-history', 'funding-rates'], 99.98, 23, 45),
  ('AlphaEngine-V3', 'strategy', 'online', '3.1.0', ARRAY['signal-generation', 'portfolio-optimization', 'risk-scoring'], 99.95, 67, 72),
  ('ExecutionBot-Turbo', 'execution', 'online', '4.0.2', ARRAY['smart-routing', 'twap', 'vwap', 'iceberg', 'pov'], 99.99, 34, 28),
  ('RiskGuard-Pro', 'risk', 'online', '2.8.0', ARRAY['real-time-var', 'exposure-monitoring', 'circuit-breakers', 'drawdown-limits'], 100, 12, 35),
  ('TreasuryVault-Secure', 'treasury', 'online', '1.5.3', ARRAY['balance-tracking', 'transfer-approval', 'multi-sig', 'cold-storage'], 100, 8, 15),
  ('OpsMonitor', 'ops', 'degraded', '1.2.0', ARRAY['health-checks', 'alerting', 'log-aggregation'], 98.5, 5, 12);

-- Insert seed data for wallets
INSERT INTO public.wallets (name, address, network, type, currency, balance, usd_value, signers, required_signers) VALUES
  ('Hot Wallet - Trading', '0x742d35Cc6634C0532925a3b844Bc9e7595f8d7b2', 'ethereum', 'hot', 'USDC', 1250000, 1250000, 1, 1),
  ('Treasury Vault', '0x8ba1f109551bD432803012645Ac136ddd64DBA72', 'ethereum', 'multisig', 'USDC', 15800000, 15800000, 5, 3),
  ('Cold Storage - BTC', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'bitcoin', 'cold', 'BTC', 125.5, 8534000, 5, 4),
  ('Operations - Solana', '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', 'solana', 'hot', 'SOL', 8500, 1232500, 2, 2);