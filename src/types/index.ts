// Comprehensive type definitions for the trading platform

import type { Database } from '@/integrations/supabase/types';

// ============ Realtime Subscription Types ============
export interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T | null;
  old: T | null;
  schema: string;
  table: string;
  commit_timestamp: string;
}

export interface AlertPayload {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface RiskBreachPayload {
  id: string;
  book_id: string;
  breach_type: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  current_value: number;
  limit_value: number;
  is_resolved: boolean;
  created_at: string;
}

export interface CircuitBreakerPayload {
  id: string;
  book_id: string | null;
  trigger_type: string;
  action_taken: string;
  triggered_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VenuePayload {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  is_enabled: boolean;
  latency_ms: number;
}

export interface BookPayload {
  id: string;
  name: string;
  status: 'active' | 'frozen';
  type: string;
  capital_allocated: number;
}

export interface StrategyPayload {
  id: string;
  name: string;
  status: 'off' | 'paper' | 'live';
  book_id: string;
}

export interface OrderPayload {
  id: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price: number | null;
  status: 'open' | 'filled' | 'rejected' | 'cancelled';
}

export interface MemeMetricsPayload {
  id: string;
  project_id: string;
  liquidity_health: number;
  pnl: number;
}

// ============ WebSocket Types ============
export interface WebSocketMessage {
  type: string;
  channel: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface PriceTick {
  instrument: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

// ============ Order Book Types ============
export interface OrderBookData {
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
  lastUpdateId?: number;
  b?: Array<[string, string]>;
  a?: Array<[string, string]>;
  u?: number;
}

// ============ Price Ticker Types ============
export interface BinanceTickerMessage {
  data: {
    s: string; // Symbol
    c: string; // Close price
    P: string; // Price change percent
    q: string; // Quote volume
    h: string; // High price
    l: string; // Low price
    b: string; // Best bid
    a: string; // Best ask
    E: number; // Event time
  };
}

// ============ Audit Types ============
export interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  user_email: string | null;
  book_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ============ Position Types ============
export interface Position {
  id: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  mark_price: number;
  unrealized_pnl: number;
  realized_pnl: number;
  leverage: number;
  liquidation_price: number | null;
  is_open: boolean;
  book_id: string;
  strategy_id: string | null;
  venue_id: string | null;
  created_at: string;
  updated_at: string;
  venues?: { name: string } | null;
}

// ============ Chart Types ============
export interface ChartTooltipFormatter {
  value: number;
  name: string;
}

// ============ Error Handler Types ============
export interface ErrorWithMessage {
  message: string;
}

// ============ Supabase Related Entity with Joins ============
export interface OrderWithRelations {
  id: string;
  instrument: string;
  side: 'buy' | 'sell';
  size: number;
  price: number | null;
  filled_size: number;
  filled_price: number | null;
  status: 'open' | 'filled' | 'rejected' | 'cancelled';
  created_at: string;
  venues?: { name: string } | null;
  books?: { name: string } | null;
  strategies?: { name: string } | null;
}

export interface TradeIntentWithRelations {
  id: string;
  instrument: string;
  direction: 'buy' | 'sell';
  target_exposure_usd: number;
  max_loss_usd: number;
  confidence: number;
  status: string;
  created_at: string;
  books?: { name: string } | null;
}

export interface StrategySignalWithRelations {
  id: string;
  instrument: string;
  direction: 'buy' | 'sell';
  signal_type: string;
  strength: number;
  created_at: string;
  strategies?: { name: string } | null;
}

export interface StrategyWithRelations {
  id: string;
  name: string;
  status: 'off' | 'paper' | 'live';
  book_id: string;
  risk_tier: number;
  pnl: number;
  max_drawdown: number;
  asset_class: string;
  timeframe: string;
  created_at: string;
  books?: { name: string } | null;
}

// ============ Notification Types ============
export interface NotificationLog {
  id: string;
  channel_id: string | null;
  alert_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
  channel?: { name: string } | null;
}

// ============ Counterparty Risk Types ============
export interface CounterpartyExposure {
  exposure: number;
  concentration_pct: number;
  risk_score: number;
}

// ============ Stress Test Types ============
export interface StressTestScenario {
  scenario_name: string;
  portfolio_return: number;
  max_drawdown: number;
  var_breached: boolean;
  liquidity_impact: number;
  recovery_time_days: number;
  risk_metrics: {
    volatility: number;
    sharpe_ratio: number;
    sortino_ratio: number;
  };
}

// ============ Context Data Types (for edge functions) ============
export interface SignalContextData {
  signal?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  recentSignals?: Record<string, unknown>[];
  recentIntents?: Record<string, unknown>[];
  marketData?: Record<string, unknown>[];
}

// ============ Webhook Payload Types ============
export interface DiscordWebhookPayload {
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline: boolean }>;
    timestamp: string;
    footer: { text: string };
  }>;
}

export interface TelegramWebhookPayload {
  text: string;
  parse_mode: string;
}

export interface SlackWebhookPayload {
  attachments: Array<{
    color: string;
    title: string;
    text: string;
    fields: Array<{ title: string; value: string; short: boolean }>;
    ts: number;
  }>;
}

export interface GenericWebhookPayload {
  alert_id: string;
  title: string;
  message: string;
  severity: string;
  source: string;
  timestamp: string;
}

export type WebhookPayload = 
  | DiscordWebhookPayload 
  | TelegramWebhookPayload 
  | SlackWebhookPayload 
  | GenericWebhookPayload;
