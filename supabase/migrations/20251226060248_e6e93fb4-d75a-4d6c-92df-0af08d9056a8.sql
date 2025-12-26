-- Create notification_channels table for webhook configurations
CREATE TABLE public.notification_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('telegram', 'discord', 'slack', 'webhook')),
  webhook_url TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_types TEXT[] NOT NULL DEFAULT ARRAY['critical', 'warning']::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Notification channels viewable by authenticated" 
  ON public.notification_channels 
  FOR SELECT 
  USING (true);

CREATE POLICY "Admin/CIO can manage notification channels" 
  ON public.notification_channels 
  FOR ALL 
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role]));

-- Create notification_logs table to track sent notifications
CREATE TABLE public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for logs
CREATE POLICY "Notification logs viewable by authenticated" 
  ON public.notification_logs 
  FOR SELECT 
  USING (true);

CREATE POLICY "System can manage notification logs" 
  ON public.notification_logs 
  FOR ALL 
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'cio'::app_role, 'ops'::app_role]));

-- Add updated_at trigger
CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();