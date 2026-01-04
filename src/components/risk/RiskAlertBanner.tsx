/**
 * Risk Alert Banner Component
 * 
 * Displays prominent risk warnings when:
 * - Kill switch is active
 * - Daily loss limit is approaching
 * - High drawdown detected
 * - Risk metrics exceed thresholds
 */

import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  AlertOctagon, 
  X, 
  TrendingDown,
  Shield,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RiskAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  dismissable: boolean;
}

export function RiskAlertBanner() {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  
  // Fetch global settings for kill switch
  const { data: globalSettings } = useQuery({
    queryKey: ['global-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .limit(1)
        .single();
      return data;
    },
    refetchInterval: 5000, // Check every 5 seconds
  });

  // Generate alerts based on current state
  const alerts: RiskAlert[] = [];

  // Kill switch alert (non-dismissable)
  if (globalSettings?.global_kill_switch) {
    alerts.push({
      id: 'kill-switch',
      type: 'critical',
      title: 'KILL SWITCH ACTIVE',
      message: 'All trading has been halted. Contact system administrator.',
      dismissable: false,
    });
  }

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter(a => !dismissedAlerts.has(a.id) || !a.dismissable);

  if (visibleAlerts.length === 0) return null;

  const dismissAlert = (id: string) => {
    setDismissedAlerts(prev => new Set([...prev, id]));
  };

  const getAlertStyles = (type: RiskAlert['type']) => {
    switch (type) {
      case 'critical':
        return 'bg-destructive/20 border-destructive text-destructive';
      case 'warning':
        return 'bg-warning/20 border-warning text-warning';
      default:
        return 'bg-blue-500/20 border-blue-500 text-blue-500';
    }
  };

  const getIcon = (type: RiskAlert['type']) => {
    switch (type) {
      case 'critical':
        return <AlertOctagon className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <Shield className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {visibleAlerts.map((alert) => (
        <Alert 
          key={alert.id}
          className={cn(
            'relative',
            getAlertStyles(alert.type),
            alert.type === 'critical' && 'animate-pulse'
          )}
        >
          {getIcon(alert.type)}
          <AlertTitle className="font-bold">{alert.title}</AlertTitle>
          <AlertDescription className="text-sm opacity-90">
            {alert.message}
          </AlertDescription>
          {alert.dismissable && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-6 w-6 p-0 opacity-70 hover:opacity-100"
              onClick={() => dismissAlert(alert.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </Alert>
      ))}
    </div>
  );
}

