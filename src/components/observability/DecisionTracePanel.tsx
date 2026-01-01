import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Loader2,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  useDecisionTraces, 
  useDecisionTraceStats, 
  useRecentBlockedTraces,
  PersistedDecisionTrace,
  DecisionTraceFilters,
} from '@/hooks/useDecisionTraces';
import { DecisionOutcome, BlockReason } from '@/lib/decisionTrace';

const DECISION_CONFIG: Record<DecisionOutcome, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  EXECUTED: { label: 'Executed', color: 'bg-success/20 text-success', icon: CheckCircle },
  BLOCKED: { label: 'Blocked', color: 'bg-destructive/20 text-destructive', icon: XCircle },
  MODIFIED: { label: 'Modified', color: 'bg-warning/20 text-warning', icon: AlertTriangle },
  PENDING: { label: 'Pending', color: 'bg-muted text-muted-foreground', icon: Clock },
};

const BLOCK_REASON_LABELS: Partial<Record<BlockReason, string>> = {
  KILL_SWITCH_ACTIVE: 'Kill Switch',
  REDUCE_ONLY_ACTIVE: 'Reduce Only',
  VOLATILITY_REGIME_HIGH: 'High Volatility',
  EXPECTED_EDGE_NEGATIVE: 'Negative Edge',
  EXECUTION_COST_EXCEEDS_EDGE: 'Costs > Edge',
  DATA_QUALITY_INSUFFICIENT: 'Data Quality',
  POSITION_LIMIT_EXCEEDED: 'Position Limit',
  EXPOSURE_LIMIT_EXCEEDED: 'Exposure Limit',
  DAILY_LOSS_LIMIT_EXCEEDED: 'Daily Loss Limit',
  LIQUIDITY_INSUFFICIENT: 'Low Liquidity',
  CONFIDENCE_TOO_LOW: 'Low Confidence',
  UNFAVORABLE_REGIME: 'Unfavorable Regime',
  STRATEGY_QUARANTINED: 'Strategy Quarantined',
  BOOK_FROZEN: 'Book Frozen',
  BOOK_HALTED: 'Book Halted',
  VENUE_UNHEALTHY: 'Venue Unhealthy',
};

function DecisionTraceCard({ trace }: { trace: PersistedDecisionTrace }) {
  const config = DECISION_CONFIG[trace.decision];
  const DecisionIcon = config.icon;
  const DirectionIcon = trace.direction === 'LONG' ? TrendingUp : TrendingDown;
  
  return (
    <Card className="border-l-4" style={{ borderLeftColor: trace.decision === 'EXECUTED' ? 'var(--success)' : trace.decision === 'BLOCKED' ? 'var(--destructive)' : 'var(--warning)' }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <DirectionIcon className={cn('h-4 w-4', trace.direction === 'LONG' ? 'text-success' : 'text-destructive')} />
              <span className="font-semibold">{trace.instrument}</span>
              <Badge variant="outline" className={config.color}>
                <DecisionIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {trace.strategy_name} • ${trace.target_exposure_usd.toLocaleString()} USD
            </p>
            
            {/* Block reasons */}
            {trace.block_reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {trace.block_reasons.map((reason, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {BLOCK_REASON_LABELS[reason as BlockReason] || reason}
                  </Badge>
                ))}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground line-clamp-2">
              {trace.explanation}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(trace.timestamp), { addSuffix: true })}
            </div>
            <div className="text-xs font-mono mt-1">
              {(trace.confidence * 100).toFixed(0)}% conf
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsOverview() {
  const { data: stats, isLoading } = useDecisionTraceStats();
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!stats) return null;
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Decisions (24h)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">{stats.executed}</div>
            <div className="text-xs text-muted-foreground">Executed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats.blocked}</div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.blockRate}%</div>
            <div className="text-xs text-muted-foreground">Block Rate</div>
            <Progress value={stats.blockRate} className="mt-2 h-1" />
          </CardContent>
        </Card>
      </div>
      
      {/* Top Block Reasons */}
      {stats.topReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Block Reasons (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topReasons.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 text-sm truncate">
                    {BLOCK_REASON_LABELS[item.reason as BlockReason] || item.reason}
                  </div>
                  <Progress value={(item.count / stats.blocked) * 100} className="flex-1 h-2" />
                  <div className="text-sm font-mono w-8 text-right">{item.count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WhyNoTrade() {
  const { data: blockedTraces, isLoading } = useRecentBlockedTraces(10);
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!blockedTraces || blockedTraces.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
        <p>No blocked trades recently!</p>
        <p className="text-xs mt-1">All decisions are passing safety checks</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Understanding why the system chooses NOT to trade is just as important as understanding why it trades.
      </p>
      {blockedTraces.map((trace) => (
        <DecisionTraceCard key={trace.id} trace={trace} />
      ))}
    </div>
  );
}

function TraceExplorer() {
  const [filters, setFilters] = useState<DecisionTraceFilters>({ limit: 50 });
  const [searchInstrument, setSearchInstrument] = useState('');
  
  const { data: traces, isLoading, refetch } = useDecisionTraces({
    ...filters,
    instrument: searchInstrument || undefined,
  });
  
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px]">
          <Input 
            placeholder="Search by instrument..."
            value={searchInstrument}
            onChange={(e) => setSearchInstrument(e.target.value)}
            className="h-9"
          />
        </div>
        <Select 
          value={filters.decision || 'all'}
          onValueChange={(v) => setFilters(f => ({ ...f, decision: v === 'all' ? undefined : v as DecisionOutcome }))}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Decisions</SelectItem>
            <SelectItem value="EXECUTED">Executed</SelectItem>
            <SelectItem value="BLOCKED">Blocked</SelectItem>
            <SelectItem value="MODIFIED">Modified</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>
      
      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : traces && traces.length > 0 ? (
        <ScrollArea className="h-[500px]">
          <div className="space-y-3 pr-4">
            {traces.map((trace) => (
              <DecisionTraceCard key={trace.id} trace={trace} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No decision traces found matching filters
        </div>
      )}
    </div>
  );
}

export function DecisionTracePanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Decision Trace Explorer
        </CardTitle>
        <CardDescription>
          Every trade decision is recorded and explainable - see why the system traded or chose not to
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stats">
          <TabsList className="mb-4">
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="why-no-trade">Why Didn't We Trade?</TabsTrigger>
            <TabsTrigger value="explorer">Trace Explorer</TabsTrigger>
          </TabsList>
          
          <TabsContent value="stats">
            <StatsOverview />
          </TabsContent>
          
          <TabsContent value="why-no-trade">
            <WhyNoTrade />
          </TabsContent>
          
          <TabsContent value="explorer">
            <TraceExplorer />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
