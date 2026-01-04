-- Fix mutable search_path security warning for current_tenant_id function
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid() AND is_default = true LIMIT 1),
    (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid() ORDER BY created_at ASC LIMIT 1)
  );
$function$;