import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingDown, TrendingUp, Shield, BarChart3, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useBooks } from '@/hooks/useBooks';
import { cn } from '@/lib/utils';

// Type definitions for risk data
interface VaRData {
  var_95: number;
  var_99: number;
  var_999: number;
  expected_shortfall_95: number;
  expected_shortfall_99: number;
  method: string;
}

interface StressTestScenario {
  scenario_name: string;
  portfolio_return: number;
  max_drawdown: number;
  var_breached: boolean;
  liquidity_impact: number;
  recovery_time_days: number;
  risk_metrics: { volatility: number; sharpe_ratio: number; sortino_ratio: number };
}

interface RiskAttribution {
  total_risk: number;
  systematic_risk: number;
  idiosyncratic_risk: number;
  asset_contributions: Record<string, number>;
  factor_contributions: Record<string, number>;
}

interface CounterpartyExposure {
  exposure: number;
  concentration_pct: number;
  risk_score: number;
}

// These functions return placeholder data when backend is not available
// In production with Python backend, these call the real risk engine API
const fetchVaR = async (bookId: string): Promise<VaRData | null> => {
  try {
    // TODO: Replace with actual API call when backend is deployed
    // const response = await fetch(`${API_URL}/api/v1/risk/var/${bookId}`);
    // return response.json();
    return null; // Return null to indicate no data available
  } catch (error) {
    console.error('Failed to fetch VaR data:', error);
    return null;
  }
};

const fetchStressTests = async (bookId: string): Promise<StressTestScenario[] | null> => {
  try {
    // TODO: Replace with actual API call when backend is deployed
    // const response = await fetch(`${API_URL}/api/v1/risk/stress-tests/${bookId}`);
    // return response.json();
    return null;
  } catch (error) {
    console.error('Failed to fetch stress tests:', error);
    return null;
  }
};

const fetchRiskAttribution = async (bookId: string): Promise<RiskAttribution | null> => {
  try {
    // TODO: Replace with actual API call when backend is deployed
    // const response = await fetch(`${API_URL}/api/v1/risk/attribution/${bookId}`);
    // return response.json();
    return null;
  } catch (error) {
    console.error('Failed to fetch risk attribution:', error);
    return null;
  }
};

const fetchLiquidityVaR = async (bookId: string): Promise<number> => {
  return new Promise(resolve => setTimeout(() => resolve(0.028), 400));
};

const fetchCounterpartyRisk = async (bookId: string): Promise<Record<string, CounterpartyExposure>> => {
  return new Promise(resolve => setTimeout(() => resolve({
    binance: { exposure: 2500000, concentration_pct: 35.2, risk_score: 0.08 },
    coinbase: { exposure: 1800000, concentration_pct: 25.4, risk_score: 0.12 },
    kraken: { exposure: 1200000, concentration_pct: 16.9, risk_score: 0.18 },
    'other_venues': { exposure: 1600000, concentration_pct: 22.5, risk_score: 0.25 }
  }), 700));
};

