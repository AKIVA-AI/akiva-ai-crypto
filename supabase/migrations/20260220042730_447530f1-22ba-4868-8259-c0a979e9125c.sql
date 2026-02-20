
-- Enable pg_cron and pg_net extensions for scheduled edge function invocations
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role (required for pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================================================
-- Auto Circuit Breaker: Trigger that checks daily P&L against book limits
-- and auto-activates kill switch when breached
-- ============================================================================

-- Function that checks if any book has breached its daily loss limit
-- Called by trigger on fills table (every new fill updates P&L)
CREATE OR REPLACE FUNCTION public.check_daily_pnl_circuit_breaker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _book_id uuid;
  _book_name text;
  _daily_pnl numeric;
  _max_daily_loss numeric;
  _capital numeric;
  _pnl_pct numeric;
BEGIN
  -- Get the book_id from the order associated with this fill
  SELECT o.book_id INTO _book_id
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF _book_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get book details and risk limits
  SELECT b.name, b.capital_allocated, rl.max_daily_loss
  INTO _book_name, _capital, _max_daily_loss
  FROM books b
  LEFT JOIN risk_limits rl ON rl.book_id = b.id
  WHERE b.id = _book_id;

  IF _max_daily_loss IS NULL OR _capital IS NULL OR _capital <= 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate today's realized P&L for this book from fills
  SELECT COALESCE(SUM(
    CASE 
      WHEN f.side = 'sell' THEN f.price * f.size - f.fee
      ELSE -(f.price * f.size + f.fee)
    END
  ), 0)
  INTO _daily_pnl
  FROM fills f
  JOIN orders o ON o.id = f.order_id
  WHERE o.book_id = _book_id
    AND f.executed_at >= CURRENT_DATE;

  -- Also add unrealized P&L from open positions
  SELECT _daily_pnl + COALESCE(SUM(unrealized_pnl), 0)
  INTO _daily_pnl
  FROM positions
  WHERE book_id = _book_id AND is_open = true;

  _pnl_pct := ABS(_daily_pnl) / _capital * 100;

  -- Check if daily loss limit breached (max_daily_loss is stored as percentage)
  IF _daily_pnl < 0 AND _pnl_pct > _max_daily_loss THEN
    -- 1. Freeze the book
    UPDATE books SET status = 'frozen' WHERE id = _book_id;

    -- 2. Log circuit breaker event
    INSERT INTO circuit_breaker_events (trigger_type, action_taken, book_id, metadata)
    VALUES (
      'daily_pnl_breach',
      'book_frozen',
      _book_id,
      jsonb_build_object(
        'daily_pnl', _daily_pnl,
        'pnl_pct', _pnl_pct,
        'max_daily_loss_pct', _max_daily_loss,
        'book_name', _book_name,
        'triggered_at', now()
      )
    );

    -- 3. Create alert
    INSERT INTO alerts (title, message, severity, source, metadata)
    VALUES (
      'Circuit Breaker: Book Frozen',
      format('Book "%s" frozen: daily loss %.2f%% exceeds limit %.2f%%', _book_name, _pnl_pct, _max_daily_loss),
      'critical',
      'circuit_breaker',
      jsonb_build_object('book_id', _book_id, 'daily_pnl', _daily_pnl, 'limit', _max_daily_loss)
    );

    -- 4. Create risk breach record
    INSERT INTO risk_breaches (book_id, breach_type, current_value, limit_value, description, severity)
    VALUES (
      _book_id,
      'daily_loss',
      _pnl_pct,
      _max_daily_loss,
      format('Auto circuit breaker: daily loss %.2f%% exceeds %.2f%% limit', _pnl_pct, _max_daily_loss),
      'critical'
    );

    -- 5. If ALL books are now frozen, activate global kill switch
    IF NOT EXISTS (SELECT 1 FROM books WHERE status NOT IN ('frozen', 'halted')) THEN
      UPDATE global_settings SET global_kill_switch = true, updated_at = now();
      
      INSERT INTO circuit_breaker_events (trigger_type, action_taken, metadata)
      VALUES (
        'all_books_frozen',
        'global_kill_switch_activated',
        jsonb_build_object('reason', 'All trading books frozen by circuit breaker', 'triggered_at', now())
      );

      INSERT INTO alerts (title, message, severity, source)
      VALUES (
        'GLOBAL KILL SWITCH ACTIVATED',
        'All trading books have been frozen by circuit breakers. Global kill switch engaged.',
        'critical',
        'circuit_breaker'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to fills table (fires after every new fill)
DROP TRIGGER IF EXISTS circuit_breaker_on_fill ON fills;
CREATE TRIGGER circuit_breaker_on_fill
  AFTER INSERT ON fills
  FOR EACH ROW
  EXECUTE FUNCTION check_daily_pnl_circuit_breaker();

-- Also check on position updates (unrealized P&L changes)
CREATE OR REPLACE FUNCTION public.check_position_circuit_breaker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _book_name text;
  _capital numeric;
  _max_daily_loss numeric;
  _total_unrealized numeric;
  _pnl_pct numeric;
BEGIN
  -- Only check when unrealized_pnl is updated and position is open
  IF NEW.is_open = false THEN
    RETURN NEW;
  END IF;

  -- Get book details
  SELECT b.name, b.capital_allocated, rl.max_daily_loss
  INTO _book_name, _capital, _max_daily_loss
  FROM books b
  LEFT JOIN risk_limits rl ON rl.book_id = b.id
  WHERE b.id = NEW.book_id;

  IF _max_daily_loss IS NULL OR _capital IS NULL OR _capital <= 0 THEN
    RETURN NEW;
  END IF;

  -- Sum all unrealized P&L for this book
  SELECT COALESCE(SUM(unrealized_pnl), 0)
  INTO _total_unrealized
  FROM positions
  WHERE book_id = NEW.book_id AND is_open = true;

  _pnl_pct := ABS(_total_unrealized) / _capital * 100;

  -- If unrealized loss exceeds 80% of daily limit, set book to reduce_only
  IF _total_unrealized < 0 AND _pnl_pct > (_max_daily_loss * 0.8) THEN
    -- Only upgrade status, never downgrade
    IF (SELECT status FROM books WHERE id = NEW.book_id) = 'active' THEN
      UPDATE books SET status = 'reduce_only' WHERE id = NEW.book_id;
      
      INSERT INTO alerts (title, message, severity, source, metadata)
      VALUES (
        'Book Set to Reduce-Only',
        format('Book "%s": unrealized loss %.2f%% approaching daily limit %.2f%%', _book_name, _pnl_pct, _max_daily_loss),
        'warning',
        'circuit_breaker',
        jsonb_build_object('book_id', NEW.book_id, 'unrealized_pnl', _total_unrealized, 'threshold', _max_daily_loss * 0.8)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS circuit_breaker_on_position_update ON positions;
CREATE TRIGGER circuit_breaker_on_position_update
  AFTER UPDATE OF unrealized_pnl ON positions
  FOR EACH ROW
  EXECUTE FUNCTION check_position_circuit_breaker();
