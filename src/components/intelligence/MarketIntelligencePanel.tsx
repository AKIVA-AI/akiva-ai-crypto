import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  useMarketNews, 
  useSocialSentiment, 
  useDerivativesMetrics, 
  useIntelligenceSignals,
  useRefreshIntelligence 
} from '@/hooks/useMarketIntelligence';
import { cn } from '@/lib/utils';
import { 
  Newspaper, 
  MessageCircle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  BarChart3, 
  Brain, 
  RefreshCw, 
  Zap,
  Twitter,
  AlertTriangle,
  Sparkles,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface MarketIntelligencePanelProps {
  instruments?: string[];
  compact?: boolean;
}

export function MarketIntelligencePanel({ 
  instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'],
  compact = false 
}: MarketIntelligencePanelProps) {
  const [activeTab, setActiveTab] = useState('signals');
  
  const { data: news, isLoading: newsLoading } = useMarketNews(instruments);
  const { data: sentiment, isLoading: sentimentLoading } = useSocialSentiment(instruments);
  const { data: derivatives, isLoading: derivativesLoading } = useDerivativesMetrics(instruments);
  const { data: signals, isLoading: signalsLoading } = useIntelligenceSignals(instruments);
  
  const refreshMutation = useRefreshIntelligence();

  const handleRefresh = async (action: 'fetch_news' | 'fetch_sentiment' | 'fetch_derivatives' | 'analyze_signals') => {
    try {
      await refreshMutation.mutateAsync(action);
      toast.success(`${action.replace('_', ' ')} completed`);
    } catch (error) {
      toast.error('Failed to refresh intelligence data');
    }
  };

  const getSentimentIcon = (score: number) => {
    if (score > 0.2) return <TrendingUp className="h-4 w-4 text-trading-long" />;
    if (score < -0.2) return <TrendingDown className="h-4 w-4 text-trading-short" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getDirectionBadge = (direction: string) => {
    const variants: Record<string, string> = {
      bullish: 'bg-trading-long/20 text-trading-long border-trading-long/30',
      bearish: 'bg-trading-short/20 text-trading-short border-trading-short/30',
      neutral: 'bg-muted text-muted-foreground border-muted',
    };
    return variants[direction] || variants.neutral;
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            Market Intelligence
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRefresh('analyze_signals')}
              disabled={refreshMutation.isPending}
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Analyze
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleRefresh('fetch_news')}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", refreshMutation.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="signals" className="gap-1 text-xs">
              <Zap className="h-3 w-3" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="sentiment" className="gap-1 text-xs">
              <MessageCircle className="h-3 w-3" />
              Sentiment
            </TabsTrigger>
            <TabsTrigger value="derivatives" className="gap-1 text-xs">
              <BarChart3 className="h-3 w-3" />
              Derivatives
            </TabsTrigger>
            <TabsTrigger value="news" className="gap-1 text-xs">
              <Newspaper className="h-3 w-3" />
              News
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="mt-0">
            <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
              {signalsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : signals && signals.length > 0 ? (
                <div className="space-y-3">
                  {signals.map((signal) => (
                    <div
                      key={signal.id}
                      className="p-3 rounded-lg bg-card/50 border border-border/30 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{signal.instrument}</span>
                          <Badge variant="outline" className={getDirectionBadge(signal.direction)}>
                            {signal.direction.charAt(0).toUpperCase() + signal.direction.slice(1)}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground">Strength</span>
                          <div className="flex items-center gap-2">
                            <Progress value={Number(signal.strength) * 100} className="h-2 flex-1" />
                            <span className="text-xs font-mono">{(Number(signal.strength) * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Confidence</span>
                          <div className="flex items-center gap-2">
                            <Progress value={Number(signal.confidence) * 100} className="h-2 flex-1" />
                            <span className="text-xs font-mono">{(Number(signal.confidence) * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                      {signal.reasoning && (
                        <p className="text-xs text-muted-foreground">{signal.reasoning}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Zap className="h-8 w-8 mb-2 opacity-50" />
                  <p>No intelligence signals yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRefresh('analyze_signals')}
                    className="mt-2"
                  >
                    Generate Signals
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sentiment" className="mt-0">
            <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
              {sentimentLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : sentiment && sentiment.length > 0 ? (
                <div className="space-y-3">
                  {/* Group by instrument */}
                  {instruments.map((instrument) => {
                    const instrumentSentiment = sentiment.filter(s => s.instrument === instrument);
                    if (instrumentSentiment.length === 0) return null;

                    const avgScore = instrumentSentiment.reduce((sum, s) => sum + Number(s.sentiment_score || 0), 0) / instrumentSentiment.length;
                    const totalMentions = instrumentSentiment.reduce((sum, s) => sum + (s.mention_count || 0), 0);

                    return (
                      <div key={instrument} className="p-3 rounded-lg bg-card/50 border border-border/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{instrument}</span>
                            {getSentimentIcon(avgScore)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {totalMentions.toLocaleString()} mentions
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {instrumentSentiment.slice(0, 3).map((s) => (
                            <div key={`${s.id}-${s.platform}`} className="text-center p-2 rounded bg-muted/30">
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {s.platform === 'twitter' && <Twitter className="h-3 w-3" />}
                                {s.platform === 'reddit' && <MessageCircle className="h-3 w-3" />}
                                {s.platform === 'telegram' && <Activity className="h-3 w-3" />}
                                <span className="text-xs capitalize">{s.platform}</span>
                              </div>
                              <div className={cn(
                                "text-sm font-mono font-bold",
                                Number(s.sentiment_score) > 0 ? "text-trading-long" : Number(s.sentiment_score) < 0 ? "text-trading-short" : "text-muted-foreground"
                              )}>
                                {Number(s.sentiment_score) > 0 ? '+' : ''}{(Number(s.sentiment_score) * 100).toFixed(0)}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {Number(s.velocity) > 0 ? '↑' : Number(s.velocity) < 0 ? '↓' : '→'} {Math.abs(Number(s.velocity)).toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
                  <p>No sentiment data yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRefresh('fetch_sentiment')}
                    className="mt-2"
                  >
                    Fetch Sentiment
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="derivatives" className="mt-0">
            <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
              {derivativesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : derivatives && derivatives.length > 0 ? (
                <div className="space-y-3">
                  {instruments.map((instrument) => {
                    const instrumentDerivatives = derivatives.filter(d => d.instrument === instrument);
                    if (instrumentDerivatives.length === 0) return null;

                    const avgFunding = instrumentDerivatives.reduce((sum, d) => sum + Number(d.funding_rate || 0), 0) / instrumentDerivatives.length;
                    const totalOI = instrumentDerivatives.reduce((sum, d) => sum + Number(d.open_interest || 0), 0);
                    const avgLSRatio = instrumentDerivatives.reduce((sum, d) => sum + Number(d.long_short_ratio || 1), 0) / instrumentDerivatives.length;

                    return (
                      <div key={instrument} className="p-3 rounded-lg bg-card/50 border border-border/30">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold">{instrument}</span>
                          <Badge variant="outline" className={cn(
                            avgFunding > 0.0001 ? 'text-trading-short' : avgFunding < -0.0001 ? 'text-trading-long' : 'text-muted-foreground'
                          )}>
                            Funding: {(avgFunding * 100).toFixed(4)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Open Interest</p>
                            <p className="text-sm font-mono font-bold">
                              ${(totalOI / 1000000000).toFixed(2)}B
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Long/Short</p>
                            <p className={cn(
                              "text-sm font-mono font-bold",
                              avgLSRatio > 1.05 ? "text-trading-long" : avgLSRatio < 0.95 ? "text-trading-short" : "text-muted-foreground"
                            )}>
                              {avgLSRatio.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">24h Liqs</p>
                            <p className="text-sm font-mono">
                              ${((instrumentDerivatives[0]?.liquidations_24h_long || 0) / 1000000).toFixed(1)}M
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                  <p>No derivatives data yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRefresh('fetch_derivatives')}
                    className="mt-2"
                  >
                    Fetch Derivatives
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="news" className="mt-0">
            <ScrollArea className={compact ? "h-[300px]" : "h-[400px]"}>
              {newsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : news && news.length > 0 ? (
                <div className="space-y-3">
                  {news.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-card/50 border border-border/30 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="text-xs">
                              {item.source}
                            </Badge>
                            {Number(item.impact_score) > 0.7 && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                High Impact
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-sm">{item.title}</h4>
                          {item.summary && (
                            <p className="text-xs text-muted-foreground mt-1">{item.summary}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getSentimentIcon(Number(item.sentiment_score))}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Newspaper className="h-8 w-8 mb-2 opacity-50" />
                  <p>No news data yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRefresh('fetch_news')}
                    className="mt-2"
                  >
                    Fetch News
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
