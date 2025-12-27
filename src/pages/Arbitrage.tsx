import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeftRight, 
  TrendingUp, 
  Zap, 
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Activity,
  DollarSign,
  Clock,
  Target,
  Play,
  Pause,
  Settings,
  XCircle,
  ShieldOff,
  Shield,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  useArbitrageMonitor, 
  useExecuteArbitrage, 
  useTestArbitrageExecution, 
  useAutoExecuteArbitrage, 
  useKillSwitch,
  useDailyPnLLimits,
  ArbitrageOpportunity, 
  AutoExecuteSettings 
} from '@/hooks/useCrossExchangeArbitrage';
import { useArbitrageHistory, useArbitrageStats, useRecordArbitrageExecution } from '@/hooks/useArbitrageHistory';
import { VENUES } from '@/lib/tradingModes';

// All supported pairs
const SUPPORTED_PAIRS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'];

export default function Arbitrage() {
  const [isScanning, setIsScanning] = useState(true);
  const [minSpreadPercent, setMinSpreadPercent] = useState([0.1]);
  const [pnlLimitInput, setPnlLimitInput] = useState(-500);
  
  // Auto-execute settings state
  const [autoExecuteSettings, setAutoExecuteSettings] = useState<AutoExecuteSettings>({
    enabled: false,
    minProfitThreshold: 25, // $25 minimum
    maxPositionSize: 0.1,   // 0.1 BTC equivalent
    cooldownMs: 60000,      // 1 minute cooldown
  });
  const [lastAutoExecute, setLastAutoExecute] = useState<number>(0);
  
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageOpportunity | null>(null);

  const { opportunities, isScanning: loading, lastScan, status, refetch } = useArbitrageMonitor(isScanning);
  const executeArbitrage = useExecuteArbitrage();
  const testExecution = useTestArbitrageExecution();
  const autoExecute = useAutoExecuteArbitrage();
  const recordExecution = useRecordArbitrageExecution();
  const killSwitch = useKillSwitch();
  const pnlLimits = useDailyPnLLimits();
  const { data: history = [], isLoading: historyLoading } = useArbitrageHistory(20);
  const { data: stats } = useArbitrageStats();

  // Auto-execute logic with cooldown
  useEffect(() => {
    if (!autoExecuteSettings.enabled || opportunities.length === 0) return;
    
    const now = Date.now();
    if (now - lastAutoExecute < autoExecuteSettings.cooldownMs) return;
    
    // Find best opportunity that meets threshold
    const qualifiedOpps = opportunities.filter(
      opp => opp.costs && opp.costs.netProfit >= autoExecuteSettings.minProfitThreshold
    );
    
    if (qualifiedOpps.length > 0) {
      const best = qualifiedOpps[0];
      setLastAutoExecute(now);
      handleExecute(best);
    }
  }, [opportunities, autoExecuteSettings]);

  const handleExecute = async (opportunity: ArbitrageOpportunity) => {
    // Execute the arbitrage
    const result = await executeArbitrage.mutateAsync(opportunity);
    
    // Record to database
    await recordExecution.mutateAsync({
      opportunity_id: opportunity.id,
      symbol: opportunity.symbol,
      buy_exchange: opportunity.buyExchange,
      sell_exchange: opportunity.sellExchange,
      buy_price: opportunity.buyPrice,
      sell_price: opportunity.sellPrice,
      quantity: opportunity.volume,
      spread_percent: opportunity.spreadPercent,
      gross_profit: opportunity.estimatedProfit,
      trading_fees: opportunity.costs?.tradingFees || 0,
      withdrawal_fee: opportunity.costs?.withdrawalFee || 0,
      slippage: opportunity.costs?.slippage || 0,
      net_profit: opportunity.costs?.netProfit || 0,
      status: result.status === 'SIMULATED' ? 'simulated' : 'completed',
      buy_order_id: result.buyOrder?.orderId,
      sell_order_id: result.sellOrder?.orderId,
      executed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: { result },
    });
  };

  // Calculate stats
  const totalOpportunities = opportunities.length;
  const profitableCount = opportunities.filter(o => o.costs && o.costs.netProfit > 0).length;
  const avgSpread = opportunities.length > 0 
    ? opportunities.reduce((sum, o) => sum + o.spreadPercent, 0) / opportunities.length 
    : 0;
  const totalPotentialProfit = opportunities.reduce((sum, o) => sum + (o.costs?.netProfit || 0), 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Kill Switch Banner */}
        {killSwitch.isActive && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ban className="h-6 w-6 text-destructive" />
                <div>
                  <p className="font-bold text-destructive">KILL SWITCH ACTIVE</p>
                  <p className="text-sm text-muted-foreground">{killSwitch.reason}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => killSwitch.deactivate.mutate()}
                disabled={killSwitch.deactivate.isPending}
                className="gap-2"
              >
                <Shield className="h-4 w-4" />
                Resume Trading
              </Button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="h-7 w-7 text-primary" />
              Cross-Exchange Arbitrage
            </h1>
            <p className="text-muted-foreground">
              Real-time opportunity scanning across Coinbase, Kraken, and Binance.US
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Kill Switch Button */}
            <Button
              variant={killSwitch.isActive ? 'outline' : 'destructive'}
              size="sm"
              onClick={() => {
                if (killSwitch.isActive) {
                  killSwitch.deactivate.mutate();
                } else {
                  killSwitch.activate.mutate('Manual emergency stop');
                }
              }}
              disabled={killSwitch.activate.isPending || killSwitch.deactivate.isPending}
              className="gap-1"
            >
              {killSwitch.isActive ? (
                <>
                  <Shield className="h-4 w-4" />
                  Resume
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4" />
                  Kill Switch
                </>
              )}
            </Button>
            
            <Badge 
              variant="outline" 
              className={cn(
                'gap-1',
                killSwitch.isActive ? 'border-destructive text-destructive' :
                isScanning ? 'border-success text-success' : 'border-muted-foreground'
              )}
            >
              {killSwitch.isActive ? (
                <>
                  <Ban className="h-3 w-3" />
                  Halted
                </>
              ) : isScanning ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Live Scanning
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Paused
                </>
              )}
            </Badge>
            <Button
              variant={isScanning ? 'outline' : 'default'}
              size="sm"
              onClick={() => setIsScanning(!isScanning)}
              disabled={killSwitch.isActive}
              className="gap-1"
            >
              {isScanning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isScanning ? 'Pause' : 'Start'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => testExecution.mutate()}
              disabled={testExecution.isPending}
              className="gap-1"
            >
              {testExecution.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              Test Flow
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Stats Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Quick Stats */}
            <Card className="glass-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Scanner Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-2xl font-bold text-primary">{totalOpportunities}</div>
                    <div className="text-xs text-muted-foreground">Found</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <div className="text-2xl font-bold text-success">{profitableCount}</div>
                    <div className="text-xs text-muted-foreground">Profitable</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Spread</span>
                    <span className="font-mono">{avgSpread.toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Potential Profit</span>
                    <span className="font-mono text-success">${totalPotentialProfit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Scan</span>
                    <span className="font-mono text-xs">
                      {lastScan ? new Date(lastScan).toLocaleTimeString() : '--'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Exchange Status */}
            <Card className="glass-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Exchange Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {status?.exchanges && Object.entries(status.exchanges).map(([exchange, info]: [string, any]) => (
                  <div key={exchange} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{VENUES[exchange]?.icon}</span>
                      <span className="text-sm">{VENUES[exchange]?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {info.apiConfigured ? (
                        <Badge variant="outline" className="text-xs border-success text-success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-warning text-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Paper
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Daily P&L Limits */}
            <Card className={cn(
              'glass-panel',
              pnlLimits.limitBreached && 'border-destructive'
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Daily P&L Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <div className={cn(
                    'text-2xl font-bold font-mono',
                    pnlLimits.dailyPnL >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {pnlLimits.dailyPnL >= 0 ? '+' : ''}${pnlLimits.dailyPnL.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">Today's P&L</div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Loss Limit</span>
                    <span className="font-mono text-destructive">${pnlLimits.dailyPnLLimit}</span>
                  </div>
                  <Progress 
                    value={Math.min(100, pnlLimits.percentUsed)} 
                    className={cn(
                      'h-2',
                      pnlLimits.percentUsed >= 80 && '[&>div]:bg-destructive'
                    )}
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {pnlLimits.percentUsed.toFixed(0)}% of limit used
                  </div>
                </div>
                
                {pnlLimits.limitBreached && (
                  <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start gap-2">
                      <Ban className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="text-xs">
                        <p className="font-medium text-destructive">Limit Breached</p>
                        <p className="text-muted-foreground">
                          Trading halted. Reset P&L or wait for new day.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <Separator />
                
                <div className="space-y-2">
                  <Label className="text-sm">Set Loss Limit</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={pnlLimitInput}
                      onChange={(e) => setPnlLimitInput(Number(e.target.value))}
                      max={0}
                      className="font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pnlLimits.setLimit.mutate(pnlLimitInput)}
                      disabled={pnlLimits.setLimit.isPending}
                    >
                      Set
                    </Button>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => pnlLimits.resetPnL.mutate()}
                  disabled={pnlLimits.resetPnL.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset Daily P&L
                </Button>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card className="glass-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Scanner Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Min Spread</Label>
                    <span className="text-sm font-mono">{minSpreadPercent[0]}%</span>
                  </div>
                  <Slider
                    value={minSpreadPercent}
                    onValueChange={setMinSpreadPercent}
                    min={0.01}
                    max={1}
                    step={0.01}
                  />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Auto-Execute</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically execute profitable trades
                    </p>
                  </div>
                  <Switch
                    checked={autoExecuteSettings.enabled}
                    disabled={killSwitch.isActive}
                    onCheckedChange={(checked) => 
                      setAutoExecuteSettings(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>
                
                {autoExecuteSettings.enabled && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Min Profit</Label>
                        <span className="text-sm font-mono">${autoExecuteSettings.minProfitThreshold}</span>
                      </div>
                      <Slider
                        value={[autoExecuteSettings.minProfitThreshold]}
                        onValueChange={([val]) => 
                          setAutoExecuteSettings(prev => ({ ...prev, minProfitThreshold: val }))
                        }
                        min={5}
                        max={100}
                        step={5}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Max Position</Label>
                        <span className="text-sm font-mono">{autoExecuteSettings.maxPositionSize} BTC</span>
                      </div>
                      <Slider
                        value={[autoExecuteSettings.maxPositionSize]}
                        onValueChange={([val]) => 
                          setAutoExecuteSettings(prev => ({ ...prev, maxPositionSize: val }))
                        }
                        min={0.01}
                        max={1}
                        step={0.01}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Cooldown</Label>
                        <span className="text-sm font-mono">{autoExecuteSettings.cooldownMs / 1000}s</span>
                      </div>
                      <Slider
                        value={[autoExecuteSettings.cooldownMs]}
                        onValueChange={([val]) => 
                          setAutoExecuteSettings(prev => ({ ...prev, cooldownMs: val }))
                        }
                        min={10000}
                        max={300000}
                        step={10000}
                      />
                    </div>
                    
                    <div className="p-2 rounded-lg bg-warning/10 border border-warning/30">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                        <div className="text-xs">
                          <p className="font-medium text-warning">Caution</p>
                          <p className="text-muted-foreground">
                            Auto-execution will place real orders when APIs are configured.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Opportunities List */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Live Opportunities
                  </span>
                  {loading && (
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {opportunities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ArrowLeftRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No profitable opportunities found</p>
                    <p className="text-sm">Scanning across exchanges...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {opportunities.map((opp) => (
                      <div
                        key={opp.id}
                        className={cn(
                          'p-4 rounded-lg border transition-all cursor-pointer',
                          selectedOpportunity?.id === opp.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                        onClick={() => setSelectedOpportunity(opp)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              {opp.symbol}
                            </Badge>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="flex items-center gap-1">
                                {VENUES[opp.buyExchange]?.icon}
                                <span className="text-muted-foreground">Buy @</span>
                                <span className="font-mono text-success">${opp.buyPrice.toFixed(2)}</span>
                              </span>
                              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                              <span className="flex items-center gap-1">
                                {VENUES[opp.sellExchange]?.icon}
                                <span className="text-muted-foreground">Sell @</span>
                                <span className="font-mono text-destructive">${opp.sellPrice.toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExecute(opp);
                            }}
                            disabled={executeArbitrage.isPending}
                          >
                            <Zap className="h-3 w-3" />
                            Execute
                          </Button>
                        </div>

                        <div className="grid grid-cols-5 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">Spread</div>
                            <div className="font-mono font-medium text-primary">
                              {opp.spreadPercent.toFixed(3)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Gross Profit</div>
                            <div className="font-mono font-medium">
                              ${opp.estimatedProfit.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Fees & Costs</div>
                            <div className="font-mono font-medium text-destructive">
                              -${opp.costs?.totalCost.toFixed(2) || '0.00'}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Net Profit</div>
                            <div className={cn(
                              'font-mono font-bold',
                              (opp.costs?.netProfit || 0) > 0 ? 'text-success' : 'text-destructive'
                            )}>
                              ${opp.costs?.netProfit.toFixed(2) || '0.00'}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Confidence</div>
                            <Progress value={opp.confidence * 100} className="h-2 mt-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Execution History */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    Execution History
                  </span>
                  {stats && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Total: <span className="font-mono text-foreground">{stats.totalExecutions}</span>
                      </span>
                      <span className="text-success">
                        P&L: <span className="font-mono">${stats.totalProfit.toFixed(2)}</span>
                      </span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <RefreshCw className="h-5 w-5 mx-auto animate-spin mb-2" />
                    Loading history...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No executions yet</p>
                    <p className="text-xs">Executed trades will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {history.map((exec) => (
                        <div 
                          key={exec.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 text-sm"
                        >
                          <div className="flex items-center gap-3">
                            {exec.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-success" />
                            ) : exec.status === 'simulated' ? (
                              <Circle className="h-4 w-4 text-warning" />
                            ) : exec.status === 'failed' ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
                            )}
                            <div>
                              <div className="font-medium">{exec.symbol}</div>
                              <div className="text-xs text-muted-foreground">
                                {VENUES[exec.buy_exchange]?.icon} → {VENUES[exec.sell_exchange]?.icon}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              'font-mono font-medium',
                              exec.net_profit >= 0 ? 'text-success' : 'text-destructive'
                            )}>
                              {exec.net_profit >= 0 ? '+' : ''}${exec.net_profit.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(exec.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
