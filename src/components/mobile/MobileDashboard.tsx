import { useState } from 'react';
import { usePositions } from '@/hooks/usePositions';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { MobilePositionCard } from './MobilePositionCard';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign,
  AlertTriangle,
  Target,
  BarChart3,
  PieChart,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function MobileDashboard() {
  const { data: positions = [], isLoading: positionsLoading, refetch: refetchPositions } = usePositions();
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const queryClient = useQueryClient();

  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  const [stopLossModal, setStopLossModal] = useState<{ open: boolean; position: any | null }>({ open: false, position: null });
  const [stopLossPercent, setStopLossPercent] = useState(5);
  const [takeProfitPercent, setTakeProfitPercent] = useState(10);
  const [refreshing, setRefreshing] = useState(false);

  const totalPnl = metrics?.dailyPnl || 0;
  const totalExposure = positions.reduce((sum, p) => 
    sum + Math.abs(Number(p.size) * Number(p.mark_price)), 0
  );
  const unrealizedPnl = positions.reduce((sum, p) => sum + Number(p.unrealized_pnl || 0), 0);

  const handleClosePosition = async (positionId: string) => {
    setClosingPositions(prev => new Set(prev).add(positionId));
    
    try {
      const { error } = await supabase
        .from('positions')
        .update({ is_open: false })
        .eq('id', positionId);

      if (error) throw error;
      toast.success('Position closed');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (error) {
      toast.error('Failed to close position');
    } finally {
      setClosingPositions(prev => {
        const next = new Set(prev);
        next.delete(positionId);
        return next;
      });
    }
  };

  const handleSetStopLoss = () => {
    if (!stopLossModal.position) return;
    const entryPrice = Number(stopLossModal.position.entry_price);
    const isLong = stopLossModal.position.side === 'buy';
    
    const slPrice = isLong 
      ? entryPrice * (1 - stopLossPercent / 100)
      : entryPrice * (1 + stopLossPercent / 100);
    
    const tpPrice = isLong
      ? entryPrice * (1 + takeProfitPercent / 100)
      : entryPrice * (1 - takeProfitPercent / 100);

    toast.success(`SL: $${slPrice.toFixed(2)}, TP: $${tpPrice.toFixed(2)}`);
    setStopLossModal({ open: false, position: null });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchPositions();
    setRefreshing(false);
    toast.success('Refreshed');
  };

  const isLoading = positionsLoading || metricsLoading;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-strong p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Trading Dashboard</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className={cn(
              "text-lg font-mono font-bold",
              totalPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
            )}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground">Today P&L</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono font-bold text-primary">
              {positions.length}
            </div>
            <div className="text-xs text-muted-foreground">Positions</div>
          </div>
          <div className="text-center">
            <div className={cn(
              "text-lg font-mono font-bold",
              unrealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
            )}>
              {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground">Unrealized</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="positions" className="p-4">
        <TabsList className="w-full grid grid-cols-3 mb-4">
          <TabsTrigger value="positions" className="text-sm">
            <Activity className="h-4 w-4 mr-1.5" />
            Positions
          </TabsTrigger>
          <TabsTrigger value="metrics" className="text-sm">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="exposure" className="text-sm">
            <PieChart className="h-4 w-4 mr-1.5" />
            Exposure
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-0 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No open positions</p>
            </div>
          ) : (
            positions.map((position) => (
              <MobilePositionCard
                key={position.id}
                position={position}
                onClose={handleClosePosition}
                onSetStopLoss={(p) => setStopLossModal({ open: true, position: p })}
                isClosing={closingPositions.has(position.id)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="metrics" className="mt-0 space-y-3">
          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Total Exposure</span>
            </div>
            <div className="text-2xl font-mono font-bold">
              ${totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Daily P&L %</span>
            </div>
            <div className={cn(
              "text-2xl font-mono font-bold",
              (metrics?.dailyPnlPercent || 0) >= 0 ? 'text-trading-long' : 'text-trading-short'
            )}>
              {metrics?.dailyPnlPercent?.toFixed(2) || '0'}%
            </div>
          </div>

          <div className="glass-panel rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="h-4 w-4" />
              <span className="text-sm">Active Strategies</span>
            </div>
            <div className="text-2xl font-mono font-bold">
              {metrics?.activeStrategies || 0}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="exposure" className="mt-0">
          <div className="glass-panel rounded-xl p-4">
            <h3 className="font-semibold mb-4">Exposure by Instrument</h3>
            {positions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PieChart className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No positions to display</p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position) => {
                  const exposure = Math.abs(Number(position.size) * Number(position.mark_price));
                  const percentage = totalExposure > 0 ? (exposure / totalExposure) * 100 : 0;
                  
                  return (
                    <div key={position.id}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{position.instrument}</span>
                        <span className="font-mono">{percentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            position.side === 'buy' ? 'bg-trading-long' : 'bg-trading-short'
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Stop Loss Modal */}
      <Dialog open={stopLossModal.open} onOpenChange={(open) => setStopLossModal({ open, position: stopLossModal.position })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Set SL/TP
            </DialogTitle>
          </DialogHeader>

          {stopLossModal.position && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="font-semibold">{stopLossModal.position.instrument}</span>
                <Badge className={stopLossModal.position.side === 'buy' ? 'bg-trading-long/20 text-trading-long' : 'bg-trading-short/20 text-trading-short'}>
                  {stopLossModal.position.side === 'buy' ? 'LONG' : 'SHORT'}
                </Badge>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-trading-short flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Stop-Loss
                    </Label>
                    <span className="text-sm font-mono">{stopLossPercent}%</span>
                  </div>
                  <Slider
                    value={[stopLossPercent]}
                    onValueChange={(v) => setStopLossPercent(v[0])}
                    min={1}
                    max={25}
                    step={0.5}
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-trading-long flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      Take-Profit
                    </Label>
                    <span className="text-sm font-mono">{takeProfitPercent}%</span>
                  </div>
                  <Slider
                    value={[takeProfitPercent]}
                    onValueChange={(v) => setTakeProfitPercent(v[0])}
                    min={1}
                    max={50}
                    step={0.5}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium mb-1">Risk/Reward</p>
                <span className="text-lg font-mono font-semibold">
                  1:{(takeProfitPercent / stopLossPercent).toFixed(1)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStopLossModal({ open: false, position: null })}>
              Cancel
            </Button>
            <Button onClick={handleSetStopLoss}>
              Set Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}