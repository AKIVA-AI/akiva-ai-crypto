-- Create arbitrage_executions table to track all arbitrage trades
CREATE TABLE public.arbitrage_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  buy_exchange TEXT NOT NULL,
  sell_exchange TEXT NOT NULL,
  buy_price NUMERIC NOT NULL,
  sell_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  spread_percent NUMERIC NOT NULL,
  gross_profit NUMERIC NOT NULL,
  trading_fees NUMERIC NOT NULL DEFAULT 0,
  withdrawal_fee NUMERIC NOT NULL DEFAULT 0,
  slippage NUMERIC NOT NULL DEFAULT 0,
  net_profit NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  buy_order_id TEXT,
  sell_order_id TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arbitrage_executions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Arbitrage executions viewable by traders and above"
  ON public.arbitrage_executions
  FOR SELECT
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role, 'ops'::app_role]));

CREATE POLICY "Traders can create arbitrage executions"
  ON public.arbitrage_executions
  FOR INSERT
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role]));

CREATE POLICY "Traders can update arbitrage executions"
  ON public.arbitrage_executions
  FOR UPDATE
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'trader'::app_role]));

-- Create index for faster queries
CREATE INDEX idx_arbitrage_executions_status ON public.arbitrage_executions(status);
CREATE INDEX idx_arbitrage_executions_created_at ON public.arbitrage_executions(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_arbitrage_executions_updated_at
  BEFORE UPDATE ON public.arbitrage_executions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();