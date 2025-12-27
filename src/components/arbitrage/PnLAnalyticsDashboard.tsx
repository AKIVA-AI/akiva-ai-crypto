import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Scale,
  Bell,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePnLAnalytics, usePositionSizing, PnLHistoryEntry, DailyStats } from '@/hooks/useCrossExchangeArbitrage';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';

export function PnLAnalyticsDashboard() {
  const { 
    dailyPnL, 
    dailyPnLLimit, 
    percentUsed, 
    stats, 
    history, 
    positionSizing,
    warningAlertsSent,
    isLoading,
    refetch 
  } = usePnLAnalytics();
  
  const { rules, currentSize, updateRules } = usePositionSizing();
  const [baseSizeInput, setBaseSizeInput] = useState(rules?.baseSize || 0.1);

  // Prepare chart data
  const chartData = history.map((entry: PnLHistoryEntry, index: number) => {
    const runningPnL = history
      .slice(0, index + 1)
      .reduce((sum: number, e: PnLHistoryEntry) => sum + e.pnl, 0);
    return {
      time: new Date(entry.timestamp).toLocaleTimeString(),
      pnl: entry.pnl,
      cumulative: runningPnL,
      symbol: entry.symbol,
    };
  });

  if (isLoading) {
    return (
      <Card className="glass-panel">
        <CardContent className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Warning Alerts Status */}
      {(warningAlertsSent.at70 || warningAlertsSent.at90) && (
        <div className={cn(
          'p-3 rounded-lg flex items-center gap-3',
          warningAlertsSent.at90 
            ? 'bg-destructive/10 border border-destructive/30' 
            : 'bg-warning/10 border border-warning/30'
        )}>
          <Bell className={cn(
            'h-5 w-5',
            warningAlertsSent.at90 ? 'text-destructive' : 'text-warning'
          )} />
          <div>
            <p className="text-sm font-medium">
              {warningAlertsSent.at90 ? 'Critical P&L Alert Sent (90%)' : 'Warning P&L Alert Sent (70%)'}
            </p>
            <p className="text-xs text-muted-foreground">
              Position sizes automatically reduced
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* P&L Summary Card */}
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              P&L Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <div className={cn(
                'text-3xl font-bold font-mono',
                dailyPnL >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Today's Net P&L</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 rounded-lg bg-success/10">
                <div className="text-xl font-bold text-success font-mono">
                  ${stats?.totalProfit.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-muted-foreground">Total Profit</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10">
                <div className="text-xl font-bold text-destructive font-mono">
                  -${stats?.totalLoss.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-muted-foreground">Total Loss</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">P&L Limit Usage</span>
                <span className={cn(
                  'font-mono',
                  percentUsed >= 90 ? 'text-destructive' :
                  percentUsed >= 70 ? 'text-warning' : 'text-foreground'
                )}>
                  {percentUsed.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={Math.min(100, percentUsed)} 
                className={cn(
                  'h-2',
                  percentUsed >= 90 && '[&>div]:bg-destructive',
                  percentUsed >= 70 && percentUsed < 90 && '[&>div]:bg-warning'
                )}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Limit: ${dailyPnLLimit}</span>
                <span>Remaining: ${(dailyPnLLimit - dailyPnL).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trading Stats Card */}
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Trading Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xl font-bold">{stats?.tradesExecuted || 0}</div>
                <div className="text-xs text-muted-foreground">Trades Today</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className={cn(
                  'text-xl font-bold',
                  (stats?.winRate || 0) >= 50 ? 'text-success' : 'text-destructive'
                )}>
                  {stats?.winRate.toFixed(1) || 0}%
                </div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-success" />
                  Avg Win
                </span>
                <span className="font-mono text-success">
                  ${stats?.avgWin.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  Avg Loss
                </span>
                <span className="font-mono text-destructive">
                  -${stats?.avgLoss.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profit Factor</span>
                <span className={cn(
                  'font-mono',
                  (stats?.profitFactor || 0) >= 1.5 ? 'text-success' :
                  (stats?.profitFactor || 0) >= 1 ? 'text-warning' : 'text-destructive'
                )}>
                  {stats?.profitFactor === Infinity ? '∞' : stats?.profitFactor.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Max Drawdown</span>
                <span className="font-mono text-destructive">
                  -${stats?.maxDrawdown.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 text-sm">
              <Badge variant="outline" className="gap-1 border-success text-success">
                <CheckCircle2 className="h-3 w-3" />
                {stats?.winCount || 0} Wins
              </Badge>
              <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {stats?.lossCount || 0} Losses
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Chart */}
      {chartData.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cumulative P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="hsl(var(--success))"
                    fill="url(#pnlGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Position Sizing Card */}
      <Card className="glass-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Dynamic Position Sizing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-lg font-bold font-mono">{rules?.baseSize || 0.1}</div>
              <div className="text-xs text-muted-foreground">Base Size</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-primary/10">
              <div className="text-lg font-bold font-mono text-primary">
                {positionSizing?.currentSize?.toFixed(4) || currentSize.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">Current Size</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-lg font-bold font-mono">{rules?.maxSize || 0.5}</div>
              <div className="text-xs text-muted-foreground">Max Size</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Scale down at 70% P&L usage</Label>
                <p className="text-xs text-muted-foreground">Reduce to 50% of base size</p>
              </div>
              <Switch
                checked={rules?.scaleDownAt70Percent ?? true}
                onCheckedChange={(checked) => updateRules.mutate({ scaleDownAt70Percent: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Scale down at 90% P&L usage</Label>
                <p className="text-xs text-muted-foreground">Reduce to 25% of base size</p>
              </div>
              <Switch
                checked={rules?.scaleDownAt90Percent ?? true}
                onCheckedChange={(checked) => updateRules.mutate({ scaleDownAt90Percent: checked })}
              />
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Input
              type="number"
              value={baseSizeInput}
              onChange={(e) => setBaseSizeInput(Number(e.target.value))}
              step={0.01}
              min={0.01}
              max={1}
              className="font-mono"
              placeholder="Base size"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateRules.mutate({ baseSize: baseSizeInput })}
              disabled={updateRules.isPending}
            >
              Update Base
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Trades */}
      {history.length > 0 && (
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Recent Trades
              </span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <div className="space-y-2">
                {history.slice(-10).reverse().map((entry: PnLHistoryEntry, index: number) => (
                  <div 
                    key={entry.tradeId} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {entry.symbol}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className={cn(
                      'font-mono text-sm',
                      entry.pnl >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}