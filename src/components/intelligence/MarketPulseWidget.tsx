import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIntelligenceSignals, useDerivativesMetrics, useSocialSentiment } from '@/hooks/useMarketIntelligence';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  AlertTriangle,
  BarChart3,
  MessageCircle,
  Zap,
  Gauge,
} from 'lucide-react';

const DEFAULT_INSTRUMENTS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

interface MarketPulseWidgetProps {
  instruments?: string[];
  compact?: boolean;
}

export function MarketPulseWidget({ 
  instruments = DEFAULT_INSTRUMENTS,
  compact = false 
}: MarketPulseWidgetProps) {
  const { data: signals, isLoading: signalsLoading } = useIntelligenceSignals(instruments);
  const { data: derivatives, isLoading: derivativesLoading } = useDerivativesMetrics(instruments);
  const { data: sentiment, isLoading: sentimentLoading } = useSocialSentiment(instruments);

  const isLoading = signalsLoading || derivativesLoading || sentimentLoading;

  // Calculate aggregate metrics
  const avgSentiment = sentiment?.length 
    ? sentiment.reduce((sum, s) => sum + Number(s.sentiment_score || 0), 0) / sentiment.length
    : 0;

  const avgFunding = derivatives?.length
    ? derivatives.reduce((sum, d) => sum + Number(d.funding_rate || 0), 0) / derivatives.length
    : 0;

  const totalOI = derivatives?.reduce((sum, d) => sum + Number(d.open_interest || 0), 0) || 0;
  
  const avgLongShort = derivatives?.length
    ? derivatives.reduce((sum, d) => sum + Number(d.long_short_ratio || 1), 0) / derivatives.length
    : 1;

  const bullishSignals = signals?.filter(s => s.direction === 'bullish').length || 0;
  const bearishSignals = signals?.filter(s => s.direction === 'bearish').length || 0;
  const totalSignals = signals?.length || 0;

  const avgConfidence = signals?.length
    ? signals.reduce((sum, s) => sum + Number(s.confidence || 0), 0) / signals.length
    : 0;

  // Calculate fear/greed-like index (0-100)
  const fearGreedIndex = Math.round(
    50 + 
    (avgSentiment * 25) + 
    ((avgLongShort - 1) * 20) + 
    ((bullishSignals - bearishSignals) / Math.max(totalSignals, 1) * 15)
  );
  const clampedFearGreed = Math.max(0, Math.min(100, fearGreedIndex));

  const getFearGreedLabel = (value: number) => {
    if (value <= 20) return { label: 'Extreme Fear', color: 'text-destructive' };
    if (value <= 40) return { label: 'Fear', color: 'text-warning' };
    if (value <= 60) return { label: 'Neutral', color: 'text-muted-foreground' };
    if (value <= 80) return { label: 'Greed', color: 'text-success' };
    return { label: 'Extreme Greed', color: 'text-primary' };
  };

  const fearGreed = getFearGreedLabel(clampedFearGreed);

  // Volatility indicator based on funding rate magnitude
  const volatilityScore = Math.min(100, Math.abs(avgFunding) * 50000);
  const getVolatilityLabel = (score: number) => {
    if (score < 20) return { label: 'Low', color: 'text-success' };
    if (score < 50) return { label: 'Moderate', color: 'text-warning' };
    return { label: 'High', color: 'text-destructive' };
  };
  const volatility = getVolatilityLabel(volatilityScore);

  if (isLoading) {
    return (
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Market Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            Market Pulse
          </CardTitle>
          <Badge variant="outline" className="text-xs gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("grid gap-4", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
          {/* Fear & Greed */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 cursor-help">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Fear / Greed</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xl font-bold font-mono", fearGreed.color)}>
                      {clampedFearGreed}
                    </span>
                    <Badge variant="outline" className={cn("text-xs", fearGreed.color)}>
                      {fearGreed.label}
                    </Badge>
                  </div>
                  <Progress value={clampedFearGreed} className="h-1.5" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Composite index based on sentiment, positioning, and signals
            </TooltipContent>
          </Tooltip>

          {/* Volatility */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 cursor-help">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Volatility</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-xl font-bold font-mono", volatility.color)}>
                      {volatilityScore.toFixed(0)}
                    </span>
                    <Badge variant="outline" className={cn("text-xs", volatility.color)}>
                      {volatility.label}
                    </Badge>
                  </div>
                  <Progress value={volatilityScore} className="h-1.5" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Based on funding rate volatility across venues
            </TooltipContent>
          </Tooltip>

          {/* Signal Bias */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 cursor-help">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Signal Bias</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="font-bold text-success">{bullishSignals}</span>
                    </div>
                    <span className="text-muted-foreground">/</span>
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      <span className="font-bold text-destructive">{bearishSignals}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {(avgConfidence * 100).toFixed(0)}% conf
                  </Badge>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Bullish vs bearish intelligence signals with avg confidence
            </TooltipContent>
          </Tooltip>

          {/* Market Positioning */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30 cursor-help">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Positioning</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xl font-bold font-mono",
                      avgLongShort > 1.05 ? "text-success" : avgLongShort < 0.95 ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {avgLongShort.toFixed(2)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      L/S Ratio
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    OI: ${(totalOI / 1e9).toFixed(1)}B • Funding: {(avgFunding * 100).toFixed(4)}%
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Aggregate long/short ratio and open interest
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Sentiment bar */}
        <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Social Sentiment</span>
            </div>
            <span className={cn(
              "text-sm font-bold",
              avgSentiment > 0.1 ? "text-success" : avgSentiment < -0.1 ? "text-destructive" : "text-muted-foreground"
            )}>
              {avgSentiment > 0 ? '+' : ''}{(avgSentiment * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                avgSentiment > 0 ? "bg-success" : avgSentiment < 0 ? "bg-destructive" : "bg-muted-foreground"
              )}
              style={{ 
                width: `${Math.min(100, Math.abs(avgSentiment) * 100 + 50)}%`,
                marginLeft: avgSentiment < 0 ? `${50 - Math.abs(avgSentiment) * 50}%` : '50%'
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
