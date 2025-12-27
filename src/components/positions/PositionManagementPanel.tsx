import { useState, useMemo } from 'react';
import { usePositions } from '@/hooks/usePositions';
import { useLivePriceFeed } from '@/hooks/useLivePriceFeed';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { WebSocketHealthMonitor } from '@/components/trading/WebSocketHealthMonitor';

import type { Position } from '@/hooks/usePositions';

interface StopLossModalProps {
  position: Position;
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

// Partial Close Modal
interface PartialCloseModalProps {
  position: Position;
  livePrice: number;
  onClose: (percent: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PartialCloseModal({ position, livePrice, onClose, open, onOpenChange }: PartialCloseModalProps) {
  const [closePercent, setClosePercent] = useState(50);
  const size = Number(position.size || 0);
  const closeSize = (size * closePercent) / 100;
  const entryPrice = Number(position.entry_price || 0);
  const isLong = position.side === 'buy';
  
  const estimatedPnl = isLong 
    ? closeSize * (livePrice - entryPrice)
    : closeSize * (entryPrice - livePrice);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minus className="h-5 w-5 text-primary" />
            Partial Close Position
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm text-muted-foreground">Position</p>
              <p className="font-semibold">{position.instrument}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Current Size</p>
              <p className="font-mono font-semibold">{size.toFixed(4)}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Close Amount</Label>
              <span className="text-sm font-mono font-semibold">{closePercent}%</span>
            </div>
            <Slider
              value={[closePercent]}
              onValueChange={(v) => setClosePercent(v[0])}
              min={10}
              max={100}
              step={10}
              className="mb-4"
            />
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map(pct => (
                <Button 
                  key={pct} 
                  variant={closePercent === pct ? 'secondary' : 'outline'} 
                  size="sm"
                  onClick={() => setClosePercent(pct)}
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Close Size</span>
              <span className="font-mono">{closeSize.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Est. Exit Price</span>
              <span className="font-mono">${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Est. P&L</span>
              <span className={cn(
                'font-mono font-semibold',
                estimatedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
              )}>
                {estimatedPnl >= 0 ? '+' : ''}${estimatedPnl.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="bg-trading-short hover:bg-trading-short/90"
            onClick={() => {
              onClose(closePercent);
              onOpenChange(false);
            }}
          >
            Close {closePercent}%
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
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [stopLossModalOpen, setStopLossModalOpen] = useState(false);
  const [partialClosePosition, setPartialClosePosition] = useState<Position | null>(null);
  const [partialCloseModalOpen, setPartialCloseModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Get live prices for all position instruments
  const instruments = useMemo(() => 
    [...new Set(positions.map(p => p.instrument.replace('/', '-')))],
    [positions]
  );
  
  const { prices, isConnected, isConnecting, reconnectAttempts, latencyMs, connect } = useLivePriceFeed({
    symbols: instruments,
    enabled: instruments.length > 0,
  });

  // Calculate live P&L
  const getLivePrice = (instrument: string): number => {
    const feedSymbol = instrument.replace('/', '-');
    return prices.get(feedSymbol)?.price || 0;
  };

  const totalUnrealizedPnl = positions.reduce((sum, p) => {
    const livePrice = getLivePrice(p.instrument);
    const entryPrice = Number(p.entry_price || 0);
    const size = Number(p.size || 0);
    const isLong = p.side === 'buy';
    if (livePrice > 0) {
      return sum + (isLong ? (livePrice - entryPrice) * size : (entryPrice - livePrice) * size);
    }
    return sum + Number(p.unrealized_pnl || 0);
  }, 0);
  
  const totalRealizedPnl = positions.reduce((sum, p) => sum + Number(p.realized_pnl || 0), 0);
  const totalExposure = positions.reduce((sum, p) => {
    const livePrice = getLivePrice(p.instrument) || Number(p.mark_price);
    return sum + Math.abs(Number(p.size) * livePrice);
  }, 0);

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
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold">Position Management</h3>
          <div className="flex items-center gap-3">
            <WebSocketHealthMonitor
              isConnected={isConnected}
              isConnecting={isConnecting}
              reconnectAttempts={reconnectAttempts}
              latencyMs={latencyMs}
              onReconnect={connect}
              compact
            />
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'cards')}>
              <TabsList className="h-8">
                <TabsTrigger value="table" className="text-xs px-2">Table</TabsTrigger>
                <TabsTrigger value="cards" className="text-xs px-2">Cards</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No open positions</p>
          </div>
        ) : viewMode === 'table' ? (
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
                  const livePrice = getLivePrice(position.instrument);
                  const entryPrice = Number(position.entry_price || 0);
                  const markPrice = livePrice > 0 ? livePrice : Number(position.mark_price || 0);
                  const size = Number(position.size || 0);
                  const isLong = position.side === 'buy';
                  
                  const unrealizedPnl = livePrice > 0
                    ? (isLong ? (livePrice - entryPrice) * size : (entryPrice - livePrice) * size)
                    : Number(position.unrealized_pnl || 0);
                  
                  const pnlPercent = entryPrice * size > 0 
                    ? (unrealizedPnl / (entryPrice * size)) * 100 
                    : 0;
                  const isClosing = closingPositions.has(position.id);

                  return (
                    <tr key={position.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{position.instrument}</span>
                          {livePrice > 0 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-success/50 text-success">
                              LIVE
                            </Badge>
                          )}
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
                      <td className="p-4 text-right font-mono">${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
                            title="Set SL/TP"
                            onClick={() => {
                              setEditingPosition(position);
                              setStopLossModalOpen(true);
                            }}
                          >
                            <Target className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Partial Close"
                            onClick={() => {
                              setPartialClosePosition(position);
                              setPartialCloseModalOpen(true);
                            }}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-trading-short hover:text-trading-short hover:bg-trading-short/10"
                            title="Close Position"
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
        ) : (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {positions.map((position) => {
              const livePrice = getLivePrice(position.instrument);
              const entryPrice = Number(position.entry_price || 0);
              const size = Number(position.size || 0);
              const isLong = position.side === 'buy';
              const unrealizedPnl = livePrice > 0
                ? (isLong ? (livePrice - entryPrice) * size : (entryPrice - livePrice) * size)
                : Number(position.unrealized_pnl || 0);
              const pnlPercent = entryPrice * size > 0 
                ? (unrealizedPnl / (entryPrice * size)) * 100 
                : 0;
              const isClosing = closingPositions.has(position.id);

              return (
                <div key={position.id} className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{position.instrument}</span>
                      <Badge className={cn(
                        'text-xs',
                        isLong 
                          ? 'bg-trading-long/20 text-trading-long' 
                          : 'bg-trading-short/20 text-trading-short'
                      )}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{position.leverage}x</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Size</p>
                      <p className="font-mono">{size.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Entry</p>
                      <p className="font-mono">${entryPrice.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Mark</p>
                      <p className="font-mono">${(livePrice || Number(position.mark_price)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">uPnL</p>
                      <p className={cn(
                        'font-mono font-semibold',
                        unrealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
                      )}>
                        {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border/30">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => {
                        setEditingPosition(position);
                        setStopLossModalOpen(true);
                      }}
                    >
                      <Target className="h-3 w-3" />
                      SL/TP
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => {
                        setPartialClosePosition(position);
                        setPartialCloseModalOpen(true);
                      }}
                    >
                      <Minus className="h-3 w-3" />
                      Reduce
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      className="gap-1"
                      onClick={() => handleClosePosition(position.id)}
                      disabled={isClosing}
                    >
                      {isClosing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      Close
                    </Button>
                  </div>
                </div>
              );
            })}
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

      {partialClosePosition && (
        <PartialCloseModal
          position={partialClosePosition}
          livePrice={getLivePrice(partialClosePosition.instrument) || Number(partialClosePosition.mark_price)}
          onClose={(percent) => {
            toast.success(`Closing ${percent}% of ${partialClosePosition.instrument} position`);
          }}
          open={partialCloseModalOpen}
          onOpenChange={setPartialCloseModalOpen}
        />
      )}
    </div>
  );
}
