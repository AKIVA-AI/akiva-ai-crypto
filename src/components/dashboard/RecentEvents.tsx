import { useAlerts } from '@/hooks/useAlerts';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, Info, XCircle, AlertOctagon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const severityIcons = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

const severityColors = {
  info: 'text-primary',
  warning: 'text-warning',
  critical: 'text-destructive',
};

export function RecentEvents() {
  const { data: alerts = [], isLoading } = useAlerts(5);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl p-4 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Recent Alerts
        </h3>
        <Link to="/observability" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      
      {alerts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No alerts</p>
          <p className="text-sm">All systems operating normally</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const Icon = severityIcons[alert.severity] || Info;
            return (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/30',
                  alert.severity === 'critical' && 'border-destructive/30 bg-destructive/5',
                  alert.severity === 'warning' && 'border-warning/20'
                )}
              >
                <Icon className={cn('h-4 w-4 mt-0.5', severityColors[alert.severity] || 'text-primary')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{alert.title}</span>
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'warning' ? 'secondary' : 'default'} className="text-xs">
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{alert.source}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
