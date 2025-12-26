import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PnLDataPoint {
  time: string;
  pnl: number;
  cumulative: number;
}

export function PnLChart() {
  const { data: positions, isLoading } = useQuery({
    queryKey: ['positions-pnl'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select('unrealized_pnl, realized_pnl, created_at, updated_at')
        .order('updated_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const chartData = useMemo(() => {
    if (!positions?.length) {
      // Generate mock data for demonstration
      const now = new Date();
      const data: PnLDataPoint[] = [];
      let cumulative = 0;
      
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        const pnl = (Math.random() - 0.45) * 5000;
        cumulative += pnl;
        data.push({
          time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          pnl: Math.round(pnl),
          cumulative: Math.round(cumulative),
        });
      }
      return data;
    }

    // Group positions by hour and calculate cumulative P&L
    const hourlyData: Record<string, number> = {};
    let cumulative = 0;
    
    positions.forEach(pos => {
      const hour = new Date(pos.updated_at).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const totalPnl = (pos.unrealized_pnl || 0) + (pos.realized_pnl || 0);
      hourlyData[hour] = (hourlyData[hour] || 0) + totalPnl;
    });

    return Object.entries(hourlyData).map(([time, pnl]) => {
      cumulative += pnl;
      return { time, pnl: Math.round(pnl), cumulative: Math.round(cumulative) };
    });
  }, [positions]);

  const totalPnL = chartData.length > 0 ? chartData[chartData.length - 1].cumulative : 0;
  const isPositive = totalPnL >= 0;

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Daily P&L Performance</h3>
          <p className="text-xs text-muted-foreground">Cumulative returns over 24h</p>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
          isPositive 
            ? "bg-success/10 text-success" 
            : "bg-destructive/10 text-destructive"
        )}>
          {isPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>{isPositive ? '+' : ''}${totalPnL.toLocaleString()}</span>
        </div>
      </div>
      
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop 
                  offset="5%" 
                  stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                  stopOpacity={0.3}
                />
                <stop 
                  offset="95%" 
                  stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
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
              width={45}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Cumulative P&L']}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
              strokeWidth={2}
              fill="url(#pnlGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
