import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Zap, 
  Database, 
  Wifi, 
  TrendingUp,
  Shield,
  Bell,
  BarChart3,
  Fish,
  MessageCircle,
  Newspaper,
  Key,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type FeatureStatus = 'functional' | 'simulated' | 'pending';

interface Feature {
  name: string;
  description: string;
  status: FeatureStatus;
  icon: React.ReactNode;
  details?: string;
}

const features: { category: string; items: Feature[] }[] = [
  {
    category: 'Core Trading',
    items: [
      {
        name: 'Live Price Feed',
        description: 'Real-time price data from Binance WebSocket',
        status: 'functional',
        icon: <Wifi className="h-4 w-4" />,
        details: 'Connected to Binance public WebSocket API',
      },
      {
        name: 'Coinbase Integration',
        description: 'US-compliant exchange for spot trading',
        status: 'functional',
        icon: <TrendingUp className="h-4 w-4" />,
        details: 'Coinbase Advanced Trade API integrated - credentials configured',
      },
      {
        name: 'Trade Ticket',
        description: 'Order entry interface with book selection',
        status: 'functional',
        icon: <TrendingUp className="h-4 w-4" />,
        details: 'Orders saved to database, execution simulated or live via Coinbase',
      },
      {
        name: 'Order Execution',
        description: 'Actual order placement on exchanges',
        status: 'functional',
        icon: <Zap className="h-4 w-4" />,
        details: 'Coinbase Advanced Trade API ready - switch paper_trading_mode to enable live',
      },
      {
        name: 'Position Tracking',
        description: 'Track open positions and P&L',
        status: 'functional',
        icon: <BarChart3 className="h-4 w-4" />,
        details: 'Positions stored in database with real-time updates',
      },
      {
        name: 'Order Book Display',
        description: 'Live order book visualization',
        status: 'functional',
        icon: <Activity className="h-4 w-4" />,
        details: 'Real depth data from Binance public API',
      },
    ],
  },
  {
    category: 'Risk Management',
    items: [
      {
        name: 'Kill Switch',
        description: 'Emergency stop all trading',
        status: 'functional',
        icon: <Shield className="h-4 w-4" />,
        details: 'Global settings flag, enforced in edge functions',
      },
      {
        name: 'Risk Limits',
        description: 'Per-book position and loss limits',
        status: 'functional',
        icon: <AlertTriangle className="h-4 w-4" />,
        details: 'Checked before order placement in live-trading function',
      },
      {
        name: 'Risk Gauges',
        description: 'Visual risk level indicators',
        status: 'functional',
        icon: <Activity className="h-4 w-4" />,
      },
    ],
  },
  {
    category: 'Market Intelligence',
    items: [
      {
        name: 'Derivatives Data',
        description: 'Funding rates, OI, liquidations',
        status: 'functional',
        icon: <BarChart3 className="h-4 w-4" />,
        details: 'Fetched from Binance Futures public API',
      },
      {
        name: 'Whale Alerts',
        description: 'Large transaction monitoring',
        status: 'simulated',
        icon: <Fish className="h-4 w-4" />,
        details: 'AI-generated mock data - requires Arkham/Nansen API',
      },
      {
        name: 'Social Sentiment',
        description: 'Twitter/Discord sentiment analysis',
        status: 'simulated',
        icon: <MessageCircle className="h-4 w-4" />,
        details: 'AI-generated mock data - requires LunarCrush API',
      },
      {
        name: 'Market News',
        description: 'Crypto news aggregation',
        status: 'simulated',
        icon: <Newspaper className="h-4 w-4" />,
        details: 'AI-generated mock data - requires CryptoPanic API',
      },
    ],
  },
  {
    category: 'Automation',
    items: [
      {
        name: 'Auto-Trade Triggers',
        description: 'Automated trading based on conditions',
        status: 'simulated',
        icon: <Zap className="h-4 w-4" />,
        details: 'UI configured only - requires backend scheduling and exchange APIs',
      },
      {
        name: 'Exchange API Manager',
        description: 'Secure API key storage',
        status: 'pending',
        icon: <Key className="h-4 w-4" />,
        details: 'Local storage only - backend secure storage not implemented',
      },
      {
        name: 'Alert Notifications',
        description: 'Telegram/Discord notifications',
        status: 'pending',
        icon: <Bell className="h-4 w-4" />,
        details: 'Requires Telegram Bot Token configuration',
      },
    ],
  },
  {
    category: 'Infrastructure',
    items: [
      {
        name: 'Database',
        description: 'PostgreSQL with RLS policies',
        status: 'functional',
        icon: <Database className="h-4 w-4" />,
        details: 'Lovable Cloud Supabase instance',
      },
      {
        name: 'Edge Functions',
        description: 'Serverless backend logic',
        status: 'functional',
        icon: <Zap className="h-4 w-4" />,
        details: 'Deployed automatically via Lovable',
      },
      {
        name: 'Authentication',
        description: 'User auth and role-based access',
        status: 'functional',
        icon: <Shield className="h-4 w-4" />,
        details: 'Email/password with auto-confirm enabled',
      },
      {
        name: 'Audit Logging',
        description: 'Track all privileged actions',
        status: 'functional',
        icon: <Activity className="h-4 w-4" />,
        details: 'All mutations logged to audit_events table',
      },
    ],
  },
];

