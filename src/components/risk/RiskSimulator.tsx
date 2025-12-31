import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Target,
  Percent,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SimulationParams {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  positionSizePct: number;
  leverage: number;
  tradesPerDay: number;
  startingCapital: number;
}

export function RiskSimulator() {
  const [params, setParams] = useState<SimulationParams>({
    winRate: 55,
    avgWinPct: 2.5,
    avgLossPct: 1.5,
    positionSizePct: 10,
    leverage: 3,
    tradesPerDay: 5,
    startingCapital: 10000,
  });

  const updateParam = (key: keyof SimulationParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Run Monte Carlo simulation
  const simulation = useMemo(() => {
    const numSimulations = 1000;
    const tradingDays = 30;
    const results: number[][] = [];

    for (let sim = 0; sim < numSimulations; sim++) {
      const equity: number[] = [params.startingCapital];
      let capital = params.startingCapital;

      for (let day = 0; day < tradingDays; day++) {
        for (let trade = 0; trade < params.tradesPerDay; trade++) {
          const positionSize = capital * (params.positionSizePct / 100);
          const leveragedSize = positionSize * params.leverage;
          
          const isWin = Math.random() < params.winRate / 100;
          const pnl = isWin
            ? leveragedSize * (params.avgWinPct / 100)
            : -leveragedSize * (params.avgLossPct / 100);
          
          capital = Math.max(0, capital + pnl);
          
          if (capital <= 0) break;
        }
        equity.push(capital);
        if (capital <= 0) break;
      }

      results.push(equity);
    }

    // Calculate statistics
    const finalEquities = results.map(r => r[r.length - 1]);
    const sortedEquities = [...finalEquities].sort((a, b) => a - b);
    
    const median = sortedEquities[Math.floor(numSimulations / 2)];
    const percentile5 = sortedEquities[Math.floor(numSimulations * 0.05)];
    const percentile95 = sortedEquities[Math.floor(numSimulations * 0.95)];
    const ruinCount = finalEquities.filter(e => e <= params.startingCapital * 0.1).length;
    const profitableCount = finalEquities.filter(e => e > params.startingCapital).length;

    // Calculate drawdowns
    const maxDrawdowns = results.map(equity => {
      let maxEquity = equity[0];
      let maxDrawdown = 0;
      for (const value of equity) {
        maxEquity = Math.max(maxEquity, value);
        const drawdown = (maxEquity - value) / maxEquity;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
      return maxDrawdown * 100;
    });
    const avgDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / numSimulations;

    // Percentile paths for chart
    const pathLength = Math.max(...results.map(r => r.length));
    const chartData = Array.from({ length: pathLength }, (_, i) => {
      const values = results.map(r => r[Math.min(i, r.length - 1)]).sort((a, b) => a - b);
      return {
        day: i,
        p5: values[Math.floor(numSimulations * 0.05)],
        p25: values[Math.floor(numSimulations * 0.25)],
        median: values[Math.floor(numSimulations * 0.5)],
        p75: values[Math.floor(numSimulations * 0.75)],
        p95: values[Math.floor(numSimulations * 0.95)],
      };
    });

    return {
      median,
      percentile5,
      percentile95,
      ruinProbability: (ruinCount / numSimulations) * 100,
      profitProbability: (profitableCount / numSimulations) * 100,
      avgDrawdown,
      expectedReturn: ((median - params.startingCapital) / params.startingCapital) * 100,
      chartData,
    };
  }, [params]);

  // Calculate Kelly criterion
  const kellyOptimal = useMemo(() => {
    const p = params.winRate / 100;
    const b = params.avgWinPct / params.avgLossPct;
    const kelly = (p * b - (1 - p)) / b;
    return Math.max(0, kelly * 100);
  }, [params.winRate, params.avgWinPct, params.avgLossPct]);

  const getRiskColor = (ruinProb: number) => {
    if (ruinProb < 5) return 'text-success';
    if (ruinProb < 15) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Risk Simulator
          <Badge variant="outline" className="ml-auto">Monte Carlo</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="params">
          <TabsList className="grid grid-cols-3 w-full mb-4">
            <TabsTrigger value="params">Parameters</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="chart">Simulation</TabsTrigger>
          </TabsList>

          <TabsContent value="params" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Win Rate */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Win Rate</Label>
                  <span className="font-mono">{params.winRate}%</span>
                </div>
                <Slider
                  value={[params.winRate]}
                  onValueChange={([v]) => updateParam('winRate', v)}
                  min={30}
                  max={80}
                  step={1}
                />
              </div>

              {/* Position Size */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Position Size</Label>
                  <span className="font-mono">{params.positionSizePct}%</span>
                </div>
                <Slider
                  value={[params.positionSizePct]}
                  onValueChange={([v]) => updateParam('positionSizePct', v)}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>

              {/* Avg Win */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Avg Win %</Label>
                  <span className="font-mono text-success">+{params.avgWinPct}%</span>
                </div>
                <Slider
                  value={[params.avgWinPct]}
                  onValueChange={([v]) => updateParam('avgWinPct', v)}
                  min={0.5}
                  max={10}
                  step={0.5}
                />
              </div>

              {/* Avg Loss */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Avg Loss %</Label>
                  <span className="font-mono text-destructive">-{params.avgLossPct}%</span>
                </div>
                <Slider
                  value={[params.avgLossPct]}
                  onValueChange={([v]) => updateParam('avgLossPct', v)}
                  min={0.5}
                  max={10}
                  step={0.5}
                />
              </div>

              {/* Leverage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Leverage</Label>
                  <span className="font-mono">{params.leverage}x</span>
                </div>
                <Slider
                  value={[params.leverage]}
                  onValueChange={([v]) => updateParam('leverage', v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>

              {/* Trades Per Day */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Trades/Day</Label>
                  <span className="font-mono">{params.tradesPerDay}</span>
                </div>
                <Slider
                  value={[params.tradesPerDay]}
                  onValueChange={([v]) => updateParam('tradesPerDay', v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
            </div>

            {/* Kelly Criterion */}
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Kelly Optimal Position Size
                </span>
                <span className="font-mono font-medium">{kellyOptimal.toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(100, kellyOptimal)} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Current: {params.positionSizePct}%</span>
                <span className={cn(
                  params.positionSizePct > kellyOptimal ? 'text-destructive' : 'text-success'
                )}>
                  {params.positionSizePct > kellyOptimal ? 'Over-leveraged!' : 'Within bounds'}
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="results" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Expected Return */}
              <div className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Expected 30-Day Return
                </div>
                <div className={cn(
                  'text-xl font-bold',
                  simulation.expectedReturn >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {simulation.expectedReturn >= 0 ? '+' : ''}{simulation.expectedReturn.toFixed(1)}%
                </div>
              </div>

              {/* Ruin Probability */}
              <div className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Ruin Probability
                </div>
                <div className={cn('text-xl font-bold', getRiskColor(simulation.ruinProbability))}>
                  {simulation.ruinProbability.toFixed(1)}%
                </div>
              </div>

              {/* Profit Probability */}
              <div className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Percent className="h-4 w-4" />
                  Profit Probability
                </div>
                <div className="text-xl font-bold text-success">
                  {simulation.profitProbability.toFixed(1)}%
                </div>
              </div>

              {/* Avg Drawdown */}
              <div className="p-3 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <TrendingDown className="h-4 w-4" />
                  Avg Max Drawdown
                </div>
                <div className="text-xl font-bold text-warning">
                  -{simulation.avgDrawdown.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Outcome Distribution */}
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="text-sm text-muted-foreground mb-2">30-Day Outcome Distribution</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>5th Percentile (Worst)</span>
                  <span className={cn(
                    'font-mono',
                    simulation.percentile5 < params.startingCapital ? 'text-destructive' : 'text-success'
                  )}>
                    ${simulation.percentile5.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Median (Expected)</span>
                  <span className="font-mono font-medium">
                    ${simulation.median.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>95th Percentile (Best)</span>
                  <span className="font-mono text-success">
                    ${simulation.percentile95.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chart">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={simulation.chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Days', position: 'bottom', fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  />
                  <ReferenceLine 
                    y={params.startingCapital} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="3 3"
                  />
                  <Area
                    dataKey="p5"
                    stackId="1"
                    stroke="none"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.1}
                  />
                  <Area
                    dataKey="p25"
                    stackId="2"
                    stroke="none"
                    fill="hsl(var(--warning))"
                    fillOpacity={0.2}
                  />
                  <Line
                    dataKey="median"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Area
                    dataKey="p75"
                    stackId="3"
                    stroke="none"
                    fill="hsl(var(--success))"
                    fillOpacity={0.2}
                  />
                  <Area
                    dataKey="p95"
                    stackId="4"
                    stroke="none"
                    fill="hsl(var(--success))"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-destructive/20 rounded" /> 5th percentile
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-primary rounded" /> Median
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-success/20 rounded" /> 95th percentile
              </span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
