import { useMemo } from 'react';
import { usePositions } from '@/hooks/usePositions';
import { useLivePriceFeed } from '@/hooks/useLivePriceFeed';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity, Wifi, WifiOff } from 'lucide-react';

// Convert position instrument to price feed symbol format
const toFeedSymbol = (instrument: string): string => {
  // Handle formats like "BTC/USD", "BTC-USD", "BTCUSD"
  const cleaned = instrument.replace(/[\/\-]/g, '');
  // Map USD to USDT for Binance
  if (cleaned.endsWith('USD') && !cleaned.endsWith('USDT')) {
    return cleaned.replace('USD', '-USDT');
  }
  // Already has proper format like BTC-USDT
  if (instrument.includes('-')) {
    return instrument;
  }
  return `${cleaned.slice(0, -4)}-${cleaned.slice(-4)}`;
};

export function LivePositionTracker() {
  const { data: positions = [] } = usePositions();
  
  // Get unique symbols from positions in Binance format
  const symbols = useMemo(() => {
    return [...new Set(positions.map(p => toFeedSymbol(p.instrument)))];
  }, [positions]);

  const { prices, isConnected } = useLivePriceFeed({ 
    symbols, 
    enabled: symbols.length > 0 
  });

  // Calculate live P&L for each position
  const livePositions = useMemo(() => {
    return positions.map(position => {
      const feedSymbol = toFeedSymbol(position.instrument);
      const priceUpdate = prices.get(feedSymbol);
      const livePrice = priceUpdate?.price || Number(position.mark_price);
      const entryPrice = Number(position.entry_price);
      const size = Number(position.size);
      const isLong = position.side === 'buy';
      
      const priceDiff = livePrice - entryPrice;
      const livePnl = isLong ? priceDiff * size : -priceDiff * size;
      const livePnlPercent = (livePnl / (entryPrice * size)) * 100;
      
      return {
        ...position,
        livePrice,
        livePnl,
        livePnlPercent,
        priceChange24h: priceUpdate?.change24h || 0,
        lastUpdate: priceUpdate?.timestamp,
      };
    });
  }, [positions, prices]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalPnl = livePositions.reduce((sum, p) => sum + p.livePnl, 0);
    const totalExposure = livePositions.reduce((sum, p) => 
      sum + Math.abs(Number(p.size) * p.livePrice), 0
    );
    return { totalPnl, totalExposure };
  }, [livePositions]);

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Live Positions</h3>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="text-xs gap-1 text-success border-success/30">
              <Wifi className="h-3 w-3" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </Badge>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="p-3 bg-muted/30 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-muted-foreground mr-2">Live P&L:</span>
            <span className={cn(
              "font-mono font-bold",
              totals.totalPnl >= 0 ? 'text-trading-long' : 'text-trading-short'
            )}>
              {totals.totalPnl >= 0 ? '+' : ''}${totals.totalPnl.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-2">Exposure:</span>
            <span className="font-mono font-medium">
              ${totals.totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Positions list */}
      <div className="divide-y divide-border/30">
        {livePositions.map((position) => (
          <div key={position.id} className="p-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{position.instrument}</span>
                  <Badge className={cn(
                    'text-xs',
                    position.side === 'buy' 
                      ? 'bg-trading-long/20 text-trading-long' 
                      : 'bg-trading-short/20 text-trading-short'
                  )}>
                    {position.side === 'buy' ? 'L' : 'S'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Size: {Number(position.size).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="font-mono text-sm">${position.livePrice.toLocaleString()}</span>
                {position.priceChange24h !== 0 && (
                  <span className={cn(
                    "text-xs flex items-center",
                    position.priceChange24h >= 0 ? 'text-trading-long' : 'text-trading-short'
                  )}>
                    {position.priceChange24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(position.priceChange24h).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className={cn(
                "font-mono text-sm font-medium",
                position.livePnl >= 0 ? 'text-trading-long' : 'text-trading-short'
              )}>
                {position.livePnl >= 0 ? '+' : ''}${position.livePnl.toFixed(2)}
                <span className="text-xs ml-1 opacity-70">
                  ({position.livePnlPercent >= 0 ? '+' : ''}{position.livePnlPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}