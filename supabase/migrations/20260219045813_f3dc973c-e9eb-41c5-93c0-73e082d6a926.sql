
-- P0 SAFETY: Set paper_trading_mode = true
UPDATE public.global_settings 
SET paper_trading_mode = true, updated_at = now()
WHERE id = '0351068d-2729-4635-a737-318c81b46250';

-- SEED VENUES
INSERT INTO public.venues (id, name, tenant_id, status, is_enabled, fee_tier, latency_ms, supported_instruments, venue_type, supports_reduce_only, supports_ioc_fok)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'coinbase', '241697ef-b8b6-463b-890f-6ea82480c353', 'healthy', true, 'standard', 50, ARRAY['BTC/USD','ETH/USD','SOL/USD','AVAX/USD','LINK/USD','DOT/USD'], 'spot', false, true),
  ('a1000000-0000-0000-0000-000000000002', 'kraken', '241697ef-b8b6-463b-890f-6ea82480c353', 'healthy', true, 'standard', 60, ARRAY['BTC/USD','ETH/USD','SOL/USD','AVAX/USD','LINK/USD','DOT/USD'], 'spot', true, true),
  ('a1000000-0000-0000-0000-000000000003', 'binance_us', '241697ef-b8b6-463b-890f-6ea82480c353', 'healthy', true, 'standard', 40, ARRAY['BTC/USD','ETH/USD','SOL/USD','AVAX/USD','LINK/USD','DOT/USD'], 'spot', false, true)
ON CONFLICT DO NOTHING;

-- SEED BOOKS
INSERT INTO public.books (id, name, type, status, capital_allocated, current_exposure, max_drawdown_limit, risk_tier)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Primary Spot Book', 'PROP', 'active', 100000, 0, 10, 1),
  ('b1000000-0000-0000-0000-000000000002', 'Arbitrage Book', 'PROP', 'active', 50000, 0, 5, 2),
  ('b1000000-0000-0000-0000-000000000003', 'Hedge Book', 'HEDGE', 'active', 75000, 0, 8, 1)
ON CONFLICT DO NOTHING;

-- SEED RISK LIMITS
INSERT INTO public.risk_limits (book_id, max_leverage, max_daily_loss, max_intraday_drawdown, max_concentration, max_correlation_exposure)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 2.0, 5000, 3.0, 40, 30),
  ('b1000000-0000-0000-0000-000000000002', 1.5, 2500, 2.0, 50, 25),
  ('b1000000-0000-0000-0000-000000000003', 1.0, 3000, 2.5, 35, 30)
ON CONFLICT DO NOTHING;

