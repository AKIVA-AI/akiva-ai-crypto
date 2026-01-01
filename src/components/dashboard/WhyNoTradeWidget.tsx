/**
 * "Why Didn't We Trade?" Widget
 * 
 * The killer UX feature.
 * A big, friendly panel that explains system inaction.
 * 
 * This alone will make the platform legendary.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  HelpCircle,
  Shield,
  TrendingDown,
  Activity,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Zap,
  Eye,
  Lock,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type DecisionTrace,
  type BlockReason,
  getRecentTraces,
  getBlockStats,
} from '@/lib/decisionTrace';

interface BlockReasonDisplay {
  reason: BlockReason;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const REASON_DISPLAYS: Record<string, BlockReasonDisplay> = {
  KILL_SWITCH_ACTIVE: {
    reason: 'KILL_SWITCH_ACTIVE',
    label: 'Kill Switch Active',
    description: 'Emergency stop is engaged. No new positions allowed.',
    icon: <Lock className="h-4 w-4" />,
    color: 'text-destructive',
  },
  REDUCE_ONLY_ACTIVE: {
    reason: 'REDUCE_ONLY_ACTIVE',
    label: 'Reduce-Only Mode',
    description: 'Only position-reducing trades are allowed.',
    icon: <TrendingDown className="h-4 w-4" />,
    color: 'text-warning',
  },
  VOLATILITY_REGIME_HIGH: {
    reason: 'VOLATILITY_REGIME_HIGH',
    label: 'High Volatility',
    description: 'Market volatility exceeds safe trading thresholds.',
    icon: <Activity className="h-4 w-4" />,
    color: 'text-warning',
  },
  EXECUTION_COST_EXCEEDS_EDGE: {
    reason: 'EXECUTION_COST_EXCEEDS_EDGE',
    label: 'Costs > Edge',
    description: 'Trading costs would exceed expected profit.',
    icon: <DollarSign className="h-4 w-4" />,
    color: 'text-destructive',
  },
  UNFAVORABLE_REGIME: {
    reason: 'UNFAVORABLE_REGIME',
    label: 'Unfavorable Market',
    description: 'Current market conditions are not suitable.',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-warning',
  },
  CONFIDENCE_TOO_LOW: {
    reason: 'CONFIDENCE_TOO_LOW',
    label: 'Low Confidence',
    description: 'Strategy confidence below minimum threshold.',
    icon: <BarChart3 className="h-4 w-4" />,
    color: 'text-muted-foreground',
  },
  DATA_QUALITY_INSUFFICIENT: {
    reason: 'DATA_QUALITY_INSUFFICIENT',
    label: 'Data Quality Issue',
    description: 'Market data not reliable enough for trading.',
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-destructive',
  },
  POSITION_LIMIT_EXCEEDED: {
    reason: 'POSITION_LIMIT_EXCEEDED',
    label: 'Position Limit',
    description: 'Would exceed maximum allowed position size.',
    icon: <Shield className="h-4 w-4" />,
    color: 'text-warning',
  },
  EXPOSURE_LIMIT_EXCEEDED: {
    reason: 'EXPOSURE_LIMIT_EXCEEDED',
    label: 'Exposure Limit',
    description: 'Would exceed total portfolio exposure limit.',
    icon: <Shield className="h-4 w-4" />,
    color: 'text-warning',
  },
};

function BlockReasonCard({ trace }: { trace: DecisionTrace }) {
  const primaryReason = trace.blockReasons[0];
  const display = REASON_DISPLAYS[primaryReason] || {
    label: primaryReason,
    description: 'Trade was blocked by safety systems.',
    icon: <Shield className="h-4 w-4" />,
    color: 'text-warning',
  };

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5', display.color)}>
            {display.icon}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {trace.intent.direction} {trace.intent.instrument}
              </span>
              <Badge variant="outline" className="text-xs">
                {trace.intent.strategyName}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {display.description}
            </p>
            {trace.blockReasons.length > 1 && (
              <p className="text-xs text-muted-foreground">
                +{trace.blockReasons.length - 1} more reason(s)
              </p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">
            {new Date(trace.timestamp).toLocaleTimeString()}
          </p>
          {trace.costs.netEdgeBps < 0 && (
            <p className="text-xs font-mono text-destructive">
              {trace.costs.netEdgeBps.toFixed(0)} bps net
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  color 
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/30">
      <div className={cn('flex justify-center mb-1', color)}>
        {icon}
      </div>
      <p className="text-2xl font-mono font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function WhyNoTradeWidget() {
  const [traces, setTraces] = useState<DecisionTrace[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    executed: number;
    blocked: number;
    topReasons: { reason: string; count: number }[];
  }>({
    total: 0,
    executed: 0,
    blocked: 0,
    topReasons: [],
  });

  useEffect(() => {
    // Load traces
    const allTraces = getRecentTraces(50);
    const blockedTraces = allTraces.filter(t => t.decision === 'BLOCKED');
    setTraces(blockedTraces.slice(0, 5));

    // Calculate stats
    const blockStats = getBlockStats();
    const topReasons = Object.entries(blockStats)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    setStats({
      total: allTraces.length,
      executed: allTraces.filter(t => t.decision === 'EXECUTED').length,
      blocked: blockedTraces.length,
      topReasons,
    });
  }, []);

  const blockRate = stats.total > 0 
    ? ((stats.blocked / stats.total) * 100).toFixed(0) 
    : '0';

  return (
    <Card className="glass-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Why Didn't We Trade?
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {blockRate}% blocked
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          The system says "no" more often than "yes" — and that's by design.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Decisions"
            value={stats.total}
            icon={<Eye className="h-4 w-4" />}
            color="text-muted-foreground"
          />
          <StatCard
            label="Executed"
            value={stats.executed}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="text-success"
          />
          <StatCard
            label="Blocked"
            value={stats.blocked}
            icon={<Shield className="h-4 w-4" />}
            color="text-warning"
          />
        </div>

        {/* Top Block Reasons */}
        {stats.topReasons.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">
              Top Block Reasons
            </h4>
            <div className="space-y-2">
              {stats.topReasons.map(({ reason, count }) => {
                const display = REASON_DISPLAYS[reason];
                const percentage = stats.blocked > 0 ? (count / stats.blocked) * 100 : 0;
                return (
                  <div key={reason} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        {display?.icon || <Shield className="h-3 w-3" />}
                        {display?.label || reason}
                      </span>
                      <span className="font-mono text-xs">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-1" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Blocked Trades */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            Recent Blocked Intents
          </h4>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2 pr-4">
              {traces.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                  <p>No blocked trades recently.</p>
                  <p className="text-xs">The system is allowing favorable opportunities.</p>
                </div>
              ) : (
                traces.map((trace) => (
                  <BlockReasonCard key={trace.id} trace={trace} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Call to Action */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-primary" />
            <span>
              <strong>This is a feature, not a bug.</strong>
              {' '}Capital preservation beats overtrading.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
