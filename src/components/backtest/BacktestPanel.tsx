import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStrategies } from '@/hooks/useStrategies';
import { useBooks } from '@/hooks/useBooks';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  PlayCircle, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  DollarSign,
  Percent,
  BarChart3,
  Activity,
  LineChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BacktestEquityCurve } from './BacktestCharts';

interface BacktestMetrics {
  total_return_pct: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown_pct: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  avg_trade_pnl: number;
  total_commission: number;
}

interface BacktestResult {
  id: string;
  status: string;
  metrics: BacktestMetrics;
  signals_generated: number;
  signals_executed: number;
  signals_rejected: number;
}

export function BacktestPanel() {
  const { data: strategies } = useStrategies();
  const { data: books } = useBooks();
  
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [initialCapital, setInitialCapital] = useState<string>('100000');
  const [result, setResult] = useState<BacktestResult | null>(null);

  const runBacktestMutation = useMutation({
    mutationFn: async () => {
      // Simulate backtest with mock data
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        id: crypto.randomUUID(),
        status: 'completed',
        metrics: {
          total_return_pct: Math.random() * 40 - 10,
          sharpe_ratio: Math.random() * 2 + 0.5,
          sortino_ratio: Math.random() * 3 + 0.5,
          max_drawdown_pct: Math.random() * 15 + 5,
          win_rate: Math.random() * 30 + 40,
          profit_factor: Math.random() * 1.5 + 0.8,
          total_trades: Math.floor(Math.random() * 100 + 50),
          avg_trade_pnl: Math.random() * 500 - 100,
          total_commission: Math.random() * 1000 + 500,
        },
        signals_generated: Math.floor(Math.random() * 200 + 100),
        signals_executed: Math.floor(Math.random() * 100 + 50),
        signals_rejected: Math.floor(Math.random() * 50 + 20),
      } as BacktestResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('Backtest completed');
    },
    onError: (error: Error) => {
      toast.error(`Backtest failed: ${error.message}`);
    },
  });

  const handleRunBacktest = () => {
    if (!selectedStrategy || !startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    runBacktestMutation.mutate();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const MetricCard = ({ 
    label, 
    value, 
    icon: Icon, 
    format = 'number',
    positive = true 
  }: { 
    label: string; 
    value: number; 
    icon: any;
    format?: 'number' | 'percent' | 'currency' | 'ratio';
    positive?: boolean;
  }) => {
    let displayValue = '';
    switch (format) {
      case 'percent':
        displayValue = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
        break;
      case 'currency':
        displayValue = formatCurrency(value);
        break;
      case 'ratio':
        displayValue = value.toFixed(2);
        break;
      default:
        displayValue = value.toFixed(0);
    }

    const isPositive = format === 'percent' || format === 'currency' ? value >= 0 : positive;

    return (
      <div className="p-4 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className={cn(
          'text-xl font-bold font-mono',
          format === 'percent' || format === 'currency' 
            ? isPositive ? 'text-success' : 'text-destructive'
            : 'text-foreground'
        )}>
          {displayValue}
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Strategy Backtesting
        </CardTitle>
        <CardDescription>
          Test strategy performance against historical data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger>
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                {strategies?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Book (Optional)</Label>
            <Select value={selectedBook} onValueChange={setSelectedBook}>
              <SelectTrigger>
                <SelectValue placeholder="Select book" />
              </SelectTrigger>
              <SelectContent>
                {books?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>End Date</Label>
            <Input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Initial Capital ($)</Label>
            <Input 
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(e.target.value)}
            />
          </div>
        </div>

        <Button 
          onClick={handleRunBacktest}
          disabled={runBacktestMutation.isPending}
          className="w-full md:w-auto"
        >
          <PlayCircle className={cn('h-4 w-4 mr-2', runBacktestMutation.isPending && 'animate-spin')} />
          {runBacktestMutation.isPending ? 'Running Backtest...' : 'Run Backtest'}
        </Button>

        {/* Results */}
        {result && (
          <>
            <Separator />
            
            <Tabs defaultValue="metrics" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Backtest Results</h3>
                <div className="flex items-center gap-2">
                  <TabsList>
                    <TabsTrigger value="metrics" className="gap-1">
                      <BarChart3 className="h-3 w-3" />
                      Metrics
                    </TabsTrigger>
                    <TabsTrigger value="charts" className="gap-1">
                      <LineChart className="h-3 w-3" />
                      Charts
                    </TabsTrigger>
                  </TabsList>
                  <Badge variant={result.metrics.total_return_pct >= 0 ? 'success' : 'destructive'}>
                    {result.status}
                  </Badge>
                </div>
              </div>

              <TabsContent value="metrics" className="space-y-4">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard 
                    label="Total Return"
                    value={result.metrics.total_return_pct}
                    icon={result.metrics.total_return_pct >= 0 ? TrendingUp : TrendingDown}
                    format="percent"
                  />
                  <MetricCard 
                    label="Sharpe Ratio"
                    value={result.metrics.sharpe_ratio}
                    icon={Activity}
                    format="ratio"
                  />
                  <MetricCard 
                    label="Max Drawdown"
                    value={-result.metrics.max_drawdown_pct}
                    icon={TrendingDown}
                    format="percent"
                  />
                  <MetricCard 
                    label="Win Rate"
                    value={result.metrics.win_rate}
                    icon={Percent}
                    format="percent"
                    positive={result.metrics.win_rate > 50}
                  />
                </div>

                {/* Secondary Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard 
                    label="Total Trades"
                    value={result.metrics.total_trades}
                    icon={BarChart3}
                  />
                  <MetricCard 
                    label="Profit Factor"
                    value={result.metrics.profit_factor}
                    icon={DollarSign}
                    format="ratio"
                  />
                  <MetricCard 
                    label="Avg Trade PnL"
                    value={result.metrics.avg_trade_pnl}
                    icon={DollarSign}
                    format="currency"
                  />
                  <MetricCard 
                    label="Total Commission"
                    value={-result.metrics.total_commission}
                    icon={DollarSign}
                    format="currency"
                  />
                </div>

                {/* Signal Stats */}
                <div className="p-4 rounded-lg bg-muted/30 border">
                  <h4 className="font-medium mb-3">Signal Execution</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold font-mono">{result.signals_generated}</p>
                      <p className="text-sm text-muted-foreground">Generated</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono text-success">{result.signals_executed}</p>
                      <p className="text-sm text-muted-foreground">Executed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-mono text-destructive">{result.signals_rejected}</p>
                      <p className="text-sm text-muted-foreground">Rejected</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="charts">
                <BacktestEquityCurve
                  initialCapital={Number(initialCapital)}
                  totalReturn={result.metrics.total_return_pct}
                  maxDrawdown={result.metrics.max_drawdown_pct}
                  totalTrades={result.metrics.total_trades}
                  winRate={result.metrics.win_rate}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
