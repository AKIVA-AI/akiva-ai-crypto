import { useState } from 'react';
import { usePositions } from '@/hooks/usePositions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  X, 
  Edit2, 
  Target, 
  AlertTriangle,
  Loader2,
  ChevronUp,
  ChevronDown,
  DollarSign,
  Percent,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface StopLossModalProps {
  position: any;
  onSave: (stopLoss: number, takeProfit: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StopLossTakeProfitModal({ position, onSave, open, onOpenChange }: StopLossModalProps) {
  const entryPrice = Number(position.entry_price);
  const isLong = position.side === 'buy';
  
  const [stopLossPercent, setStopLossPercent] = useState(5);
  const [takeProfitPercent, setTakeProfitPercent] = useState(10);

  const stopLossPrice = isLong 
    ? entryPrice * (1 - stopLossPercent / 100)
    : entryPrice * (1 + stopLossPercent / 100);
  
  const takeProfitPrice = isLong
    ? entryPrice * (1 + takeProfitPercent / 100)
    : entryPrice * (1 - takeProfitPercent / 100);

  const maxLoss = Number(position.size) * entryPrice * (stopLossPercent / 100);
  const maxProfit = Number(position.size) * entryPrice * (takeProfitPercent / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Set Stop-Loss & Take-Profit
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm text-muted-foreground">Position</p>
              <p className="font-semibold">{position.instrument}</p>
            </div>
            <Badge className={isLong ? 'bg-trading-long/20 text-trading-long' : 'bg-trading-short/20 text-trading-short'}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
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
                className="mb-2"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Price: ${stopLossPrice.toFixed(2)}</span>
                <span className="text-trading-short">Max Loss: -${maxLoss.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
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
                className="mb-2"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Price: ${takeProfitPrice.toFixed(2)}</span>
                <span className="text-trading-long">Target Profit: +${maxProfit.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm font-medium mb-2">Risk/Reward Ratio</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div 
                  className="h-full bg-trading-long"
                  style={{ width: `${(takeProfitPercent / (stopLossPercent + takeProfitPercent)) * 100}%` }}
                />
              </div>
              <span className="text-sm font-mono font-semibold">
                1:{(takeProfitPercent / stopLossPercent).toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => {
            onSave(stopLossPrice, takeProfitPrice);
            onOpenChange(false);
          }}>
            Set Orders
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PositionManagementPanel() {
  const { data: positions = [], isLoading } = usePositions();
  const queryClient = useQueryClient();
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  const [editingPosition, setEditingPosition] = useState<any>(null);
  const [stopLossModalOpen, setStopLossModalOpen] = useState(false);

  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + Number(p.unrealized_pnl || 0), 0);
  const totalRealizedPnl = positions.reduce((sum, p) => sum + Number(p.realized_pnl || 0), 0);
  const totalExposure = positions.reduce((sum, p) => 
    sum + Math.abs(Number(p.size) * Number(p.mark_price)), 0
  );

  const handleClosePosition = async (positionId: string) => {
    setClosingPositions(prev => new Set(prev).add(positionId));
    
    try {
      const { error } = await supabase
        .from('positions')
        .update({ is_open: false })
        .eq('id', positionId);

      if (error) throw error;

      toast.success('Position closed successfully');
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (error) {
      toast.error('Failed to close position');
      console.error(error);
    } finally {
      setClosingPositions(prev => {
        const next = new Set(prev);
        next.delete(positionId);
        return next;
      });
    }
  };

  const handleSetStopLoss = (stopLoss: number, takeProfit: number) => {
    toast.success(`Stop-loss set at $${stopLoss.toFixed(2)}, Take-profit at $${takeProfit.toFixed(2)}`);
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl p-6 flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Activity className="h-4 w-4" />
            <span className="text-sm">Open Positions</span>
          </div>
          <p className="text-2xl font-mono font-bold">{positions.length}</p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">Total Exposure</span>
          </div>
          <p className="text-2xl font-mono font-bold">
            ${totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Percent className="h-4 w-4" />
            <span className="text-sm">Unrealized P&L</span>
          </div>
          <p className={cn(
            'text-2xl font-mono font-bold flex items-center gap-1',
            totalUnrealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
          )}>
            {totalUnrealizedPnl >= 0 ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            ${Math.abs(totalUnrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">Realized P&L</span>
          </div>
          <p className={cn(
            'text-2xl font-mono font-bold',
            totalRealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
          )}>
            {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Positions Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <h3 className="font-semibold">Position Management</h3>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No open positions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-muted-foreground text-left text-sm border-b border-border/50">
                  <th className="p-4 font-medium">Instrument</th>
                  <th className="p-4 font-medium">Side</th>
                  <th className="p-4 font-medium text-right">Size</th>
                  <th className="p-4 font-medium text-right">Entry</th>
                  <th className="p-4 font-medium text-right">Mark</th>
                  <th className="p-4 font-medium text-right">Liq. Price</th>
                  <th className="p-4 font-medium text-right">uPnL</th>
                  <th className="p-4 font-medium text-right">Leverage</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => {
                  const unrealizedPnl = Number(position.unrealized_pnl || 0);
                  const entryPrice = Number(position.entry_price || 0);
                  const markPrice = Number(position.mark_price || 0);
                  const size = Number(position.size || 0);
                  const pnlPercent = entryPrice * size > 0 
                    ? (unrealizedPnl / (entryPrice * size)) * 100 
                    : 0;
                  const isLong = position.side === 'buy';
                  const isClosing = closingPositions.has(position.id);

                  return (
                    <tr key={position.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{position.instrument}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className={cn(
                          'font-medium',
                          isLong 
                            ? 'bg-trading-long/20 text-trading-long border-trading-long/30' 
                            : 'bg-trading-short/20 text-trading-short border-trading-short/30'
                        )}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-mono">{size.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">${entryPrice.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">${markPrice.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-trading-short">
                        {position.liquidation_price 
                          ? `$${Number(position.liquidation_price).toLocaleString()}` 
                          : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <div className={cn(
                          'font-mono font-medium',
                          unrealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
                        )}>
                          {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                          <span className="text-xs ml-1 opacity-75">
                            ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono">{position.leverage}x</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingPosition(position);
                              setStopLossModalOpen(true);
                            }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-trading-short hover:text-trading-short hover:bg-trading-short/10"
                            onClick={() => handleClosePosition(position.id)}
                            disabled={isClosing}
                          >
                            {isClosing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingPosition && (
        <StopLossTakeProfitModal
          position={editingPosition}
          onSave={handleSetStopLoss}
          open={stopLossModalOpen}
          onOpenChange={setStopLossModalOpen}
        />
      )}
    </div>
  );
}
