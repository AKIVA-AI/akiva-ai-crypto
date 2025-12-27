-- Create a function to log audit events from triggers
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _severity alert_severity;
  _resource_type TEXT;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
  END IF;
  
  -- Set resource type from table name
  _resource_type := TG_TABLE_NAME;
  
  -- Set severity based on table importance
  IF TG_TABLE_NAME IN ('global_settings', 'user_roles', 'books') THEN
    _severity := 'warning';
  ELSE
    _severity := 'info';
  END IF;

  -- Insert audit event
  INSERT INTO public.audit_events (
    action,
    resource_type,
    resource_id,
    user_id,
    severity,
    before_state,
    after_state
  ) VALUES (
    _action,
    _resource_type,
    COALESCE(NEW.id::text, OLD.id::text),
    auth.uid(),
    _severity,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add audit triggers to important tables
CREATE TRIGGER audit_global_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_books
  AFTER INSERT OR UPDATE OR DELETE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_strategies
  AFTER INSERT OR UPDATE OR DELETE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_positions
  AFTER INSERT OR UPDATE OR DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_venues
  AFTER INSERT OR UPDATE OR DELETE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_risk_limits
  AFTER INSERT OR UPDATE OR DELETE ON public.risk_limits
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_circuit_breaker_events
  AFTER INSERT ON public.circuit_breaker_events
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_alerts
  AFTER INSERT OR UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Enable realtime for audit_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_events;