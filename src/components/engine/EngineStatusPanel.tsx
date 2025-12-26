import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useEngineControl } from '@/hooks/useEngineControl';
import { Play, Square, RotateCw, Server, Clock, Zap, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export function EngineStatusPanel() {
  const {
    backendHealth,
    engineStatus,
    isConnected,
    isLoading,
    startEngine,
    stopEngine,
    runCycle,
    isStarting,
    isStopping,
    isRunningCycle,
    refetchHealth,
  } = useEngineControl();

  const getHealthColor = () => {
    if (!backendHealth) return 'bg-muted';
    switch (backendHealth.status) {
      case 'healthy': return 'bg-success';
      case 'degraded': return 'bg-warning';
      case 'offline': return 'bg-destructive';
      default: return 'bg-muted';
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Trading Engine
            </CardTitle>
            <CardDescription>Backend service status and controls</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetchHealth()}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Backend Status</span>
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full animate-pulse', getHealthColor())} />
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {backendHealth?.status || 'Unknown'}
            </Badge>
          </div>
        </div>

        {backendHealth && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="font-mono text-sm">{backendHealth.version}</span>
            </div>
            
            {backendHealth.uptime_seconds > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="font-mono text-sm">{formatUptime(backendHealth.uptime_seconds)}</span>
              </div>
            )}
          </>
        )}

        {!isConnected && backendHealth?.message && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{backendHealth.message}</span>
          </div>
        )}

        <Separator />

        {/* Engine Status */}
        {engineStatus && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Engine State</span>
              <Badge variant={engineStatus.running ? 'success' : 'secondary'}>
                {engineStatus.running ? 'Running' : 'Stopped'}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Mode</span>
              <Badge variant={engineStatus.paper_mode ? 'outline' : 'warning'}>
                {engineStatus.paper_mode ? 'Paper' : 'Live'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <Zap className="h-4 w-4 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Strategies</p>
                <p className="font-mono font-bold">{engineStatus.active_strategies}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Cycles</p>
                <p className="font-mono font-bold">{engineStatus.cycle_count}</p>
              </div>
            </div>

            {engineStatus.last_cycle_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Cycle</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(engineStatus.last_cycle_at), { addSuffix: true })}
                </span>
              </div>
            )}

            {engineStatus.paused_books.length > 0 && (
              <div className="p-2 rounded-lg bg-warning/10">
                <p className="text-xs text-warning mb-1">Paused Books</p>
                <div className="flex flex-wrap gap-1">
                  {engineStatus.paused_books.map((bookId) => (
                    <Badge key={bookId} variant="outline" className="text-xs">
                      {bookId.slice(0, 8)}...
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />
          </>
        )}

        {/* Controls */}
        <div className="flex gap-2">
          {engineStatus?.running ? (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => stopEngine()}
              disabled={isStopping || !isConnected}
            >
              <Square className="h-4 w-4 mr-2" />
              {isStopping ? 'Stopping...' : 'Stop Engine'}
            </Button>
          ) : (
            <Button
              variant="default"
              className="flex-1"
              onClick={() => startEngine()}
              disabled={isStarting || !isConnected}
            >
              <Play className="h-4 w-4 mr-2" />
              {isStarting ? 'Starting...' : 'Start Engine'}
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={() => runCycle()}
            disabled={isRunningCycle || !isConnected}
          >
            <RotateCw className={cn('h-4 w-4', isRunningCycle && 'animate-spin')} />
          </Button>
        </div>

        {!isConnected && (
          <p className="text-xs text-muted-foreground text-center">
            Configure Backend URL in Settings to enable controls
          </p>
        )}
      </CardContent>
    </Card>
  );
}
