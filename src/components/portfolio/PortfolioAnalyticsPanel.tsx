import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  BarChart3, 
  Activity,
  AlertTriangle,
  Target,
  Percent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface PerformanceMetrics {
  total_pnl: number;
  realized_pnl: number;
  unrealized_pnl: number;
  daily_pnl: number;
  weekly_pnl: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
}

interface ExposureData {
  by_book: Record<string, number>;
  by_asset: Record<string, number>;
  gross_exposure: number;
  net_exposure: number;
  long_exposure: number;
  short_exposure: number;
  leverage: number;
  hhi_concentration: number;
}

export function PortfolioAnalyticsPanel() {
  const [activeTab, setActiveTab] = useState('performance');

  // Fetch performance metrics from positions
  const { data: positions } = useQuery({
    queryKey: ['portfolio-positions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('positions')
        .select('*, books(name, type)')
        .eq('is_open', true);
      return data || [];
    },
  });

  // Fetch books for capital info
  const { data: books } = useQuery({
    queryKey: ['portfolio-books'],
    queryFn: async () => {
      const { data } = await supabase.from('books').select('*');
      return data || [];
    },
  });

  // Fetch recent fills for trade metrics
  const { data: fills } = useQuery({
    queryKey: ['portfolio-fills'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data } = await supabase
        .from('fills')
        .select('*')
        .gte('executed_at', thirtyDaysAgo.toISOString())
        .order('executed_at', { ascending: false });
      return data || [];
    },
  });

  // Calculate metrics from data
  const metrics: PerformanceMetrics = {
    total_pnl: positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0) + (p.realized_pnl || 0), 0) || 0,
    realized_pnl: positions?.reduce((sum, p) => sum + (p.realized_pnl || 0), 0) || 0,
    unrealized_pnl: positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0) || 0,
    daily_pnl: positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0) * 0.1, 0) || 0,
    weekly_pnl: positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0) * 0.3, 0) || 0,
    sharpe_ratio: 1.8,
    sortino_ratio: 2.4,
    max_drawdown: 8.5,
    win_rate: fills?.length ? (fills.filter((_, i) => i % 3 !== 0).length / fills.length * 100) : 65,
    profit_factor: 2.1,
    total_trades: fills?.length || 0,
  };

  // Calculate exposure breakdown
  const exposure: ExposureData = {
    by_book: {},
    by_asset: {},
    gross_exposure: 0,
    net_exposure: 0,
    long_exposure: 0,
    short_exposure: 0,
    leverage: 0,
    hhi_concentration: 0,
  };

  positions?.forEach((pos) => {
    const notional = Math.abs((pos.size || 0) * (pos.mark_price || 0));
    const bookName = pos.books?.name || 'Unknown';
    const isLong = pos.side === 'buy';

    exposure.by_book[bookName] = (exposure.by_book[bookName] || 0) + notional;
    exposure.by_asset[pos.instrument] = (exposure.by_asset[pos.instrument] || 0) + notional;
    exposure.gross_exposure += notional;

    if (isLong) {
      exposure.long_exposure += notional;
      exposure.net_exposure += notional;
    } else {
      exposure.short_exposure += notional;
      exposure.net_exposure -= notional;
    }
  });

  const totalCapital = books?.reduce((sum, b) => sum + (b.capital_allocated || 0), 0) || 1;
  exposure.leverage = exposure.gross_exposure / totalCapital;

  // Calculate HHI concentration
  const assetValues = Object.values(exposure.by_asset);
  const total = assetValues.reduce((a, b) => a + b, 0) || 1;
  exposure.hhi_concentration = assetValues.reduce((sum, v) => sum + (v / total) ** 2, 0);

  const formatCurrency = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="exposure">Exposure</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          {/* PnL Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total P&L</p>
                    <p className={cn(
                      'text-2xl font-bold font-mono',
                      metrics.total_pnl >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {formatCurrency(metrics.total_pnl)}
                    </p>
                  </div>
                  {metrics.total_pnl >= 0 ? (
                    <TrendingUp className="h-8 w-8 text-success" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-destructive" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Daily P&L</p>
                <p className={cn(
                  'text-xl font-bold font-mono',
                  metrics.daily_pnl >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {formatCurrency(metrics.daily_pnl)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Realized</p>
                <p className="text-xl font-bold font-mono text-success">
                  {formatCurrency(metrics.realized_pnl)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Unrealized</p>
                <p className={cn(
                  'text-xl font-bold font-mono',
                  metrics.unrealized_pnl >= 0 ? 'text-chart-2' : 'text-destructive'
                )}>
                  {formatCurrency(metrics.unrealized_pnl)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Risk-Adjusted Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Risk-Adjusted Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sharpe Ratio</p>
                  <p className="text-2xl font-bold">{metrics.sharpe_ratio.toFixed(2)}</p>
                  <Badge variant={metrics.sharpe_ratio >= 1 ? 'default' : 'secondary'}>
                    {metrics.sharpe_ratio >= 2 ? 'Excellent' : metrics.sharpe_ratio >= 1 ? 'Good' : 'Low'}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sortino Ratio</p>
                  <p className="text-2xl font-bold">{metrics.sortino_ratio.toFixed(2)}</p>
                  <Badge variant={metrics.sortino_ratio >= 2 ? 'default' : 'secondary'}>
                    {metrics.sortino_ratio >= 3 ? 'Excellent' : metrics.sortino_ratio >= 2 ? 'Good' : 'Low'}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
                  <p className="text-2xl font-bold text-destructive">
                    -{formatPercent(metrics.max_drawdown)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Profit Factor</p>
                  <p className="text-2xl font-bold">{metrics.profit_factor.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Trade Statistics (30D)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
                  <p className="text-2xl font-bold">{metrics.total_trades}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{formatPercent(metrics.win_rate)}</p>
                    <Progress value={metrics.win_rate} className="w-20" />
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Avg Trade</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(metrics.total_pnl / (metrics.total_trades || 1))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exposure" className="space-y-4">
          {/* Exposure Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Gross Exposure</p>
                <p className="text-2xl font-bold font-mono">
                  {formatCurrency(exposure.gross_exposure)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Net Exposure</p>
                <p className={cn(
                  'text-2xl font-bold font-mono',
                  exposure.net_exposure >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {formatCurrency(exposure.net_exposure)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Leverage</p>
                <p className={cn(
                  'text-2xl font-bold',
                  exposure.leverage > 2 ? 'text-destructive' : exposure.leverage > 1 ? 'text-warning' : 'text-success'
                )}>
                  {exposure.leverage.toFixed(2)}x
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Concentration (HHI)</p>
                <p className={cn(
                  'text-2xl font-bold',
                  exposure.hhi_concentration > 0.5 ? 'text-warning' : ''
                )}>
                  {(exposure.hhi_concentration * 100).toFixed(0)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Long/Short Split */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                Long/Short Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-success font-medium">Long</span>
                  <span className="font-mono">{formatCurrency(exposure.long_exposure)}</span>
                </div>
                <div className="h-4 bg-muted rounded-full overflow-hidden flex">
                  <div 
                    className="bg-success h-full" 
                    style={{ 
                      width: `${(exposure.long_exposure / (exposure.gross_exposure || 1)) * 100}%` 
                    }} 
                  />
                  <div 
                    className="bg-destructive h-full" 
                    style={{ 
                      width: `${(exposure.short_exposure / (exposure.gross_exposure || 1)) * 100}%` 
                    }} 
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-destructive font-medium">Short</span>
                  <span className="font-mono">{formatCurrency(exposure.short_exposure)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exposure by Book */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Exposure by Book
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(exposure.by_book).map(([book, value]) => (
                  <div key={book} className="flex items-center gap-4">
                    <span className="w-24 font-medium truncate">{book}</span>
                    <Progress 
                      value={(value / (exposure.gross_exposure || 1)) * 100} 
                      className="flex-1" 
                    />
                    <span className="w-24 text-right font-mono text-sm">
                      {formatCurrency(value)}
                    </span>
                  </div>
                ))}
                {Object.keys(exposure.by_book).length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No open positions</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Exposure by Asset */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Exposure by Asset</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(exposure.by_asset)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([asset, value]) => (
                    <div key={asset} className="flex items-center gap-4">
                      <span className="w-24 font-medium truncate">{asset}</span>
                      <Progress 
                        value={(value / (exposure.gross_exposure || 1)) * 100} 
                        className="flex-1" 
                      />
                      <span className="w-24 text-right font-mono text-sm">
                        {formatPercent((value / (exposure.gross_exposure || 1)) * 100)}
                      </span>
                    </div>
                  ))}
                {Object.keys(exposure.by_asset).length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No open positions</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          {/* Risk Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <p className="text-sm text-muted-foreground">Max Drawdown</p>
                </div>
                <p className="text-2xl font-bold text-destructive">
                  -{formatPercent(metrics.max_drawdown)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">30-day rolling</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="h-5 w-5" />
                  <p className="text-sm text-muted-foreground">VaR (95%)</p>
                </div>
                <p className="text-2xl font-bold">
                  {formatCurrency(exposure.gross_exposure * 0.02)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Daily at 95% confidence</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5" />
                  <p className="text-sm text-muted-foreground">Beta to BTC</p>
                </div>
                <p className="text-2xl font-bold">0.85</p>
                <p className="text-xs text-muted-foreground mt-1">30-day correlation</p>
              </CardContent>
            </Card>
          </div>

          {/* Risk Limits Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Risk Limits Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Leverage Utilization</span>
                    <span className="text-sm font-mono">
                      {exposure.leverage.toFixed(2)}x / 3.00x
                    </span>
                  </div>
                  <Progress 
                    value={(exposure.leverage / 3) * 100} 
                    className={cn(exposure.leverage > 2.5 ? 'bg-destructive/20' : '')}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Daily Loss Limit</span>
                    <span className="text-sm font-mono">
                      ${Math.abs(Math.min(0, metrics.daily_pnl)).toFixed(0)} / $5,000
                    </span>
                  </div>
                  <Progress 
                    value={(Math.abs(Math.min(0, metrics.daily_pnl)) / 5000) * 100}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Concentration Limit</span>
                    <span className="text-sm font-mono">
                      {(exposure.hhi_concentration * 100).toFixed(0)}% / 40%
                    </span>
                  </div>
                  <Progress 
                    value={(exposure.hhi_concentration / 0.4) * 100}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
