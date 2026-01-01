import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Database, 
  TrendingUp, 
  Server, 
  Shield, 
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { 
  useSystemHealth, 
  runHealthChecks, 
  CRITICAL_HEALTH_COMPONENTS,
  type HealthStatus,
  type SystemHealthComponent,
} from '@/hooks/useSystemHealth';
import { supabase } from '@/integrations/supabase/client';

const COMPONENT_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  description: string;
}> = {
  database: {
    label: 'Database',
    icon: Database,
    description: 'Supabase PostgreSQL connection',
  },
  market_data: {
    label: 'Market Data',
    icon: TrendingUp,
    description: 'Price feeds and data freshness',
  },
  venues: {
    label: 'Trading Venues',
    icon: Server,
    description: 'Exchange connectivity status',
  },
  oms: {
    label: 'Order Management',
    icon: Zap,
    description: 'Order routing and execution',
  },
  risk_engine: {
    label: 'Risk Engine',
    icon: Shield,
    description: 'Risk controls and limits',
  },
  cache: {
    label: 'Cache',
    icon: Activity,
    description: 'Redis cache performance',
  },
};

const STATUS_CONFIG: Record<HealthStatus, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  healthy: {
    label: 'Healthy',
    color: 'bg-success/20 text-success border-success/30',
    icon: CheckCircle,
  },
  degraded: {
    label: 'Degraded',
    color: 'bg-warning/20 text-warning border-warning/30',
    icon: AlertTriangle,
  },
  unhealthy: {
    label: 'Unhealthy',
    color: 'bg-destructive/20 text-destructive border-destructive/30',
    icon: XCircle,
  },
};

function HealthComponentCard({ component }: { component: SystemHealthComponent }) {
  const config = COMPONENT_CONFIG[component.component] || {
    label: component.component,
    icon: Activity,
    description: 'System component',
  };
  const statusConfig = STATUS_CONFIG[component.status];
  const StatusIcon = statusConfig.icon;
  const ComponentIcon = config.icon;
  
  return (
    <Card className={cn('border-l-4', statusConfig.color.split(' ')[2])}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn('p-2 rounded-lg', statusConfig.color.split(' ')[0])}>
              <ComponentIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium flex items-center gap-2">
                {config.label}
                <StatusIcon className={cn('h-4 w-4', statusConfig.color.split(' ')[1])} />
              </div>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <Badge variant="outline" className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
        </div>
        
        {/* Details */}
        {component.details && Object.keys(component.details).length > 0 && (
          <div className="mt-3 pt-3 border-t text-xs space-y-1">
            {Object.entries(component.details).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                <span className="font-mono">{String(value)}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Error message */}
        {component.error_message && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded p-2">
            {component.error_message}
          </div>
        )}
        
        {/* Last check time */}
        <div className="mt-2 text-xs text-muted-foreground">
          Last check: {formatDistanceToNow(new Date(component.last_check_at), { addSuffix: true })}
        </div>
      </CardContent>
    </Card>
  );
}

export function SystemHealthPanel() {
  const { data: health, isLoading, refetch } = useSystemHealth();
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  
  const runChecks = async () => {
    setIsRunningChecks(true);
    try {
      const results = await runHealthChecks();
      
      // Persist results to DB
      for (const result of results) {
        await supabase
          .from('system_health')
          .upsert({
            component: result.component,
            status: result.status,
            details: result.details as unknown as Record<string, unknown>,
            error_message: result.error_message,
            last_check_at: result.last_check_at,
          } as never, { onConflict: 'component' });
      }
      
      refetch();
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsRunningChecks(false);
    }
  };
  
  // Run health checks on mount
  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const overallStatus = health?.overall || 'healthy';
  const overallConfig = STATUS_CONFIG[overallStatus];
  const OverallIcon = overallConfig.icon;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              System Health
            </CardTitle>
            <CardDescription>
              Real-time health monitoring for all system components
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-sm', overallConfig.color)}>
              <OverallIcon className="h-4 w-4 mr-1" />
              {overallConfig.label}
            </Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runChecks}
              disabled={isRunningChecks}
              className="gap-1"
            >
              {isRunningChecks ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Run Checks
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Ready indicator */}
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              health?.isReady ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
            )}>
              {health?.isReady ? (
                <>
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">System Ready for Trading</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">System Not Ready - Critical components unhealthy</span>
                </>
              )}
            </div>
            
            {/* Component grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {health?.components.map((component) => (
                <HealthComponentCard key={component.id} component={component} />
              ))}
            </div>
            
            {/* Empty state if no components */}
            {(!health?.components || health.components.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No health data available</p>
                <p className="text-xs mt-1">Click "Run Checks" to perform health checks</p>
              </div>
            )}
            
            {/* Last updated */}
            {health?.lastUpdated && (
              <div className="text-xs text-muted-foreground text-center">
                Last updated: {formatDistanceToNow(health.lastUpdated, { addSuffix: true })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
