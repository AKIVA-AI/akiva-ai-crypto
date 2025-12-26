-- Create market intelligence tables

-- News and sentiment storage
CREATE TABLE public.market_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  instruments TEXT[] DEFAULT '{}',
  sentiment_score NUMERIC(3,2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  impact_score NUMERIC(3,2) CHECK (impact_score >= 0 AND impact_score <= 1),
  tags TEXT[] DEFAULT '{}',
  raw_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Social sentiment tracking
CREATE TABLE public.social_sentiment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  platform TEXT NOT NULL, -- twitter, reddit, telegram
  mention_count INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  sentiment_score NUMERIC(3,2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  velocity NUMERIC(10,2) DEFAULT 0, -- mentions per hour change
  influential_posts JSONB DEFAULT '[]',
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- On-chain analytics
CREATE TABLE public.onchain_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  network TEXT NOT NULL,
  active_addresses INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  whale_transactions INTEGER DEFAULT 0,
  exchange_inflow NUMERIC(20,8) DEFAULT 0,
  exchange_outflow NUMERIC(20,8) DEFAULT 0,
  holder_count INTEGER DEFAULT 0,
  holder_concentration NUMERIC(5,2) DEFAULT 0, -- % held by top 10
  smart_money_flow NUMERIC(20,8) DEFAULT 0,
  gas_used NUMERIC(20,8) DEFAULT 0,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Whale wallet tracking
CREATE TABLE public.whale_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  network TEXT NOT NULL,
  label TEXT,
  category TEXT, -- exchange, fund, whale, smart_money
  balance NUMERIC(30,8) DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  is_tracked BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(address, network)
);

-- Whale transactions log
CREATE TABLE public.whale_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID REFERENCES public.whale_wallets(id),
  tx_hash TEXT NOT NULL,
  network TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  instrument TEXT NOT NULL,
  amount NUMERIC(30,8) NOT NULL,
  usd_value NUMERIC(20,2),
  direction TEXT NOT NULL, -- buy, sell, transfer
  block_number BIGINT,
  gas_price NUMERIC(20,8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Derivatives data (funding, OI, liquidations)
CREATE TABLE public.derivatives_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  venue TEXT NOT NULL,
  funding_rate NUMERIC(10,6),
  next_funding_time TIMESTAMP WITH TIME ZONE,
  open_interest NUMERIC(20,2),
  oi_change_24h NUMERIC(10,2), -- percentage
  long_short_ratio NUMERIC(6,3),
  liquidations_24h_long NUMERIC(20,2),
  liquidations_24h_short NUMERIC(20,2),
  top_trader_long_ratio NUMERIC(5,2),
  top_trader_short_ratio NUMERIC(5,2),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Intelligence signals (combined from all sources)
CREATE TABLE public.intelligence_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument TEXT NOT NULL,
  signal_type TEXT NOT NULL, -- sentiment, whale, news, derivatives, composite
  direction TEXT NOT NULL, -- bullish, bearish, neutral
  strength NUMERIC(3,2) CHECK (strength >= 0 AND strength <= 1),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  source_data JSONB DEFAULT '{}',
  reasoning TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_market_news_published ON public.market_news(published_at DESC);
CREATE INDEX idx_market_news_instruments ON public.market_news USING GIN(instruments);
CREATE INDEX idx_social_sentiment_instrument ON public.social_sentiment(instrument, recorded_at DESC);
CREATE INDEX idx_onchain_metrics_instrument ON public.onchain_metrics(instrument, recorded_at DESC);
CREATE INDEX idx_whale_transactions_created ON public.whale_transactions(created_at DESC);
CREATE INDEX idx_derivatives_metrics_instrument ON public.derivatives_metrics(instrument, recorded_at DESC);
CREATE INDEX idx_intelligence_signals_instrument ON public.intelligence_signals(instrument, created_at DESC);

-- Enable RLS
ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onchain_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derivatives_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_signals ENABLE ROW LEVEL SECURITY;

-- RLS policies (read access for authenticated users)
CREATE POLICY "Authenticated users can read market news" ON public.market_news FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read social sentiment" ON public.social_sentiment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read onchain metrics" ON public.onchain_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read whale wallets" ON public.whale_wallets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read whale transactions" ON public.whale_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read derivatives metrics" ON public.derivatives_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read intelligence signals" ON public.intelligence_signals FOR SELECT TO authenticated USING (true);

-- Service role policies for inserting/updating
CREATE POLICY "Service role can manage market news" ON public.market_news FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage social sentiment" ON public.social_sentiment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage onchain metrics" ON public.onchain_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage whale wallets" ON public.whale_wallets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage whale transactions" ON public.whale_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage derivatives metrics" ON public.derivatives_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage intelligence signals" ON public.intelligence_signals FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_news;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_sentiment;
ALTER PUBLICATION supabase_realtime ADD TABLE public.intelligence_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whale_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.derivatives_metrics;