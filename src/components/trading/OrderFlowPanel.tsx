import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useOrderFlowAnalysis, useCumulativeVolumeDelta } from '@/hooks/useOrderFlowAnalysis';
import { Activity, TrendingUp, TrendingDown, Minus, Zap, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderFlowPanelProps {
  symbol: string;
  compact?: boolean;
}

export function OrderFlowPanel({ symbol, compact = false }: OrderFlowPanelProps) {
  const { metrics, isConnected, tradeCount } = useOrderFlowAnalysis(symbol);
  const { cvdHistory, divergence } = useCumulativeVolumeDelta(symbol);

  if (!metrics) {
    return (
      <Card className={cn(compact ? 'p-3' : '')}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" />
            <p>Connecting to trade stream...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSignalColor = (signal: typeof metrics.signal) => {
    switch (signal) {
      case 'strong_buy': return 'bg-success text-success-foreground';
      case 'buy': return 'bg-success/70 text-success-foreground';
      case 'sell': return 'bg-destructive/70 text-destructive-foreground';
      case 'strong_sell': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getMomentumIcon = () => {
    switch (metrics.momentum) {
      case 'bullish': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'bearish': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (compact) {
    return (
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getMomentumIcon()}
            <span className="font-mono text-sm">{symbol}</span>
            <Badge className={cn('text-xs', getSignalColor(metrics.signal))}>
              {metrics.signal.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>δ {metrics.netDelta > 0 ? '+' : ''}{metrics.netDelta.toFixed(2)}</span>
            <span>{metrics.tradeIntensity.toFixed(1)}/s</span>
          </div>
        </div>
        <Progress 
          value={metrics.imbalanceRatio * 100} 
          className="h-2 mt-2"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Order Flow Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'default' : 'secondary'} className="text-xs">
              {isConnected ? 'LIVE' : 'CONNECTING'}
            </Badge>
            <Badge className={cn(getSignalColor(metrics.signal))}>
              {metrics.signal.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Volume Imbalance Bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="text-success">Buy Volume: {metrics.buyVolume.toFixed(2)}</span>
            <span className="text-destructive">Sell Volume: {metrics.sellVolume.toFixed(2)}</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-success transition-all duration-300"
              style={{ width: `${metrics.imbalanceRatio * 100}%` }}
            />
            <div 
              className="bg-destructive transition-all duration-300"
              style={{ width: `${(1 - metrics.imbalanceRatio) * 100}%` }}
            />
          </div>
          <div className="text-center text-xs mt-1 text-muted-foreground">
            {(metrics.imbalanceRatio * 100).toFixed(1)}% Buy Dominance
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Net Delta</div>
            <div className={cn(
              'font-mono font-semibold',
              metrics.netDelta > 0 ? 'text-success' : metrics.netDelta < 0 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {metrics.netDelta > 0 ? '+' : ''}{metrics.netDelta.toFixed(2)}
            </div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Strength</div>
            <div className="font-semibold flex items-center justify-center gap-1">
              {getMomentumIcon()}
              {metrics.strength.toFixed(0)}%
            </div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <div className="text-xs text-muted-foreground">Trade Intensity</div>
            <div className="font-mono font-semibold flex items-center justify-center gap-1">
              <Zap className="h-3 w-3 text-chart-4" />
              {metrics.tradeIntensity.toFixed(1)}/s
            </div>
          </div>
        </div>

        {/* VWAP Info */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">VWAP (Buy)</div>
            <div className="font-mono text-success">${metrics.vwapBuy.toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">VWAP (All)</div>
            <div className="font-mono">${metrics.vwap.toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">VWAP (Sell)</div>
            <div className="font-mono text-destructive">${metrics.vwapSell.toFixed(2)}</div>
          </div>
        </div>

        {/* Aggression Ratios */}
        <div className="flex justify-between text-xs">
          <div className="flex items-center gap-2">
            <Volume2 className="h-3 w-3" />
            <span className="text-muted-foreground">Aggressive Buys:</span>
            <span className="text-success font-mono">{(metrics.aggressiveBuyRatio * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Aggressive Sells:</span>
            <span className="text-destructive font-mono">{(metrics.aggressiveSellRatio * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Large Trades */}
        <div className="flex justify-between text-xs border-t pt-2">
          <span className="text-muted-foreground">Large Trades Detected:</span>
          <Badge variant="outline">{metrics.largeTradeCount}</Badge>
        </div>

        {/* Divergence Alert */}
        {divergence && (
          <div className={cn(
            'p-2 rounded border text-xs',
            divergence.type === 'bullish' 
              ? 'bg-success/10 border-success/30 text-success' 
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          )}>
            <div className="flex items-center gap-2">
              {divergence.type === 'bullish' ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span className="font-semibold">
                {divergence.type.toUpperCase()} DIVERGENCE DETECTED
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Price and volume delta moving in opposite directions - potential reversal signal
            </p>
          </div>
        )}

        {/* Trade Count */}
        <div className="text-xs text-muted-foreground text-center">
          Analyzing {tradeCount} trades
        </div>
      </CardContent>
    </Card>
  );
}
