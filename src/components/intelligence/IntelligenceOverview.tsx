import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useIntelligenceSignals, useSocialSentiment, useDerivativesMetrics } from '@/hooks/useMarketIntelligence';
import { cn } from '@/lib/utils';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Zap,
  MessageCircle,
  BarChart3,
} from 'lucide-react';

interface IntelligenceOverviewProps {
  instruments?: string[];
}

export function IntelligenceOverview({ 
  instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'] 
}: IntelligenceOverviewProps) {
  const { data: signals, isLoading: signalsLoading } = useIntelligenceSignals(instruments);
  const { data: sentiment, isLoading: sentimentLoading } = useSocialSentiment(instruments);
  const { data: derivatives, isLoading: derivativesLoading } = useDerivativesMetrics(instruments);

  const isLoading = signalsLoading || sentimentLoading || derivativesLoading;

  // Calculate aggregated metrics
  const getInstrumentData = (instrument: string) => {
    const latestSignal = signals?.find(s => s.instrument === instrument);
    const instrumentSentiment = sentiment?.filter(s => s.instrument === instrument) || [];
    const instrumentDerivatives = derivatives?.filter(d => d.instrument === instrument) || [];

    const avgSentiment = instrumentSentiment.length > 0
      ? instrumentSentiment.reduce((sum, s) => sum + Number(s.sentiment_score || 0), 0) / instrumentSentiment.length
      : 0;

    const avgFunding = instrumentDerivatives.length > 0
      ? instrumentDerivatives.reduce((sum, d) => sum + Number(d.funding_rate || 0), 0) / instrumentDerivatives.length
      : 0;

    const totalMentions = instrumentSentiment.reduce((sum, s) => sum + (s.mention_count || 0), 0);

    return {
      signal: latestSignal,
      avgSentiment,
      avgFunding,
      totalMentions,
    };
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-trading-long" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-trading-short" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'bullish':
        return 'text-trading-long';
      case 'bearish':
        return 'text-trading-short';
      default:
        return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            Intelligence Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="h-5 w-5 text-primary" />
          Intelligence Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {instruments.map((instrument) => {
            const data = getInstrumentData(instrument);
            const direction = data.signal?.direction || 'neutral';
            const confidence = Number(data.signal?.confidence || 0);
            const strength = Number(data.signal?.strength || 0);

            return (
              <div
                key={instrument}
                className="p-3 rounded-lg bg-card/50 border border-border/30 hover:bg-card/80 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getDirectionIcon(direction)}
                    <span className="font-semibold">{instrument}</span>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs",
                        direction === 'bullish' && 'border-trading-long/50 text-trading-long',
                        direction === 'bearish' && 'border-trading-short/50 text-trading-short'
                      )}
                    >
                      {direction.charAt(0).toUpperCase() + direction.slice(1)}
                    </Badge>
                  </div>
                  <div className={cn("text-sm font-bold", getDirectionColor(direction))}>
                    {confidence > 0 ? `${(confidence * 100).toFixed(0)}%` : '—'}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-primary" />
                    <div>
                      <div className="text-muted-foreground">Strength</div>
                      <div className="font-mono">{(strength * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 text-blue-500" />
                    <div>
                      <div className="text-muted-foreground">Sentiment</div>
                      <div className={cn(
                        "font-mono",
                        data.avgSentiment > 0 ? 'text-trading-long' : data.avgSentiment < 0 ? 'text-trading-short' : ''
                      )}>
                        {data.avgSentiment > 0 ? '+' : ''}{(data.avgSentiment * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-orange-500" />
                    <div>
                      <div className="text-muted-foreground">Funding</div>
                      <div className={cn(
                        "font-mono",
                        data.avgFunding > 0 ? 'text-trading-short' : data.avgFunding < 0 ? 'text-trading-long' : ''
                      )}>
                        {(data.avgFunding * 100).toFixed(4)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 text-purple-500" />
                    <div>
                      <div className="text-muted-foreground">Mentions</div>
                      <div className="font-mono">{(data.totalMentions / 1000).toFixed(0)}K</div>
                    </div>
                  </div>
                </div>

                {data.signal && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Signal Strength</span>
                      <Progress 
                        value={strength * 100} 
                        className={cn(
                          "h-1.5 flex-1",
                          direction === 'bullish' && '[&>div]:bg-trading-long',
                          direction === 'bearish' && '[&>div]:bg-trading-short'
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
