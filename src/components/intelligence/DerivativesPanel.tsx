import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Activity,
  BarChart3,
  DollarSign,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDerivativesMetrics, useFetchDerivatives, useFundingHistory } from '@/hooks/useDerivativesData';

interface DerivativesPanelProps {
  instruments?: string[];
  compact?: boolean;
}

export function DerivativesPanel({ instruments, compact }: DerivativesPanelProps) {
  const [selectedInstrument, setSelectedInstrument] = useState(instruments?.[0] || 'BTC-USDT');
  
  const { data: metrics, isLoading } = useDerivativesMetrics(instruments);
  const { mutate: fetchDerivatives, isPending: isFetching } = useFetchDerivatives();
  const { data: fundingHistory } = useFundingHistory(selectedInstrument);

  const handleRefresh = () => {
    fetchDerivatives(instruments || ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']);
  };

  const formatFundingRate = (rate: number | null) => {
    if (rate === null) return 'N/A';
    const percentage = rate * 100;
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(4)}%`;
  };

  const formatOI = (oi: number | null) => {
    if (oi === null) return 'N/A';
    if (oi >= 1e9) return `$${(oi / 1e9).toFixed(2)}B`;
    if (oi >= 1e6) return `$${(oi / 1e6).toFixed(0)}M`;
    return `$${oi.toLocaleString()}`;
  };

  const formatLiquidations = (amount: number | null) => {
    if (amount === null) return 'N/A';
    if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
    if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const getTimeUntilFunding = (nextFundingTime: string | null) => {
    if (!nextFundingTime) return 'N/A';
    const diff = new Date(nextFundingTime).getTime() - Date.now();
    if (diff < 0) return 'Soon';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const selectedMetric = metrics?.find(m => m.instrument === selectedInstrument);

  if (compact) {
    return (
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Derivatives
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-4">Loading...</div>
          ) : (
            metrics?.slice(0, 3).map((metric) => (
              <div 
                key={metric.id} 
                className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
              >
                <span className="font-medium text-sm">{metric.instrument}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className={cn(
                    (metric.funding_rate || 0) >= 0 ? 'text-trading-long' : 'text-trading-short'
                  )}>
                    FR: {formatFundingRate(metric.funding_rate)}
                  </span>
                  <span className="text-muted-foreground">
                    OI: {formatOI(metric.open_interest)}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Derivatives Analytics
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="funding">Funding</TabsTrigger>
            <TabsTrigger value="liquidations">Liquidations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Instrument Selector */}
            <div className="flex gap-2 flex-wrap">
              {metrics?.map((metric) => (
                <Button
                  key={metric.instrument}
                  variant={selectedInstrument === metric.instrument ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedInstrument(metric.instrument)}
                >
                  {metric.instrument.replace('-USDT', '')}
                </Button>
              ))}
            </div>

            {selectedMetric && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Funding Rate */}
                <div className="p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <Activity className="h-4 w-4" />
                    Funding Rate
                  </div>
                  <div className={cn(
                    "text-xl font-bold",
                    (selectedMetric.funding_rate || 0) >= 0 ? 'text-trading-long' : 'text-trading-short'
                  )}>
                    {formatFundingRate(selectedMetric.funding_rate)}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    Next: {getTimeUntilFunding(selectedMetric.next_funding_time)}
                  </div>
                </div>

                {/* Open Interest */}
                <div className="p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    Open Interest
                  </div>
                  <div className="text-xl font-bold">
                    {formatOI(selectedMetric.open_interest)}
                  </div>
                  <div className={cn(
                    "text-xs flex items-center gap-1 mt-1",
                    (selectedMetric.oi_change_24h || 0) >= 0 ? 'text-trading-long' : 'text-trading-short'
                  )}>
                    {(selectedMetric.oi_change_24h || 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {(selectedMetric.oi_change_24h || 0) >= 0 ? '+' : ''}{selectedMetric.oi_change_24h?.toFixed(1)}% 24h
                  </div>
                </div>

                {/* Long/Short Ratio */}
                <div className="p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <BarChart3 className="h-4 w-4" />
                    Long/Short Ratio
                  </div>
                  <div className="text-xl font-bold">
                    {selectedMetric.long_short_ratio?.toFixed(2) || 'N/A'}
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div 
                      className="h-full bg-trading-long"
                      style={{ 
                        width: `${Math.min(100, ((selectedMetric.long_short_ratio || 1) / ((selectedMetric.long_short_ratio || 1) + 1)) * 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Top Trader Positioning */}
                <div className="p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <TrendingUp className="h-4 w-4" />
                    Top Traders
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-trading-long border-trading-long">
                      L: {selectedMetric.top_trader_long_ratio?.toFixed(0)}%
                    </Badge>
                    <Badge variant="outline" className="text-trading-short border-trading-short">
                      S: {selectedMetric.top_trader_short_ratio?.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="funding" className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Funding Rates Across Assets</h4>
              {metrics?.map((metric) => (
                <div 
                  key={metric.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{metric.instrument}</span>
                    <Badge variant="outline" className="text-xs">
                      {getTimeUntilFunding(metric.next_funding_time)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={cn(
                      "font-mono font-medium",
                      (metric.funding_rate || 0) >= 0 ? 'text-trading-long' : 'text-trading-short'
                    )}>
                      {formatFundingRate(metric.funding_rate)}
                    </span>
                    {Math.abs(metric.funding_rate || 0) > 0.0003 && (
                      <Badge className="bg-warning/20 text-warning">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        High
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="liquidations" className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">24h Liquidations</h4>
              {metrics?.map((metric) => {
                const totalLiq = (metric.liquidations_24h_long || 0) + (metric.liquidations_24h_short || 0);
                const longPercent = totalLiq > 0 
                  ? ((metric.liquidations_24h_long || 0) / totalLiq) * 100 
                  : 50;
                
                return (
                  <div 
                    key={metric.id}
                    className="p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{metric.instrument}</span>
                      <span className="text-sm text-muted-foreground">
                        Total: {formatLiquidations(totalLiq)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-trading-long w-20">
                        L: {formatLiquidations(metric.liquidations_24h_long)}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-trading-short overflow-hidden">
                        <div 
                          className="h-full bg-trading-long"
                          style={{ width: `${longPercent}%` }}
                        />
                      </div>
                      <span className="text-trading-short w-20 text-right">
                        S: {formatLiquidations(metric.liquidations_24h_short)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
