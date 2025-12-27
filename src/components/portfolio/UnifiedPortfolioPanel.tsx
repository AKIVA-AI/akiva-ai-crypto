import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Wallet,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  ArrowRightLeft,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useUnifiedPortfolio, ExchangeBalance } from '@/hooks/useUnifiedPortfolio';
import { VENUES } from '@/lib/tradingModes';

export function UnifiedPortfolioPanel() {
  const portfolio = useUnifiedPortfolio();
  const [view, setView] = useState<'exchanges' | 'assets'>('exchanges');

  if (portfolio.isLoading) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Unified Portfolio
          </span>
          <div className="flex items-center gap-2">
            {portfolio.priceConnectionStatus === 'connected' ? (
              <Badge variant="outline" className="text-[10px] h-5 border-success text-success gap-1">
                <Wifi className="h-2.5 w-2.5" />
                Live Prices
              </Badge>
            ) : portfolio.priceConnectionStatus === 'connecting' ? (
              <Badge variant="outline" className="text-[10px] h-5 border-warning text-warning gap-1 animate-pulse">
                <Wifi className="h-2.5 w-2.5" />
                Connecting...
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 border-muted-foreground text-muted-foreground gap-1">
                <WifiOff className="h-2.5 w-2.5" />
                Offline
              </Badge>
            )}
            {portfolio.hasRealData ? (
              <Badge variant="outline" className="text-xs border-success text-success gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-warning text-warning gap-1">
                <AlertTriangle className="h-3 w-3" />
                Simulated
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Total Value */}
        <div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
          <p className="text-3xl font-bold font-mono">
            ${portfolio.totalUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {portfolio.exchanges.length} exchange{portfolio.exchanges.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* View Toggle */}
        <Tabs value={view} onValueChange={(v) => setView(v as 'exchanges' | 'assets')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="exchanges" className="gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              By Exchange
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-1">
              <PieChart className="h-3 w-3" />
              By Asset
            </TabsTrigger>
          </TabsList>

          <TabsContent value="exchanges" className="mt-4 space-y-3">
            {portfolio.exchanges.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No balances found</p>
              </div>
            ) : (
              portfolio.exchanges.map((exchange) => (
                <div 
                  key={exchange.exchange}
                  className="p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{VENUES[exchange.exchange]?.icon}</span>
                      <span className="font-medium">{exchange.name}</span>
                      {exchange.isSimulated && (
                        <Badge variant="outline" className="text-[10px] h-4">Paper</Badge>
                      )}
                    </div>
                    <span className="font-mono font-semibold">
                      ${exchange.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {/* Progress bar showing allocation */}
                  <Progress 
                    value={(exchange.totalUsd / portfolio.totalUsdValue) * 100} 
                    className="h-1.5 mb-2"
                  />
                  
                  {/* Top balances */}
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {exchange.balances.slice(0, 4).map((b) => (
                      <div key={b.asset} className="flex justify-between text-muted-foreground">
                        <span>{b.asset}</span>
                        <span className="font-mono">{b.total.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="assets" className="mt-4 space-y-2">
            {portfolio.assets.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <PieChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No assets found</p>
              </div>
            ) : (
              portfolio.assets.slice(0, 10).map((asset) => (
                <div 
                  key={asset.asset}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                      {asset.asset.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-medium">{asset.asset}</div>
                      <div className="text-xs text-muted-foreground">
                        {asset.byExchange.map(e => VENUES[e.exchange]?.icon || e.exchange).join(' ')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-medium">
                      ${asset.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {asset.totalAmount.toFixed(asset.asset === 'BTC' || asset.asset === 'ETH' ? 6 : 2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
