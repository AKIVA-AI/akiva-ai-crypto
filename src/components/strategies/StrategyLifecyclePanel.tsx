import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Shield, Pause, Play, XCircle, Clock, History, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  useStrategiesWithLifecycle,
  useLifecycleEvents,
  useTransitionStrategy,
  LifecycleState,
  QUARANTINE_THRESHOLDS,
  shouldQuarantine,
  isQuarantineExpired,
  StrategyWithLifecycle,
} from '@/hooks/useStrategyLifecycle';

const LIFECYCLE_STATE_CONFIG: Record<LifecycleState, {
  label: string;
  color: string;
  icon: React.ElementType;
  description: string;
}> = {
  active: {
    label: 'Active',
    color: 'bg-success/20 text-success border-success/30',
    icon: Play,
    description: 'Strategy is fully enabled and can trade live',
  },
  quarantined: {
    label: 'Quarantined',
    color: 'bg-warning/20 text-warning border-warning/30',
    icon: Pause,
    description: 'Temporarily disabled due to poor performance',
  },
  disabled: {
    label: 'Disabled',
    color: 'bg-destructive/20 text-destructive border-destructive/30',
    icon: XCircle,
    description: 'Manually disabled - requires explicit re-enabling',
  },
  paper_only: {
    label: 'Paper Only',
    color: 'bg-info/20 text-info border-info/30',
    icon: Shield,
    description: 'Can only trade in paper/simulation mode',
  },
  cooldown: {
    label: 'Cooldown',
    color: 'bg-muted text-muted-foreground border-muted',
    icon: Clock,
    description: 'Waiting period after quarantine',
  },
};

interface StrategyLifecycleCardProps {
  strategy: StrategyWithLifecycle;
  onTransition: (strategyId: string, toState: LifecycleState, reason: string) => void;
  isTransitioning: boolean;
}

