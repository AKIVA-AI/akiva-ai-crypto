import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Wifi, WifiOff, RefreshCw, AlertCircle, Cloud } from 'lucide-react';

interface WebSocketHealthMonitorProps {
  isConnected: boolean;
  isConnecting?: boolean;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
  latencyMs?: number | null;
  error?: string | null;
  lastConnectedAt?: number | null;
  onReconnect?: () => void;
  compact?: boolean;
  className?: string;
  usingFallback?: boolean;
}

export function WebSocketHealthMonitor({
  isConnected,
  isConnecting = false,
  reconnectAttempts = 0,
  maxReconnectAttempts = 10,
  latencyMs = null,
  error = null,
  lastConnectedAt = null,
  onReconnect,
  compact = false,
  className,
  usingFallback = false,
}: WebSocketHealthMonitorProps) {
  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-success';
    if (ms < 150) return 'text-warning';
    return 'text-destructive';
  };

  const getConnectionStatus = () => {
    if (usingFallback) return 'fallback';
    if (isConnected) return 'connected';
    if (isConnecting) return 'connecting';
    if (error) return 'error';
    if (reconnectAttempts > 0) return 'reconnecting';
    return 'disconnected';
  };

  const status = getConnectionStatus();

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-success border-success/50',
      bg: 'bg-success/10',
      label: 'Live',
    },
    fallback: {
      icon: Cloud,
      color: 'text-chart-3 border-chart-3/50',
      bg: 'bg-chart-3/10',
      label: 'REST API',
    },
    connecting: {
      icon: RefreshCw,
      color: 'text-warning border-warning/50',
      bg: 'bg-warning/10',
      label: 'Connecting...',
    },
    reconnecting: {
      icon: RefreshCw,
      color: 'text-warning border-warning/50',
      bg: 'bg-warning/10',
      label: `Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})`,
    },
    error: {
      icon: AlertCircle,
      color: 'text-destructive border-destructive/50',
      bg: 'bg-destructive/10',
      label: 'Connection Error',
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-muted-foreground border-muted/50',
      bg: 'bg-muted/10',
      label: 'Disconnected',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn('gap-1 cursor-help', config.color, className)}
          >
            <Icon className={cn(
              'h-3 w-3',
              (status === 'connecting' || status === 'reconnecting') && 'animate-spin'
            )} />
            {latencyMs !== null && isConnected && (
              <span className={cn('text-[10px] font-mono', getLatencyColor(latencyMs))}>
                {latencyMs}ms
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="space-y-1 text-xs">
            <p className="font-medium">{config.label}</p>
            {latencyMs !== null && <p>Latency: {latencyMs}ms</p>}
            {error && <p className="text-destructive">{error}</p>}
            {lastConnectedAt && (
              <p className="text-muted-foreground">
                Last connected: {new Date(lastConnectedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn('flex items-center gap-3 p-2 rounded-lg', config.bg, className)}>
      <div className={cn('flex items-center gap-2', config.color)}>
        <Icon className={cn(
          'h-4 w-4',
          (status === 'connecting' || status === 'reconnecting') && 'animate-spin'
        )} />
        <span className="text-sm font-medium">{config.label}</span>
      </div>

      {latencyMs !== null && isConnected && (
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className={cn('text-xs font-mono', getLatencyColor(latencyMs))}>
            {latencyMs}ms
          </span>
        </div>
      )}

      {error && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-auto text-xs text-primary hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
