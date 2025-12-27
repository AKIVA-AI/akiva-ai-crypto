import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLivePriceFeed } from '@/hooks/useLivePriceFeed';
import { usePositions } from '@/hooks/usePositions';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Activity, Wifi, WifiOff } from 'lucide-react';

interface RealtimePnLTrackerProps {
  className?: string;
}

// Map position instruments to price feed symbols
const mapInstrumentToSymbol = (instrument: string): string => {
  // Handle various formats: BTC-USD -> BTC-USDT, BTCUSD -> BTC-USDT
  const normalized = instrument.replace(/[-/]/g, '').toUpperCase();
  if (normalized.endsWith('USD')) {
    return normalized.replace('USD', '-USDT');
  }
  if (normalized.endsWith('USDT')) {
    return normalized.replace('USDT', '-USDT');
  }
  return `${normalized}-USDT`;
};

export function RealtimePnLTracker({ className }: RealtimePnLTrackerProps) {
  const { data: positions = [] } = usePositions();
  const openPositions = positions.filter(p => p.is_open);
  
  // Get unique symbols from positions
  const symbols = useMemo(() => {
    const symbolSet = new Set<string>();
    openPositions.forEach(pos => {
      symbolSet.add(mapInstrumentToSymbol(pos.instrument));
    });
    // Add common symbols we might need
    ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'].forEach(s => symbolSet.add(s));
    return Array.from(symbolSet);
  }, [openPositions]);

  const { prices, isConnected } = useLivePriceFeed({ symbols, enabled: true });

  // Calculate real-time P&L for each position
  const positionsWithRealtimePnL = useMemo(() => {
    return openPositions.map(position => {
      const symbol = mapInstrumentToSymbol(position.instrument);
      const livePrice = prices.get(symbol);
      const currentPrice = livePrice?.price || position.mark_price;
      
      const priceDiff = position.side === 'buy' 
        ? currentPrice - position.entry_price
        : position.entry_price - currentPrice;
      
      const unrealizedPnL = priceDiff * position.size;
      const pnlPercent = (priceDiff / position.entry_price) * 100;
      
      return {
        ...position,
        currentPrice,
        unrealizedPnL,
        pnlPercent,
        isLive: !!livePrice,
      };
    });
  }, [openPositions, prices]);

  // Aggregate P&L
  const totalUnrealizedPnL = positionsWithRealtimePnL.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalNotional = positionsWithRealtimePnL.reduce((sum, p) => sum + (p.entry_price * p.size), 0);
  const totalPnLPercent = totalNotional > 0 ? (totalUnrealizedPnL / totalNotional) * 100 : 0;

  return (
    <Card className={cn('glass-panel', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Real-Time P&L
            </CardTitle>
            <CardDescription>Live position tracking</CardDescription>
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              'gap-1',
              isConnected ? 'border-success/50 text-success' : 'border-destructive/50 text-destructive'
            )}
          >
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total P&L Summary */}
        <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Unrealized P&L</span>
            <div className="flex items-center gap-2">
              {totalUnrealizedPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className={cn(
                'text-2xl font-mono font-bold',
                totalUnrealizedPnL >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{openPositions.length} open positions</span>
            <Badge className={cn(
              totalPnLPercent >= 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
            )}>
              {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
            </Badge>
          </div>
        </div>

        {/* Individual Positions */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {positionsWithRealtimePnL.map((position) => (
            <div 
              key={position.id} 
              className="p-3 rounded-lg bg-card/50 border border-border/30 hover:border-border/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    position.side === 'buy' ? 'border-long/50 text-long' : 'border-short/50 text-short'
                  )}>
                    {position.side.toUpperCase()}
                  </Badge>
                  <span className="font-semibold">{position.instrument}</span>
                  {position.isLive && (
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  )}
                </div>
                <div className={cn(
                  'font-mono font-bold',
                  position.unrealizedPnL >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Entry</span>
                  <p className="font-mono">${position.entry_price.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Current</span>
                  <p className="font-mono">${position.currentPrice.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Size</span>
                  <p className="font-mono">{position.size.toFixed(4)}</p>
                </div>
              </div>
              
              <div className="mt-2">
                <Progress 
                  value={Math.min(Math.abs(position.pnlPercent) * 10, 100)} 
                  className={cn(
                    'h-1',
                    position.pnlPercent >= 0 ? '[&>div]:bg-success' : '[&>div]:bg-destructive'
                  )}
                />
              </div>
            </div>
          ))}
          
          {openPositions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No open positions</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