-- SEED BOOK BUDGETS
INSERT INTO public.book_budgets (book_id, allocated_capital, used_capital, max_daily_loss, current_daily_pnl, period_start, period_end)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 100000, 0, 5000, 0, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day'),
  ('b1000000-0000-0000-0000-000000000002', 50000, 0, 2500, 0, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day'),
  ('b1000000-0000-0000-0000-000000000003', 75000, 0, 3000, 0, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- SEED INSTRUMENTS
INSERT INTO public.instruments (id, common_symbol, venue_symbol, venue_id, tenant_id, contract_type, multiplier)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'BTC/USD', 'BTC-USD', 'a1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000002', 'ETH/USD', 'ETH-USD', 'a1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000003', 'SOL/USD', 'SOL-USD', 'a1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000011', 'BTC/USD', 'XXBTZUSD', 'a1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000012', 'ETH/USD', 'XETHZUSD', 'a1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000013', 'SOL/USD', 'SOLUSD', 'a1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000021', 'BTC/USD', 'BTCUSD', 'a1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000022', 'ETH/USD', 'ETHUSD', 'a1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1),
  ('c1000000-0000-0000-0000-000000000023', 'SOL/USD', 'SOLUSD', 'a1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', 'spot', 1)
ON CONFLICT DO NOTHING;

-- SEED FEES
INSERT INTO public.fees (venue_id, tenant_id, tier, maker_bps, taker_bps, withdraw_fees)
VALUES
  ('a1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', 'standard', 6, 10, '{"BTC": 0.0001, "ETH": 0.001, "USD": 0}'::jsonb),
  ('a1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', 'standard', 8, 12, '{"BTC": 0.00015, "ETH": 0.0015, "USD": 0}'::jsonb),
  ('a1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', 'standard', 5, 10, '{"BTC": 0.0001, "ETH": 0.001, "USD": 0}'::jsonb)
ON CONFLICT DO NOTHING;

-- SEED STRATEGIES (using correct enum: off, paper, live)
INSERT INTO public.strategies (id, name, strategy_type, book_id, tenant_id, enabled, status, risk_tier, timeframe, asset_class, min_notional, max_notional, max_drawdown, capacity_estimate, venue_scope, pnl)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'BTC Spot Momentum', 'spot', 'b1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', true, 'paper', 1, '1h', 'crypto', 100, 25000, 5, 50000, ARRAY['coinbase','kraken','binance_us'], 0),
  ('d1000000-0000-0000-0000-000000000002', 'Cross-Exchange Arb', 'spot_arb', 'b1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', true, 'paper', 2, '1m', 'crypto', 500, 10000, 2, 25000, ARRAY['coinbase','kraken','binance_us'], 0),
  ('d1000000-0000-0000-0000-000000000003', 'ETH Basis Trade', 'basis', 'b1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', true, 'paper', 1, '4h', 'crypto', 200, 20000, 3, 40000, ARRAY['coinbase','kraken'], 0),
  ('d1000000-0000-0000-0000-000000000004', 'Futures Scalper', 'futures_scalp', 'b1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', false, 'off', 3, '5m', 'crypto', 100, 5000, 2, 15000, ARRAY['binance_us'], 0)
ON CONFLICT DO NOTHING;

-- SEED STRATEGY ALLOCATIONS
INSERT INTO public.strategy_allocations (strategy_id, tenant_id, allocation_pct, allocated_capital, leverage_cap, risk_multiplier)
VALUES
  ('d1000000-0000-0000-0000-000000000001', '241697ef-b8b6-463b-890f-6ea82480c353', 30, 30000, 2.0, 1.0),
  ('d1000000-0000-0000-0000-000000000002', '241697ef-b8b6-463b-890f-6ea82480c353', 25, 12500, 1.5, 0.8),
  ('d1000000-0000-0000-0000-000000000003', '241697ef-b8b6-463b-890f-6ea82480c353', 25, 18750, 1.0, 0.9),
  ('d1000000-0000-0000-0000-000000000004', '241697ef-b8b6-463b-890f-6ea82480c353', 20, 20000, 2.0, 1.2)
ON CONFLICT DO NOTHING;

-- SEED SYSTEM HEALTH
INSERT INTO public.system_health (component, status, last_check_at, details)
VALUES
  ('database', 'healthy', now(), '{"version": "15", "connections": 10}'::jsonb),
  ('oms', 'healthy', now(), '{"orders_processed": 0, "latency_ms": 15}'::jsonb),
  ('risk_engine', 'healthy', now(), '{"limits_configured": 3, "breaches": 0}'::jsonb),
  ('market_data', 'healthy', now(), '{"sources": ["coinbase","kraken","binance_us"], "staleness_ms": 0}'::jsonb),
  ('venues', 'healthy', now(), '{"enabled": 3, "degraded": 0}'::jsonb),
  ('cache', 'healthy', now(), '{"type": "in-memory", "hit_rate": 0}'::jsonb)
ON CONFLICT DO NOTHING;

-- ASSIGN USER ROLES
INSERT INTO public.user_roles (user_id, role)
VALUES
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'trader'),
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'cio'),
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'ops')
ON CONFLICT DO NOTHING;

-- ASSIGN USER TO BOOKS
INSERT INTO public.user_book_assignments (user_id, book_id)
VALUES
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'b1000000-0000-0000-0000-000000000001'),
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'b1000000-0000-0000-0000-000000000002'),
  ('746515c6-c3cb-4d66-a5b5-c3139b4b98c1', 'b1000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;