const getStatusBadge = (status: FeatureStatus) => {
  switch (status) {
    case 'functional':
      return (
        <Badge className="bg-success/20 text-success border-success/30 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Functional
        </Badge>
      );
    case 'simulated':
      return (
        <Badge className="bg-warning/20 text-warning border-warning/30 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Simulated
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-muted text-muted-foreground gap-1">
          <XCircle className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
};

export default function SystemStatus() {
  // Calculate stats
  const allFeatures = features.flatMap(cat => cat.items);
  const functional = allFeatures.filter(f => f.status === 'functional').length;
  const simulated = allFeatures.filter(f => f.status === 'simulated').length;
  const pending = allFeatures.filter(f => f.status === 'pending').length;
  const total = allFeatures.length;
  const readinessPercent = Math.round((functional / total) * 100);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">System Status</h1>
            <p className="text-muted-foreground mt-1">
              Feature readiness and integration status
            </p>
          </div>
          <Badge 
            variant="outline" 
            className="text-lg px-4 py-2 bg-warning/10 border-warning/30 text-warning"
          >
            <AlertTriangle className="h-5 w-5 mr-2" />
            Simulation Mode
          </Badge>
        </div>

        {/* Overall Status */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Production Readiness</CardTitle>
            <CardDescription>
              Overall system readiness for live trading
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress value={readinessPercent} className="h-3" />
              </div>
              <span className="text-2xl font-bold">{readinessPercent}%</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="text-3xl font-bold text-success">{functional}</div>
                <div className="text-sm text-muted-foreground">Functional</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-warning/10 border border-warning/20">
                <div className="text-3xl font-bold text-warning">{simulated}</div>
                <div className="text-sm text-muted-foreground">Simulated</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted border border-border">
                <div className="text-3xl font-bold text-muted-foreground">{pending}</div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Categories */}
        <div className="grid gap-6">
          {features.map((category) => (
            <Card key={category.category} className="glass-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{category.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {category.items.map((feature, idx) => (
                    <div key={feature.name}>
                      <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            feature.status === 'functional' && "bg-success/10 text-success",
                            feature.status === 'simulated' && "bg-warning/10 text-warning",
                            feature.status === 'pending' && "bg-muted text-muted-foreground"
                          )}>
                            {feature.icon}
                          </div>
                          <div>
                            <h4 className="font-medium">{feature.name}</h4>
                            <p className="text-sm text-muted-foreground">{feature.description}</p>
                            {feature.details && (
                              <p className="text-xs text-muted-foreground/70 mt-0.5">{feature.details}</p>
                            )}
                          </div>
                        </div>
                        {getStatusBadge(feature.status)}
                      </div>
                      {idx < category.items.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Required for Production */}
        <Card className="glass-panel border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Required for Production
            </CardTitle>
            <CardDescription>
              API keys and integrations needed to enable live trading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border border-success/30 bg-success/5">
                <h4 className="font-semibold mb-2 text-success flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Exchange APIs (Configured)
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="text-success">✓ Coinbase Advanced Trade (US-compliant)</li>
                  <li className="text-success">✓ Binance API (data only, non-US)</li>
                  <li>• Kraken API (optional)</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-card/50">
                <h4 className="font-semibold mb-2">Data Providers</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Arkham/Nansen (whale tracking)</li>
                  <li>• LunarCrush (social sentiment)</li>
                  <li>• CryptoPanic (news feed)</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg border border-success/30 bg-success/5">
                <h4 className="font-semibold mb-2 text-success flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Notifications (Configured)
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="text-success">✓ Telegram Bot Token</li>
                  <li>• Discord Webhook (optional)</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-card/50">
                <h4 className="font-semibold mb-2">Infrastructure</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="text-success">✓ Lovable Cloud (active)</li>
                  <li>• Custom domain (optional)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
