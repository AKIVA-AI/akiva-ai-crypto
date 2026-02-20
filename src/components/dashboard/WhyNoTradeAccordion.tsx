/**
 * Compact accordion version of "Why Didn't We Trade?"
 * Shows a count badge, expands to reveal blocked trade details.
 */
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Shield,
  TrendingDown,
  Activity,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  Lock,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type DecisionTrace,
  type BlockReason,
  getRecentTraces,
  getBlockStats,
} from '@/lib/decisionTrace';

const REASON_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  KILL_SWITCH_ACTIVE: { label: 'Kill Switch', icon: <Lock className="h-3.5 w-3.5" />, color: 'text-destructive' },
  REDUCE_ONLY_ACTIVE: { label: 'Reduce-Only', icon: <TrendingDown className="h-3.5 w-3.5" />, color: 'text-warning' },
  VOLATILITY_REGIME_HIGH: { label: 'High Vol', icon: <Activity className="h-3.5 w-3.5" />, color: 'text-warning' },
  EXECUTION_COST_EXCEEDS_EDGE: { label: 'Costs > Edge', icon: <DollarSign className="h-3.5 w-3.5" />, color: 'text-destructive' },
  UNFAVORABLE_REGIME: { label: 'Bad Regime', icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-warning' },
  CONFIDENCE_TOO_LOW: { label: 'Low Confidence', icon: <BarChart3 className="h-3.5 w-3.5" />, color: 'text-muted-foreground' },
  DATA_QUALITY_INSUFFICIENT: { label: 'Data Quality', icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-destructive' },
  POSITION_LIMIT_EXCEEDED: { label: 'Position Limit', icon: <Shield className="h-3.5 w-3.5" />, color: 'text-warning' },
  EXPOSURE_LIMIT_EXCEEDED: { label: 'Exposure Limit', icon: <Shield className="h-3.5 w-3.5" />, color: 'text-warning' },
};

export function WhyNoTradeAccordion() {
  const [open, setOpen] = useState(false);
  const [blockedTraces, setBlockedTraces] = useState<DecisionTrace[]>([]);
  const [stats, setStats] = useState({ total: 0, blocked: 0, topReasons: [] as { reason: string; count: number }[] });

  useEffect(() => {
    const allTraces = getRecentTraces(50);
    const blocked = allTraces.filter(t => t.decision === 'BLOCKED');
    setBlockedTraces(blocked.slice(0, 5));

    const blockStats = getBlockStats();
    const topReasons = Object.entries(blockStats)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    setStats({
      total: allTraces.length,
      blocked: blocked.length,
      topReasons,
    });
  }, []);

  const blockRate = stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Why No Trade?</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.blocked > 0 && (
            <Badge variant="secondary" className="font-mono text-xs h-5 px-1.5">
              {stats.blocked} blocked
            </Badge>
          )}
          {blockRate > 0 && (
            <Badge variant="outline" className="font-mono text-xs h-5 px-1.5">
              {blockRate}%
            </Badge>
          )}
          <ChevronRight className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-90'
          )} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 pb-3 space-y-3">
          {/* Top reasons */}
          {stats.topReasons.length > 0 ? (
            <div className="space-y-1.5">
              {stats.topReasons.map(({ reason, count }) => {
                const meta = REASON_META[reason] || { label: reason, icon: <Shield className="h-3.5 w-3.5" />, color: 'text-warning' };
                const pct = stats.blocked > 0 ? (count / stats.blocked) * 100 : 0;
                return (
                  <div key={reason} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={cn('flex items-center gap-1.5', meta.color)}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                    <Progress value={pct} className="h-1" />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No blocked trades recently — system is allowing opportunities.
            </p>
          )}

          {/* Recent blocked intents */}
          {blockedTraces.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recent</p>
              {blockedTraces.slice(0, 3).map(trace => {
                const primaryReason = trace.blockReasons[0];
                const meta = REASON_META[primaryReason] || { label: primaryReason, icon: <Shield className="h-3 w-3" />, color: 'text-warning' };
                return (
                  <div key={trace.id} className="flex items-center justify-between text-xs py-1">
                    <span className="flex items-center gap-1.5">
                      <span className={meta.color}>{meta.icon}</span>
                      <span className="font-medium">{trace.intent.direction} {trace.intent.instrument}</span>
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {new Date(trace.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Philosophy note */}
          <div className="text-[10px] text-muted-foreground bg-primary/5 rounded px-2 py-1.5 border border-primary/10">
            Capital preservation beats overtrading. The system says "no" by design.
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
