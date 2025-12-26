import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { 
  History, 
  Play, 
  BarChart2, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Loader2,
} from 'lucide-react';

interface BacktestResult {
  id: string;
  triggerName: string;
  period: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalPnL: number;
  sharpeRatio: number;
  status: 'completed' | 'running' | 'failed';
  timestamp: string;
}

interface TradeRecord {
  id: string;
  instrument: string;
  direction: 'long' | 'short';
  entry: number;
  exit: number;
  pnl: number;
  pnlPercent: number;
  duration: string;
  trigger: string;
}

const MOCK_RESULTS: BacktestResult[] = [
  {
    id: '1',
    triggerName: 'Whale Alert + High Sentiment',
    period: '30d',
    totalTrades: 47,
    winRate: 62.3,
    profitFactor: 1.84,
    maxDrawdown: 8.2,
    totalPnL: 12450,
    sharpeRatio: 1.42,
    status: 'completed',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    triggerName: 'Signal Strength > 0.8',
    period: '90d',
    totalTrades: 23,
    winRate: 73.9,
    profitFactor: 2.31,
    maxDrawdown: 5.4,
    totalPnL: 28340,
    sharpeRatio: 1.89,
    status: 'completed',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
];

const MOCK_TRADES: TradeRecord[] = [
  { id: '1', instrument: 'BTC-USDT', direction: 'long', entry: 42150, exit: 43890, pnl: 1740, pnlPercent: 4.13, duration: '2h 15m', trigger: 'Whale Alert' },
  { id: '2', instrument: 'ETH-USDT', direction: 'short', entry: 2340, exit: 2280, pnl: 600, pnlPercent: 2.56, duration: '45m', trigger: 'Sentiment Drop' },
  { id: '3', instrument: 'SOL-USDT', direction: 'long', entry: 98.5, exit: 95.2, pnl: -330, pnlPercent: -3.35, duration: '1h 30m', trigger: 'Signal Strength' },
  { id: '4', instrument: 'BTC-USDT', direction: 'long', entry: 43200, exit: 44850, pnl: 1650, pnlPercent: 3.82, duration: '3h 45m', trigger: 'Whale Alert' },
];

interface BacktestTriggersProps {
  compact?: boolean;
}

export function BacktestTriggers({ compact = false }: BacktestTriggersProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [selectedTrigger, setSelectedTrigger] = useState('all');
  const [results, setResults] = useState<BacktestResult[]>(MOCK_RESULTS);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);

  const runBacktest = () => {
    setIsRunning(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsRunning(false);
          // Add new result
          const newResult: BacktestResult = {
            id: Date.now().toString(),
            triggerName: selectedTrigger === 'all' ? 'All Triggers Combined' : selectedTrigger,
            period: selectedPeriod,
            totalTrades: Math.floor(Math.random() * 50) + 20,
            winRate: 55 + Math.random() * 25,
            profitFactor: 1.2 + Math.random() * 1.5,
            maxDrawdown: 3 + Math.random() * 10,
            totalPnL: Math.floor(Math.random() * 30000) + 5000,
            sharpeRatio: 0.8 + Math.random() * 1.5,
            status: 'completed',
            timestamp: new Date().toISOString(),
          };
          setResults(prev => [newResult, ...prev]);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 300);
  };

  if (compact) {
    return (
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Backtest Triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={runBacktest} disabled={isRunning} className="h-8">
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            </Button>
          </div>
          {isRunning && <Progress value={progress} className="h-1" />}
          {results[0] && (
            <div className="p-2 rounded-lg bg-muted/50 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-medium text-trading-long">{results[0].winRate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit Factor</span>
                <span className="font-medium">{results[0].profitFactor.toFixed(2)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Backtest Trigger Strategies
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="run" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="run">Run Backtest</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="trades">Trade Log</TabsTrigger>
          </TabsList>

          <TabsContent value="run" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Period</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="90d">Last 90 Days</SelectItem>
                    <SelectItem value="180d">Last 180 Days</SelectItem>
                    <SelectItem value="1y">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Trigger Strategy</Label>
                <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Triggers</SelectItem>
                    <SelectItem value="whale">Whale Alerts Only</SelectItem>
                    <SelectItem value="sentiment">Sentiment Signals</SelectItem>
                    <SelectItem value="signal">High Confidence Signals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Initial Capital ($)</Label>
                <Input type="number" defaultValue={100000} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Position Size (%)</Label>
                <Input type="number" defaultValue={5} />
              </div>
            </div>

            {isRunning && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Running backtest...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            <Button onClick={runBacktest} disabled={isRunning} className="w-full gap-2">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Backtest...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Backtest
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="results" className="space-y-3">
            {results.map(result => (
              <div 
                key={result.id}
                onClick={() => setSelectedResult(result)}
                className={cn(
                  'p-4 rounded-lg border border-border/50 cursor-pointer transition-all hover:bg-muted/50',
                  selectedResult?.id === result.id && 'ring-2 ring-primary'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.triggerName}</span>
                    <Badge variant="outline" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {result.period}
                    </Badge>
                  </div>
                  <Badge className={cn(
                    result.status === 'completed' ? 'bg-trading-long/20 text-trading-long' :
                    result.status === 'running' ? 'bg-warning/20 text-warning' :
                    'bg-trading-short/20 text-trading-short'
                  )}>
                    {result.status === 'completed' ? <CheckCircle className="h-3 w-3 mr-1" /> :
                     result.status === 'running' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> :
                     <XCircle className="h-3 w-3 mr-1" />}
                    {result.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className={cn(
                      'font-mono font-medium',
                      result.winRate >= 50 ? 'text-trading-long' : 'text-trading-short'
                    )}>
                      {result.winRate.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Profit Factor</p>
                    <p className={cn(
                      'font-mono font-medium',
                      result.profitFactor >= 1.5 ? 'text-trading-long' : 'text-foreground'
                    )}>
                      {result.profitFactor.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Drawdown</p>
                    <p className="font-mono font-medium text-trading-short">
                      -{result.maxDrawdown.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={cn(
                      'font-mono font-medium',
                      result.totalPnL >= 0 ? 'text-trading-long' : 'text-trading-short'
                    )}>
                      ${result.totalPnL.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{result.totalTrades} trades</span>
                  <span>Sharpe: {result.sharpeRatio.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="trades" className="space-y-2">
            <div className="text-xs text-muted-foreground mb-2">
              Sample trade log from latest backtest
            </div>
            {MOCK_TRADES.map(trade => (
              <div 
                key={trade.id}
                className="p-3 rounded-lg bg-muted/30 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge className={cn(
                    'text-xs',
                    trade.direction === 'long' 
                      ? 'bg-trading-long/20 text-trading-long' 
                      : 'bg-trading-short/20 text-trading-short'
                  )}>
                    {trade.direction === 'long' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {trade.direction.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{trade.instrument}</p>
                    <p className="text-xs text-muted-foreground">
                      ${trade.entry.toLocaleString()} → ${trade.exit.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn(
                    'font-mono font-medium',
                    trade.pnl >= 0 ? 'text-trading-long' : 'text-trading-short'
                  )}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{trade.duration}</p>
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
