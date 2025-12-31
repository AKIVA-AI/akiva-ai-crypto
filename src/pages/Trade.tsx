import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { UnifiedSpotTrader } from '@/components/trading/UnifiedSpotTrader';
import { PositionProtectionPanel } from '@/components/trading/PositionProtectionPanel';
import { OrderFlowPanel } from '@/components/trading/OrderFlowPanel';
import { RiskSimulator } from '@/components/risk/RiskSimulator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  ArrowRightLeft, 
  Zap, 
  Clock,
  ExternalLink,
  AlertCircle,
  Shield,
  Activity,
} from 'lucide-react';
import { useArbitrageMonitor } from '@/hooks/useCrossExchangeArbitrage';
import { Link } from 'react-router-dom';
import { VENUES } from '@/lib/tradingModes';

export default function Trade() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const { opportunities, isScanning } = useArbitrageMonitor(true);

  // Filter top arbitrage opportunities
  const topOpportunities = opportunities
    .filter((opp: any) => opp.spreadPercent > 0.1)
    .slice(0, 3);

  return (
    <MainLayout>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Trade</h1>
            <p className="text-muted-foreground">
              Execute trades across connected exchanges with best price routing
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/arbitrage" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Arbitrage Dashboard
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Trading Panel */}
          <div className="xl:col-span-2 space-y-4">
            <UnifiedSpotTrader />
            <OrderFlowPanel symbol={selectedSymbol} />
          </div>

          {/* Risk & Protection Panel */}
          <div className="space-y-4">
            <PositionProtectionPanel />
            <RiskSimulator />
          </div>

          {/* Right Sidebar - Quick Actions & Opportunities */}
          <div className="space-y-4">
            {/* Quick Trade Symbols */}
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Quick Trade
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'AVAX'].map((symbol) => (
                    <Button
                      key={symbol}
                      variant={selectedSymbol === symbol ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedSymbol(symbol)}
                      className="text-xs"
                    >
                      {symbol}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Live Arbitrage Opportunities */}
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-success" />
                    Arbitrage Opportunities
                  </span>
                  {isScanning && (
                    <Badge variant="outline" className="text-[10px] animate-pulse">
                      Scanning
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topOpportunities.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p>No arbitrage opportunities detected</p>
                    <p className="text-xs mt-1">Spreads below 0.1% threshold</p>
                  </div>
                ) : (
                  topOpportunities.map((opp: any) => (
                    <div 
                      key={opp.id}
                      className="p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{opp.symbol}</span>
                        <Badge 
                          variant={opp.spreadPercent > 0.5 ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          +{opp.spreadPercent.toFixed(2)}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {VENUES[opp.buyExchange]?.icon}
                          <TrendingUp className="h-3 w-3 text-success" />
                        </span>
                        <span>→</span>
                        <span className="flex items-center gap-1">
                          {VENUES[opp.sellExchange]?.icon}
                          <TrendingUp className="h-3 w-3 text-destructive rotate-180" />
                        </span>
                        <span className="ml-auto font-mono text-success">
                          ~${opp.estimatedProfit?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                
                {topOpportunities.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" asChild>
                    <Link to="/arbitrage">
                      View All Opportunities
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Exchange Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(VENUES).map(([key, venue]) => (
                  <div 
                    key={key}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">{venue.icon}</span>
                      <span>{venue.name}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      <span className="text-xs text-muted-foreground">Online</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
