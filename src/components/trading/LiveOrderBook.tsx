import { useLiveOrderBook } from '@/hooks/useLiveOrderBook';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LiveOrderBookProps {
  symbol: string;
  depth?: number;
  className?: string;
}

export function LiveOrderBook({ symbol, depth = 10, className }: LiveOrderBookProps) {
  const { 
    orderBook, 
    isConnected, 
    isConnecting,
    latencyMs,
    connectionError,
    isSupported,
    isSimulated,
    connect 
  } = useLiveOrderBook({ symbol, depth, enabled: true });

  // Not supported - show clear message
  if (!isSupported) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground">Order Book</h3>
          <Badge variant="outline" className="text-muted-foreground">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Unavailable
          </Badge>
        </div>
        <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Order book data not available for this symbol
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isConnecting && !orderBook) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground">Order Book</h3>
          <Badge variant="outline" className="text-muted-foreground animate-pulse">
            Loading...
          </Badge>
        </div>
        <div className="glass-panel rounded-xl p-8 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Error state
  if (connectionError && !orderBook) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground">Order Book</h3>
          <Badge variant="destructive">Error</Badge>
        </div>
        <div className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{connectionError}</p>
          <Button size="sm" variant="outline" onClick={connect}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const maxTotal = Math.max(
    orderBook?.bids[orderBook.bids.length - 1]?.total || 0,
    orderBook?.asks[orderBook.asks.length - 1]?.total || 0
  );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground">Order Book</h3>
        <div className="flex items-center gap-2">
          {isSimulated && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs">
              Derived
            </Badge>
          )}
          {isConnected && (
            <Badge variant="outline" className="text-long border-long/50 text-xs">
              {latencyMs > 0 ? `${latencyMs}ms` : 'Live'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Bids */}
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-long" />
            <span className="font-semibold text-sm">Bids</span>
            {orderBook && (
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                Best: ${orderBook.bestBid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
          
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-1 px-1">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            {orderBook?.bids.map((level, i) => {
              const widthPercent = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
              return (
                <div key={i} className="relative flex items-center justify-between py-0.5 px-1">
                  <div 
                    className="absolute inset-y-0 left-0 bg-long/10 rounded-r transition-all duration-150"
                    style={{ width: `${widthPercent}%` }}
                  />
                  <span className="relative font-mono text-long">
                    ${level.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="relative font-mono text-muted-foreground">
                    {level.size.toFixed(4)}
                  </span>
                  <span className="relative font-mono">
                    {level.total.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Asks */}
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-short" />
            <span className="font-semibold text-sm">Asks</span>
            {orderBook && (
              <span className="ml-auto text-xs text-muted-foreground">
                Spread: {orderBook.spread.toFixed(2)} ({orderBook.spreadPercent.toFixed(3)}%)
              </span>
            )}
          </div>
          
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground mb-1 px-1">
              <span>Price</span>
              <span>Size</span>
              <span>Total</span>
            </div>
            {orderBook?.asks.map((level, i) => {
              const widthPercent = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
              return (
                <div key={i} className="relative flex items-center justify-between py-0.5 px-1">
                  <div 
                    className="absolute inset-y-0 right-0 bg-short/10 rounded-l transition-all duration-150"
                    style={{ width: `${widthPercent}%` }}
                  />
                  <span className="relative font-mono text-short">
                    ${level.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="relative font-mono text-muted-foreground">
                    {level.size.toFixed(4)}
                  </span>
                  <span className="relative font-mono">
                    {level.total.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mid Price Display */}
      {orderBook && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-muted-foreground">Mid Price:</span>
          <span className="font-mono font-bold text-primary">
            ${orderBook.midPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}
