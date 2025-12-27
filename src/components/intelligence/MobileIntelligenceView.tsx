import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useIntelligenceSignals, useRefreshIntelligence } from '@/hooks/useMarketIntelligence';
import { useWhaleTransactions } from '@/hooks/useWhaleAlerts';
import { cn } from '@/lib/utils';
import { 
  Brain, 
  Fish, 
  Zap,
  Bell,
  BellOff,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface MobileIntelligenceViewProps {
  instruments?: string[];
}

export function MobileIntelligenceView({ 
  instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'] 
}: MobileIntelligenceViewProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  
  const { data: signals, isLoading: signalsLoading } = useIntelligenceSignals(instruments);
  const { data: whaleTransactions, isLoading: whalesLoading } = useWhaleTransactions();
  const refreshMutation = useRefreshIntelligence();

  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        toast.success('Push notifications enabled');
        
        // Show test notification
        new Notification('Intelligence Alerts Active', {
          body: 'You will receive alerts for whale activity and signals',
          icon: '/favicon.ico',
        });
      } else {
        toast.error('Notification permission denied');
      }
    } else {
      toast.error('Notifications not supported in this browser');
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshMutation.mutateAsync('analyze_signals');
      toast.success('Intelligence refreshed');
    } catch {
      toast.error('Failed to refresh');
    }
  };

  const getDirectionColor = (direction: string) => {
    if (direction === 'bullish') return 'text-trading-long';
    if (direction === 'bearish') return 'text-trading-short';
    return 'text-muted-foreground';
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === 'bullish') return <TrendingUp className="h-4 w-4 text-trading-long" />;
    if (direction === 'bearish') return <TrendingDown className="h-4 w-4 text-trading-short" />;
    return null;
  };

  // Get top signals for quick view
  const topSignals = signals?.slice(0, 4) || [];
  const recentWhales = whaleTransactions?.filter(tx => (tx.usd_value || 0) > 500000).slice(0, 3) || [];

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Smartphone className="h-5 w-5 text-primary" />
            Intelligence Hub
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={notificationsEnabled ? 'secondary' : 'outline'}
              onClick={handleEnableNotifications}
              className="gap-1"
            >
              {notificationsEnabled ? (
                <Bell className="h-3 w-3" />
              ) : (
                <BellOff className="h-3 w-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", refreshMutation.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-card/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Active Signals</span>
            </div>
            <p className="text-2xl font-bold">{signals?.length || 0}</p>
            <p className="text-xs text-muted-foreground">
              {topSignals.filter(s => s.direction === 'bullish').length} bullish
            </p>
          </div>
          <div className="p-3 rounded-lg bg-card/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Fish className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Whale Moves</span>
            </div>
            <p className="text-2xl font-bold">{recentWhales.length}</p>
            <p className="text-xs text-muted-foreground">Large transactions</p>
          </div>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue="signals" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signals" className="gap-1">
              <Brain className="h-3 w-3" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="whales" className="gap-1">
              <Fish className="h-3 w-3" />
              Whales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="mt-3">
            <ScrollArea className="h-[280px]">
              {signalsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : topSignals.length > 0 ? (
                <div className="space-y-2">
                  {topSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="p-3 rounded-lg bg-card/50 border border-border/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getDirectionIcon(signal.direction)}
                          <span className="font-semibold">{signal.instrument}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn("capitalize", getDirectionColor(signal.direction))}
                        >
                          {signal.direction}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">
                            Strength: <span className="font-mono font-bold">{(Number(signal.strength) * 100).toFixed(0)}%</span>
                          </span>
                          <span className="text-muted-foreground">
                            Conf: <span className="font-mono">{(Number(signal.confidence) * 100).toFixed(0)}%</span>
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Sparkles className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-sm">No signals yet</p>
                  <Button size="sm" variant="outline" onClick={handleRefresh} className="mt-2">
                    Generate
                  </Button>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="whales" className="mt-3">
            <ScrollArea className="h-[280px]">
              {whalesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentWhales.length > 0 ? (
                <div className="space-y-2">
                  {recentWhales.map((tx) => {
                    const isLarge = (tx.usd_value || 0) > 1000000;
                    return (
                      <div
                        key={tx.id}
                        className={cn(
                          "p-3 rounded-lg border",
                          isLarge 
                            ? "bg-warning/10 border-warning/30" 
                            : "bg-card/50 border-border/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{tx.instrument}</span>
                            <Badge variant="outline" className="capitalize text-xs">
                              {tx.direction}
                            </Badge>
                            {isLarge && (
                              <AlertTriangle className="h-3 w-3 text-warning" />
                            )}
                          </div>
                          <span className={cn(
                            "font-mono font-bold",
                            isLarge && "text-warning"
                          )}>
                            ${((tx.usd_value || 0) / 1000000).toFixed(2)}M
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate max-w-[120px]">
                            {tx.from_address.slice(0, 6)}...{tx.from_address.slice(-4)}
                          </span>
                          <span>
                            {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Fish className="h-6 w-6 mb-2 opacity-50" />
                  <p className="text-sm">No large whale moves</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Notification Settings */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleEnableNotifications();
                } else {
                  setNotificationsEnabled(false);
                }
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Get alerts for whale activity &gt;$1M and high-confidence signals
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