function StrategyLifecycleCard({ strategy, onTransition, isTransitioning }: StrategyLifecycleCardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [targetState, setTargetState] = useState<LifecycleState>('active');
  const [reason, setReason] = useState('');
  
  const { data: events, isLoading: eventsLoading } = useLifecycleEvents(strategy.id);
  
  const config = LIFECYCLE_STATE_CONFIG[strategy.lifecycle_state as LifecycleState] || LIFECYCLE_STATE_CONFIG.active;
  const StateIcon = config.icon;
  
  const quarantineCheck = shouldQuarantine(strategy);
  const expired = isQuarantineExpired(strategy);
  
  // Calculate health indicators
  const lossProgress = (strategy.consecutive_losses / QUARANTINE_THRESHOLDS.consecutive_losses_max) * 100;
  const drawdownProgress = (strategy.max_drawdown / QUARANTINE_THRESHOLDS.drawdown_quarantine_pct) * 100;
  const qualityProgress = strategy.execution_quality * 100;
  
  const handleTransition = () => {
    if (reason.trim()) {
      onTransition(strategy.id, targetState, reason);
      setShowTransition(false);
      setReason('');
    }
  };
  
  return (
    <>
      <Card className={cn('border-l-4', config.color.split(' ')[2])}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <StateIcon className="h-5 w-5" />
              <div>
                <CardTitle className="text-base">{strategy.name}</CardTitle>
                <CardDescription className="text-xs">{config.description}</CardDescription>
              </div>
            </div>
            <Badge className={cn('text-xs', config.color)}>{config.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warnings */}
          {quarantineCheck.should && strategy.lifecycle_state === 'active' && (
            <div className="flex items-center gap-2 text-warning text-sm bg-warning/10 rounded-lg p-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Auto-quarantine recommended: {quarantineCheck.reason}</span>
            </div>
          )}
          
          {expired && (
            <div className="flex items-center gap-2 text-info text-sm bg-info/10 rounded-lg p-2">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Quarantine period has expired - review for reactivation</span>
            </div>
          )}
          
          {/* Health Indicators */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Consecutive Losses</span>
              <span className={cn('font-mono', lossProgress >= 80 ? 'text-destructive' : '')}>
                {strategy.consecutive_losses} / {QUARANTINE_THRESHOLDS.consecutive_losses_max}
              </span>
            </div>
            <Progress 
              value={lossProgress} 
              className={cn('h-1', lossProgress >= 80 ? '[&>div]:bg-destructive' : '')} 
            />
            
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max Drawdown</span>
              <span className={cn('font-mono', drawdownProgress >= 80 ? 'text-destructive' : '')}>
                {strategy.max_drawdown.toFixed(1)}% / {QUARANTINE_THRESHOLDS.drawdown_quarantine_pct}%
              </span>
            </div>
            <Progress 
              value={Math.min(drawdownProgress, 100)} 
              className={cn('h-1', drawdownProgress >= 80 ? '[&>div]:bg-destructive' : '')} 
            />
            
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Execution Quality</span>
              <span className={cn('font-mono', qualityProgress < 90 ? 'text-warning' : 'text-success')}>
                {qualityProgress.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={qualityProgress} 
              className={cn('h-1', qualityProgress < 90 ? '[&>div]:bg-warning' : '[&>div]:bg-success')} 
            />
          </div>
          
          {/* Quarantine Info */}
          {strategy.lifecycle_state === 'quarantined' && strategy.quarantine_expires_at && (
            <div className="text-xs text-muted-foreground">
              Expires: {formatDistanceToNow(new Date(strategy.quarantine_expires_at), { addSuffix: true })}
            </div>
          )}
          
          {strategy.lifecycle_reason && (
            <div className="text-xs text-muted-foreground">
              Reason: <span className="font-mono">{strategy.lifecycle_reason}</span>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={() => setShowHistory(true)}
            >
              <History className="h-3 w-3" />
              History
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={() => setShowTransition(true)}
              disabled={isTransitioning}
            >
              <RefreshCw className="h-3 w-3" />
              Transition
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lifecycle History - {strategy.name}</DialogTitle>
            <DialogDescription>Recent state transitions</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            {eventsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{event.from_state}</Badge>
                        <span>→</span>
                        <Badge variant="outline">{event.to_state}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(event.created_at), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{event.reason}</span>
                      <span className="ml-2">({event.triggered_by})</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No lifecycle events recorded
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      {/* Transition Dialog */}
      <Dialog open={showTransition} onOpenChange={setShowTransition}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transition Strategy State</DialogTitle>
            <DialogDescription>
              Change the lifecycle state of "{strategy.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current State</Label>
              <Badge className={config.color}>{config.label}</Badge>
            </div>
            <div className="space-y-2">
              <Label>Target State</Label>
              <Select value={targetState} onValueChange={(v) => setTargetState(v as LifecycleState)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LIFECYCLE_STATE_CONFIG).map(([state, conf]) => (
                    <SelectItem key={state} value={state} disabled={state === strategy.lifecycle_state}>
                      {conf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea 
                placeholder="Explain why this transition is needed..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransition(false)}>Cancel</Button>
            <Button 
              onClick={handleTransition} 
              disabled={!reason.trim() || isTransitioning}
            >
              {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Transition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StrategyLifecyclePanel() {
  const { data: strategies, isLoading } = useStrategiesWithLifecycle();
  const transitionMutation = useTransitionStrategy();
  
  const handleTransition = (strategyId: string, toState: LifecycleState, reason: string) => {
    transitionMutation.mutate({ strategyId, toState, reason, triggeredBy: 'manual' });
  };
  
  // Group strategies by lifecycle state
  const grouped = {
    active: strategies?.filter(s => (s.lifecycle_state || 'active') === 'active') || [],
    quarantined: strategies?.filter(s => s.lifecycle_state === 'quarantined') || [],
    disabled: strategies?.filter(s => s.lifecycle_state === 'disabled') || [],
    paper_only: strategies?.filter(s => s.lifecycle_state === 'paper_only') || [],
    cooldown: strategies?.filter(s => s.lifecycle_state === 'cooldown') || [],
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Strategy Lifecycle Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor and control strategy states with automatic quarantine triggers
          </p>
        </div>
        <div className="flex gap-2">
          {Object.entries(grouped).map(([state, items]) => (
            items.length > 0 && (
              <Badge key={state} variant="outline" className="gap-1">
                {LIFECYCLE_STATE_CONFIG[state as LifecycleState]?.label}: {items.length}
              </Badge>
            )
          ))}
        </div>
      </div>
      
      {/* Quarantined and requiring attention */}
      {grouped.quarantined.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Quarantined Strategies ({grouped.quarantined.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grouped.quarantined.map(strategy => (
              <StrategyLifecycleCard 
                key={strategy.id} 
                strategy={strategy as StrategyWithLifecycle}
                onTransition={handleTransition}
                isTransitioning={transitionMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Active strategies */}
      {grouped.active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-success flex items-center gap-2">
            <Play className="h-4 w-4" />
            Active Strategies ({grouped.active.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grouped.active.map(strategy => (
              <StrategyLifecycleCard 
                key={strategy.id} 
                strategy={strategy as StrategyWithLifecycle}
                onTransition={handleTransition}
                isTransitioning={transitionMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Paper Only */}
      {grouped.paper_only.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Paper Only ({grouped.paper_only.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grouped.paper_only.map(strategy => (
              <StrategyLifecycleCard 
                key={strategy.id} 
                strategy={strategy as StrategyWithLifecycle}
                onTransition={handleTransition}
                isTransitioning={transitionMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Disabled */}
      {grouped.disabled.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Disabled ({grouped.disabled.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grouped.disabled.map(strategy => (
              <StrategyLifecycleCard 
                key={strategy.id} 
                strategy={strategy as StrategyWithLifecycle}
                onTransition={handleTransition}
                isTransitioning={transitionMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}
      
      {strategies?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No strategies found. Create a strategy to get started.
        </div>
      )}
    </div>
  );
}