export default function AdvancedRiskDashboard() {
  const { data: books = [] } = useBooks();
  const [selectedBookId, setSelectedBookId] = useState<string>('');

  // Set default book on load
  useEffect(() => {
    if (books.length > 0 && !selectedBookId) {
      setSelectedBookId(books[0].id);
    }
  }, [books, selectedBookId]);

  // Fetch risk metrics
  const { data: varData, isLoading: varLoading, refetch: refetchVaR } = useQuery({
    queryKey: ['var', selectedBookId],
    queryFn: () => fetchVaR(selectedBookId),
    enabled: !!selectedBookId
  });

  const { data: stressData, isLoading: stressLoading, refetch: refetchStress } = useQuery({
    queryKey: ['stress-test', selectedBookId],
    queryFn: () => fetchStressTests(selectedBookId),
    enabled: !!selectedBookId
  });

  const { data: attributionData, isLoading: attributionLoading, refetch: refetchAttribution } = useQuery({
    queryKey: ['risk-attribution', selectedBookId],
    queryFn: () => fetchRiskAttribution(selectedBookId),
    enabled: !!selectedBookId
  });

  const { data: liquidityVaR, isLoading: liquidityLoading, refetch: refetchLiquidity } = useQuery({
    queryKey: ['liquidity-var', selectedBookId],
    queryFn: () => fetchLiquidityVaR(selectedBookId),
    enabled: !!selectedBookId
  });

  const { data: counterpartyData, isLoading: counterpartyLoading, refetch: refetchCounterparty } = useQuery({
    queryKey: ['counterparty-risk', selectedBookId],
    queryFn: () => fetchCounterpartyRisk(selectedBookId),
    enabled: !!selectedBookId
  });

  const refreshAll = () => {
    refetchVaR();
    refetchStress();
    refetchAttribution();
    refetchLiquidity();
    refetchCounterparty();
  };

  const getRiskColor = (value: number, thresholds: { warning: number, critical: number }) => {
    if (value >= thresholds.critical) return 'text-destructive';
    if (value >= thresholds.warning) return 'text-warning';
    return 'text-success';
  };

  const getRiskBadgeVariant = (breached: boolean) => breached ? 'destructive' as const : 'success' as const;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              Advanced Risk Management
            </h1>
            <p className="text-muted-foreground">Hedge fund grade risk analytics and portfolio optimization</p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedBookId} onValueChange={setSelectedBookId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select trading book" />
              </SelectTrigger>
              <SelectContent>
                {books.map(book => (
                  <SelectItem key={book.id} value={book.id}>{book.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={refreshAll} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {!selectedBookId ? (
          <Card>
            <CardContent className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Select a trading book to view risk analytics</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="var">VaR Analysis</TabsTrigger>
              <TabsTrigger value="stress">Stress Testing</TabsTrigger>
              <TabsTrigger value="attribution">Risk Attribution</TabsTrigger>
              <TabsTrigger value="liquidity">Liquidity Risk</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Key Risk Metrics Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">VaR (95%)</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {varLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="text-2xl font-bold text-destructive">
                        -{varData ? (varData.var_95 * 100).toFixed(1) : '0.0'}%
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">1-day loss at 95% confidence</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Liquidity VaR</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {liquidityLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="text-2xl font-bold text-warning">
                        -{liquidityVaR ? (liquidityVaR * 100).toFixed(1) : '0.0'}%
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Including liquidity costs</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Stress Test Alerts</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {stressLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="text-2xl font-bold text-destructive">
                        {stressData ? stressData.filter((s) => s.var_breached).length : 0}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Scenarios breaching VaR limits</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Risk Concentration</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    {attributionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="text-2xl font-bold text-warning">
                        {attributionData ? Math.round((attributionData.systematic_risk / attributionData.total_risk) * 100) : 0}%
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Systematic risk exposure</p>
                  </CardContent>
                </Card>
              </div>

              {/* Counterparty Risk Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Counterparty Risk Exposure</CardTitle>
                  <CardDescription>Concentration risk across trading venues</CardDescription>
                </CardHeader>
                <CardContent>
                  {counterpartyLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {counterpartyData && Object.entries(counterpartyData).map(([venue, data]) => (
                        <div key={venue} className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium capitalize">{venue.replace('_', ' ')}</span>
                              <span className="text-sm text-muted-foreground">
                                ${(data.exposure / 1000000).toFixed(1)}M ({data.concentration_pct.toFixed(1)}%)
                              </span>
                            </div>
                            <Progress
                              value={data.concentration_pct}
                              className={cn(
                                'h-2',
                                data.concentration_pct > 30 ? '[&>div]:bg-destructive' :
                                data.concentration_pct > 20 ? '[&>div]:bg-warning' : '[&>div]:bg-success'
                              )}
                            />
                          </div>
                          <Badge
                            variant={data.risk_score > 0.2 ? 'destructive' : data.risk_score > 0.15 ? 'warning' : 'success'}
                            className="ml-4"
                          >
                            <span>Risk: {(data.risk_score * 100).toFixed(0)}%</span>
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="var" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Value at Risk Analysis</CardTitle>
                  <CardDescription>Portfolio risk assessment using multiple methodologies</CardDescription>
                </CardHeader>
                <CardContent>
                  {varLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : varData ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-4">
                        <h4 className="font-semibold">Confidence Levels</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span>95% VaR</span>
                            <span className="font-mono font-bold text-destructive">
                              -{(varData.var_95 * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>99% VaR</span>
                            <span className="font-mono font-bold text-destructive">
                              -{(varData.var_99 * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>99.9% VaR</span>
                            <span className="font-mono font-bold text-destructive">
                              -{(varData.var_999 * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-semibold">Expected Shortfall</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span>ES at 95%</span>
                            <span className="font-mono font-bold text-destructive">
                              -{(varData.expected_shortfall_95 * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>ES at 99%</span>
                            <span className="font-mono font-bold text-destructive">
                              -{(varData.expected_shortfall_99 * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-semibold">Methodology</h4>
                        <div className="space-y-2">
                          <Badge variant="outline">
                            <span className="capitalize">{varData.method} Simulation</span>
                          </Badge>
                          <p className="text-sm text-muted-foreground">
                            Based on 252 trading days of historical data
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      No VaR data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stress" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Stress Test Scenarios</CardTitle>
                  <CardDescription>Hypothetical market shock analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  {stressLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : stressData ? (
                    <div className="space-y-4">
                      {stressData.map((scenario: StressTestScenario) => (
                        <div key={scenario.scenario_name} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold capitalize">
                              {scenario.scenario_name.replace('_', ' ')}
                            </h4>
                            <Badge variant={getRiskBadgeVariant(scenario.var_breached)}>
                              <span>{scenario.var_breached ? 'VaR Breached' : 'Within Limits'}</span>
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Portfolio Return</span>
                              <div className={cn(
                                'font-mono font-bold',
                                scenario.portfolio_return >= 0 ? 'text-success' : 'text-destructive'
                              )}>
                                {(scenario.portfolio_return * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Max Drawdown</span>
                              <div className="font-mono font-bold text-destructive">
                                {(scenario.max_drawdown * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Liquidity Impact</span>
                              <div className="font-mono font-bold text-warning">
                                {(scenario.liquidity_impact * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Recovery Time</span>
                              <div className="font-mono font-bold">
                                {scenario.recovery_time_days} days
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t">
                            <div className="flex justify-between text-sm">
                              <span>Post-stress Sharpe Ratio: {scenario.risk_metrics.sharpe_ratio.toFixed(2)}</span>
                              <span>Volatility: {(scenario.risk_metrics.volatility * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      No stress test data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attribution" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Risk Attribution</CardTitle>
                    <CardDescription>Breakdown of portfolio risk sources</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {attributionLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : attributionData ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>Total Portfolio Risk</span>
                            <span className="font-mono font-bold">
                              {(attributionData.total_risk * 100).toFixed(2)}%
                            </span>
                          </div>
                          <Progress value={(attributionData.systematic_risk / attributionData.total_risk) * 100} />
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Systematic: {(attributionData.systematic_risk * 100).toFixed(2)}%</span>
                            <span>Idiosyncratic: {(attributionData.idiosyncratic_risk * 100).toFixed(2)}%</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h5 className="font-medium">Asset Contributions</h5>
                          {Object.entries(attributionData.asset_contributions).map(([asset, contrib]) => (
                            <div key={asset} className="flex justify-between text-sm">
                              <span>{asset}</span>
                              <span className="font-mono">{(contrib * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground">
                        No attribution data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Factor Contributions</CardTitle>
                    <CardDescription>Risk exposure by market factors</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {attributionLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : attributionData ? (
                      <div className="space-y-3">
                        {Object.entries(attributionData.factor_contributions).map(([factor, contrib]) => (
                          <div key={factor} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{factor.replace('_', ' ')}</span>
                              <span className="font-mono">{(contrib * 100).toFixed(1)}%</span>
                            </div>
                            <Progress value={contrib * 100} className="h-2" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground">
                        No factor data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="liquidity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Liquidity Risk Analysis</CardTitle>
                  <CardDescription>Market impact and liquidation risk assessment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-semibold">Liquidity-Adjusted VaR</h4>
                      {liquidityLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <div className="text-3xl font-mono font-bold text-warning">
                          -{liquidityVaR ? (liquidityVaR * 100).toFixed(2) : '0.00'}%
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Includes estimated market impact costs for position liquidation
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold">Liquidity Metrics</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Time Horizon</span>
                          <span className="font-mono">1 day</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Avg Spread Cost</span>
                          <span className="font-mono">2.5 bps</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Market Depth</span>
                          <span className="font-mono">High</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}
