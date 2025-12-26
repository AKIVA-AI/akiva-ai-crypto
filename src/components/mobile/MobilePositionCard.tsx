import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  X, 
  Target, 
  ChevronRight,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';

interface MobilePositionCardProps {
  position: any;
  onClose: (id: string) => Promise<void>;
  onSetStopLoss: (position: any) => void;
  isClosing?: boolean;
}

export function MobilePositionCard({ position, onClose, onSetStopLoss, isClosing }: MobilePositionCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const unrealizedPnl = Number(position.unrealized_pnl || 0);
  const entryPrice = Number(position.entry_price || 0);
  const markPrice = Number(position.mark_price || 0);
  const size = Number(position.size || 0);
  const pnlPercent = entryPrice * size > 0 
    ? (unrealizedPnl / (entryPrice * size)) * 100 
    : 0;
  const isLong = position.side === 'buy';
  const notionalValue = size * markPrice;

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    // Only allow left swipe (negative values) with a max of -100px
    setSwipeX(Math.max(-100, Math.min(0, diff)));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (swipeX < -60) {
      // Trigger close action
      onClose(position.id);
    }
    setSwipeX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe background action */}
      <div 
        className="absolute inset-y-0 right-0 w-24 bg-destructive flex items-center justify-center"
        style={{ opacity: Math.abs(swipeX) / 100 }}
      >
        <X className="h-6 w-6 text-destructive-foreground" />
      </div>

      {/* Main card content */}
      <div
        className={cn(
          "glass-panel p-4 transition-transform",
          isDragging && "transition-none"
        )}
        style={{ transform: `translateX(${swipeX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            <span className="font-semibold text-lg">{position.instrument}</span>
            <Badge className={cn(
              'text-xs',
              isLong 
                ? 'bg-trading-long/20 text-trading-long border-trading-long/30' 
                : 'bg-trading-short/20 text-trading-short border-trading-short/30'
            )}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {position.leverage}x
          </Badge>
        </div>

        {/* PnL display - prominent */}
        <div className={cn(
          "text-center py-4 rounded-lg mb-3",
          unrealizedPnl >= 0 ? 'bg-trading-long/10' : 'bg-trading-short/10'
        )}>
          <div className={cn(
            "text-3xl font-mono font-bold flex items-center justify-center gap-2",
            unrealizedPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
          )}>
            {unrealizedPnl >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}
          </div>
          <div className={cn(
            "text-sm font-mono mt-1",
            unrealizedPnl >= 0 ? 'text-trading-long/70' : 'text-trading-short/70'
          )}>
            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
          </div>
        </div>

        {/* Position details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-muted-foreground text-xs mb-1">Size</div>
            <div className="font-mono font-medium">{size.toLocaleString()}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-muted-foreground text-xs mb-1">Notional</div>
            <div className="font-mono font-medium">${notionalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-muted-foreground text-xs mb-1">Entry</div>
            <div className="font-mono font-medium">${entryPrice.toLocaleString()}</div>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-muted-foreground text-xs mb-1">Mark</div>
            <div className="font-mono font-medium">${markPrice.toLocaleString()}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onSetStopLoss(position)}
          >
            <Target className="h-4 w-4 mr-2" />
            SL/TP
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={() => onClose(position.id)}
            disabled={isClosing}
          >
            {isClosing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            Close
          </Button>
        </div>

        {/* Swipe hint */}
        <div className="mt-3 flex items-center justify-center text-xs text-muted-foreground/50">
          <ChevronRight className="h-3 w-3 rotate-180" />
          <span className="mx-1">Swipe to close</span>
          <ChevronRight className="h-3 w-3 rotate-180" />
        </div>
      </div>
    </div>
  );
}