import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Database, 
  Server, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Zap,
  Globe,
  Bot,
  Key,
  Clock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

interface DataSource {
  id: string;
  name: string;
  type: 'price_feed' | 'signal' | 'exchange' | 'backend' | 'edge_function';
  status: 'online' | 'offline' | 'degraded' | 'not_configured';
  description: string;
  lastCheck?: string;
  latencyMs?: number;
  requiresKey?: string;
  region?: string;
}

export default function Operations() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check edge function health
  const { data: edgeFunctionStatus, refetch: refetchEdge } = useQuery({
    queryKey: ['edge-function-health'],
    queryFn: async () => {
      const functions = [
        'trading-api',
        'trading-copilot',
        'market-intelligence',
        'whale-alerts',
        'external-signals',
      ];
      
      const results: Record<string, { status: string; latencyMs: number }> = {};
      
      for (const fn of functions) {
        const start = Date.now();
        try {
          const { error } = await supabase.functions.invoke(fn, {
            body: { action: 'health_check' }
          });
          results[fn] = {
            status: error ? 'error' : 'healthy',
            latencyMs: Date.now() - start
          };
        } catch {
          results[fn] = { status: 'error', latencyMs: Date.now() - start };
        }
      }
      
      return results;
    },
    refetchInterval: 60000, // Check every minute
  });

  // Check venues health
  const { data: venues } = useQuery({
    queryKey: ['venues-health'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('is_enabled', true);
      return data || [];
    },
  });

  // Check global settings
  const { data: settings } = useQuery({
    queryKey: ['global-settings-ops'],
    queryFn: async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .single();
      return data;
    },
  });

  // Check agents status
  const { data: agents } = useQuery({
    queryKey: ['agents-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agents')
        .select('*');
      return data || [];
    },
  });

  const dataSources: DataSource[] = [
    // Price Feeds
    {
      id: 'binance-ws',
      name: 'Binance WebSocket',
      type: 'price_feed',
      status: 'online',
      description: 'Real-time spot prices via WebSocket',
      latencyMs: 50,
    },
    {
      id: 'binance-rest',
      name: 'Binance REST API',
      type: 'price_feed',
      status: 'online',
      description: 'Order book depth, historical data',
      latencyMs: 120,
    },
    // Signal Sources
    {
      id: 'lunarcrush',
      name: 'LunarCrush',
      type: 'signal',
      status: 'not_configured',
      description: 'Social sentiment & meme coin metrics',
      requiresKey: 'LUNARCRUSH_API_KEY',
    },
    {
      id: 'tradingview',
      name: 'TradingView Webhook',
      type: 'signal',
      status: 'not_configured',
      description: 'External alerts from TradingView',
      requiresKey: 'TRADINGVIEW_WEBHOOK_SECRET',
    },
    {
      id: 'cryptocompare',
      name: 'CryptoCompare',
      type: 'signal',
      status: 'not_configured',
      description: 'News feed & social data',
      requiresKey: 'CRYPTOCOMPARE_API_KEY',
    },
    // Exchanges
    {
      id: 'coinbase',
      name: 'Coinbase',
      type: 'exchange',
      status: 'not_configured',
      description: 'Spot trading (US compliant)',
      requiresKey: 'COINBASE_API_KEY',
      region: 'US',
    },
    {
      id: 'kraken',
      name: 'Kraken',
      type: 'exchange',
      status: 'not_configured',
      description: 'Spot trading (US compliant)',
      requiresKey: 'KRAKEN_API_KEY',
      region: 'US',
    },
    {
      id: 'hyperliquid',
      name: 'HyperLiquid',
      type: 'exchange',
      status: 'not_configured',
      description: 'Perpetuals (Non-US only)',
      requiresKey: 'HYPERLIQUID_PRIVATE_KEY',
      region: 'Non-US',
    },
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchEdge();
    setIsRefreshing(false);
    toast.success('Status refreshed');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'healthy':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'offline':
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'not_configured':
        return <Key className="h-4 w-4 text-muted-foreground" />;
      default:
        return <WifiOff className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
      case 'healthy':
        return <Badge variant="default" className="bg-success/20 text-success border-success/30">Online</Badge>;
      case 'degraded':
        return <Badge variant="warning">Degraded</Badge>;
      case 'offline':
      case 'error':
        return <Badge variant="destructive">Offline</Badge>;
      case 'not_configured':
        return <Badge variant="secondary">Not Configured</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const pythonAgentRunning = agents?.some(a => a.status === 'running') || false;
  const totalEdgeFunctions = Object.keys(edgeFunctionStatus || {}).length;
  const healthyEdgeFunctions = Object.values(edgeFunctionStatus || {}).filter(e => e.status === 'healthy').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Operations Center
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor data sources, integrations, and system health
            </p>
          </div>
          <div className="flex items-center gap-2">
            {settings?.paper_trading_mode && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning/10 border border-warning/20">
                <AlertTriangle className="h-3 w-3 text-warning" />
                <span className="text-xs font-medium text-warning">Paper Mode</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Edge Functions</p>
                  <p className="text-xl font-mono font-bold">{healthyEdgeFunctions}/{totalEdgeFunctions}</p>
                </div>
                <Zap className="h-8 w-8 text-primary/30" />
              </div>
              <Progress value={(healthyEdgeFunctions / Math.max(totalEdgeFunctions, 1)) * 100} className="mt-2" size="sm" />
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Trading Venues</p>
                  <p className="text-xl font-mono font-bold">{venues?.filter(v => v.status === 'healthy').length || 0}/{venues?.length || 0}</p>
                </div>
                <Globe className="h-8 w-8 text-primary/30" />
              </div>
              <Progress value={((venues?.filter(v => v.status === 'healthy').length || 0) / Math.max(venues?.length || 1, 1)) * 100} className="mt-2" size="sm" />
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Python Backend</p>
                  <p className="text-xl font-mono font-bold">{pythonAgentRunning ? 'Running' : 'Offline'}</p>
                </div>
                <Server className={`h-8 w-8 ${pythonAgentRunning ? 'text-success/50' : 'text-muted-foreground/30'}`} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Requires separate deployment</p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Agents</p>
                  <p className="text-xl font-mono font-bold">{agents?.filter(a => a.status === 'running').length || 0}/{agents?.length || 0}</p>
                </div>
                <Bot className="h-8 w-8 text-primary/30" />
              </div>
              <Progress value={((agents?.filter(a => a.status === 'running').length || 0) / Math.max(agents?.length || 1, 1)) * 100} className="mt-2" size="sm" />
            </CardContent>
          </Card>
        </div>

        {/* Data Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Feeds */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Price Feeds
              </CardTitle>
              <CardDescription className="text-xs">Real-time market data sources</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataSources.filter(d => d.type === 'price_feed').map(source => (
                <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(source.status)}
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">{source.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.latencyMs && (
                      <span className="text-xs text-muted-foreground font-mono">{source.latencyMs}ms</span>
                    )}
                    {getStatusBadge(source.status)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Signal Sources */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Signal Sources
              </CardTitle>
              <CardDescription className="text-xs">Intelligence & sentiment feeds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataSources.filter(d => d.type === 'signal').map(source => (
                <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(source.status)}
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">{source.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.requiresKey && source.status === 'not_configured' && (
                      <span className="text-xs text-muted-foreground font-mono">{source.requiresKey}</span>
                    )}
                    {getStatusBadge(source.status)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Trading Exchanges */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                Trading Exchanges
              </CardTitle>
              <CardDescription className="text-xs">Order execution venues</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataSources.filter(d => d.type === 'exchange').map(source => (
                <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(source.status)}
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">{source.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.region && (
                      <Badge variant="outline" className="text-xs">{source.region}</Badge>
                    )}
                    {getStatusBadge(source.status)}
                  </div>
                </div>
              ))}
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-warning">US Compliance Note</p>
                    <p className="text-xs text-muted-foreground">
                      HyperLiquid is only available outside the US. Use Coinbase/Kraken for US users.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edge Functions */}
          <Card className="glass-panel">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Edge Functions
              </CardTitle>
              <CardDescription className="text-xs">Serverless backend services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(edgeFunctionStatus || {}).map(([name, status]) => (
                <div key={name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(status.status)}
                    <div>
                      <p className="text-sm font-medium font-mono">{name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{status.latencyMs}ms</span>
                    {getStatusBadge(status.status)}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                <a href="https://supabase.com/dashboard/project/amvakxshlojoshdfcqos/functions" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  View in Supabase Dashboard
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Python Backend Info */}
        <Card className="glass-panel border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              Python Backend (Agents)
            </CardTitle>
            <CardDescription className="text-xs">
              Strategy execution, risk engine, and ML models
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <h4 className="text-sm font-medium mb-2">Deployment Required</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  The Python backend must be deployed separately via Docker/Northflank. 
                  Agents will NOT auto-start in Lovable.
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline">Docker</Badge>
                  <Badge variant="outline">Northflank</Badge>
                  <Badge variant="outline">Railway</Badge>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <h4 className="text-sm font-medium mb-2">Agent Types</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Signal Agent - Monitors market signals
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Risk Agent - Enforces risk limits
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Execution Agent - Routes & executes orders
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
