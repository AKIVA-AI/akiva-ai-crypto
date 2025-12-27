import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  ComposedChart,
  Bar,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EquityCurveDataPoint {
  date: string;
  equity: number;
  drawdown: number;
  benchmark: number;
}

interface TradeDataPoint {
  date: string;
  pnl: number;
  cumulative: number;
  isWin: boolean;
}

interface BacktestChartsProps {
  initialCapital: number;
  totalReturn: number;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
}

export function BacktestEquityCurve({ 
  initialCapital, 
  totalReturn,
  maxDrawdown,
  totalTrades,
  winRate,
}: BacktestChartsProps) {
  const { equityData, tradeData, stats } = useMemo(() => {
    // Generate equity curve data
    const equity: EquityCurveDataPoint[] = [];
    const trades: TradeDataPoint[] = [];
    
    const days = 180;
    let currentEquity = initialCapital;
    let benchmarkEquity = initialCapital;
    let maxEquity = initialCapital;
    let cumulative = 0;
    
    const dailyReturn = Math.pow(1 + totalReturn / 100, 1 / days) - 1;
    const benchmarkReturn = 0.0003; // ~12% annual
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Add some volatility
      const volatility = (Math.random() - 0.5) * 0.03;
      const dailyChange = dailyReturn + volatility;
      currentEquity *= (1 + dailyChange);
      benchmarkEquity *= (1 + benchmarkReturn + (Math.random() - 0.5) * 0.01);
      
      maxEquity = Math.max(maxEquity, currentEquity);
      const drawdown = ((maxEquity - currentEquity) / maxEquity) * 100;
      
      equity.push({
        date: dateStr,
        equity: Math.round(currentEquity),
        drawdown: -Math.round(drawdown * 100) / 100,
        benchmark: Math.round(benchmarkEquity),
      });
      
      // Generate trades (roughly every 2 days on average)
      if (Math.random() > 0.5) {
        const isWin = Math.random() < winRate / 100;
        const tradePnl = isWin 
          ? Math.random() * 2000 + 200
          : -(Math.random() * 1500 + 100);
        cumulative += tradePnl;
        
        trades.push({
          date: dateStr,
          pnl: Math.round(tradePnl),
          cumulative: Math.round(cumulative),
          isWin,
        });
      }
    }

    const finalEquity = equity[equity.length - 1]?.equity || initialCapital;
    const finalBenchmark = equity[equity.length - 1]?.benchmark || initialCapital;
    
    return {
      equityData: equity,
      tradeData: trades.slice(-50), // Last 50 trades
      stats: {
        finalEquity,
        absoluteReturn: finalEquity - initialCapital,
        outperformance: ((finalEquity - finalBenchmark) / initialCapital) * 100,
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCapital, totalReturn, winRate]);

  return (
    <div className="space-y-6">
      {/* Equity Curve */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold">Equity Curve</h4>
            <p className="text-xs text-muted-foreground">Portfolio value over time vs benchmark</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-primary" />
              <span className="text-xs text-muted-foreground">Strategy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-muted-foreground/50" style={{ borderStyle: 'dashed' }} />
              <span className="text-xs text-muted-foreground">Benchmark</span>
            </div>
            <Badge className={cn(
              stats.outperformance >= 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
            )}>
              {stats.outperformance >= 0 ? '+' : ''}{stats.outperformance.toFixed(1)}% vs benchmark
            </Badge>
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'equity') return [`$${value.toLocaleString()}`, 'Strategy'];
                  if (name === 'benchmark') return [`$${value.toLocaleString()}`, 'Benchmark'];
                  return [value, name];
                }}
              />
              <ReferenceLine y={initialCapital} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#equityGradient)"
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Drawdown Chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold">Drawdown</h4>
            <p className="text-xs text-muted-foreground">Peak-to-trough decline</p>
          </div>
          <Badge variant="destructive" className="bg-destructive/20">
            Max: {maxDrawdown.toFixed(1)}%
          </Badge>
        </div>
        
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `${value}%`}
                width={40}
                domain={['dataMin', 0]}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="hsl(var(--destructive))"
                strokeWidth={1}
                fill="url(#drawdownGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Trade Distribution */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-semibold">Trade P&L Distribution</h4>
            <p className="text-xs text-muted-foreground">Individual trade results</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-xs">{tradeData.filter(t => t.isWin).length} wins</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3 w-3 text-destructive" />
              <span className="text-xs">{tradeData.filter(t => !t.isWin).length} losses</span>
            </div>
          </div>
        </div>
        
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={tradeData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                yAxisId="pnl"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                width={45}
              />
              <YAxis 
                yAxisId="cumulative"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'pnl') return [`$${value.toLocaleString()}`, 'Trade P&L'];
                  if (name === 'cumulative') return [`$${value.toLocaleString()}`, 'Cumulative'];
                  return [value, name];
                }}
              />
              <ReferenceLine yAxisId="pnl" y={0} stroke="hsl(var(--border))" />
              <Bar
                yAxisId="pnl"
                dataKey="pnl"
                fill="hsl(var(--primary))"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="cumulative"
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
