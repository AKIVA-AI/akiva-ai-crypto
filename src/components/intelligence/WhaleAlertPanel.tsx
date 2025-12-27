import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useWhaleWallets, useWhaleTransactions, useTrackWallet, useSimulateWhaleActivity } from '@/hooks/useWhaleAlerts';
import { cn } from '@/lib/utils';
import { 
  Fish, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  Plus,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface WhaleAlertPanelProps {
  compact?: boolean;
}

export function WhaleAlertPanel({ compact = false }: WhaleAlertPanelProps) {
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWallet, setNewWallet] = useState({ address: '', label: '', category: 'unknown' });

  const { data: wallets, isLoading: walletsLoading } = useWhaleWallets();
  const { data: transactions, isLoading: txLoading } = useWhaleTransactions();
  const trackWallet = useTrackWallet();
  const simulateActivity = useSimulateWhaleActivity();

  const handleAddWallet = async () => {
    if (!newWallet.address) {
      toast.error('Wallet address required');
      return;
    }
    
    try {
      await trackWallet.mutateAsync({
        address: newWallet.address,
        label: newWallet.label || 'Unknown Whale',
        category: newWallet.category,
      });
      toast.success('Wallet added to tracking');
      setShowAddWallet(false);
      setNewWallet({ address: '', label: '', category: 'unknown' });
    } catch (error) {
      toast.error('Failed to add wallet');
    }
  };

  const handleSimulate = async () => {
    try {
      await simulateActivity.mutateAsync('BTC-USDT');
      toast.success('Whale activity simulated');
    } catch (error) {
      toast.error('Failed to simulate activity');
    }
  };

  const getDirectionIcon = (direction: string) => {
    if (direction === 'inflow') return <ArrowDownLeft className="h-4 w-4 text-trading-long" />;
    if (direction === 'outflow') return <ArrowUpRight className="h-4 w-4 text-trading-short" />;
    return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
  };

  const formatUsdValue = (value: number | null) => {
    if (!value) return '$0';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Fish className="h-5 w-5 text-primary" />
            Whale Alerts
          </CardTitle>
          <div className="flex items-center gap-2">
            <Dialog open={showAddWallet} onOpenChange={setShowAddWallet}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-3 w-3" />
                  Track
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Track Whale Wallet</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Wallet Address</Label>
                    <Input
                      placeholder="0x..."
                      value={newWallet.address}
                      onChange={(e) => setNewWallet(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label (optional)</Label>
                    <Input
                      placeholder="e.g., Binance Hot Wallet"
                      value={newWallet.label}
                      onChange={(e) => setNewWallet(prev => ({ ...prev, label: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={newWallet.category}
                      onValueChange={(v) => setNewWallet(prev => ({ ...prev, category: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exchange">Exchange</SelectItem>
                        <SelectItem value="defi">DeFi Protocol</SelectItem>
                        <SelectItem value="fund">Fund/Institution</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleAddWallet}
                    disabled={trackWallet.isPending}
                  >
                    {trackWallet.isPending ? 'Adding...' : 'Add Wallet'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSimulate}
              disabled={simulateActivity.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", simulateActivity.isPending && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Tracked Wallets Summary */}
        {!compact && (
          <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Tracked Wallets</span>
              <Badge variant="secondary">{wallets?.length || 0}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {walletsLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                wallets?.slice(0, 5).map((wallet) => (
                  <Badge 
                    key={wallet.id} 
                    variant="outline" 
                    className="text-xs flex items-center gap-1"
                  >
                    <Wallet className="h-3 w-3" />
                    {wallet.label || wallet.address.slice(0, 8)}
                  </Badge>
                ))
              )}
            </div>
          </div>
        )}

        {/* Transactions */}
        <ScrollArea className={compact ? "h-[300px]" : "h-[350px]"}>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => {
                const isLarge = (tx.usd_value || 0) > 1000000;
                return (
                  <div
                    key={tx.id}
                    className={cn(
                      "p-3 rounded-lg border space-y-2",
                      isLarge 
                        ? "bg-warning/10 border-warning/30" 
                        : "bg-card/50 border-border/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getDirectionIcon(tx.direction)}
                        <span className="font-semibold">{tx.instrument}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {tx.direction}
                        </Badge>
                        {isLarge && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Large
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Amount</span>
                        <p className="font-mono">{Number(tx.amount).toFixed(4)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Value</span>
                        <p className={cn(
                          "font-mono font-bold",
                          isLarge && "text-warning"
                        )}>
                          {formatUsdValue(tx.usd_value)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[150px]">
                        {tx.from_address.slice(0, 8)}...{tx.from_address.slice(-6)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground truncate max-w-[150px]">
                        {tx.to_address.slice(0, 8)}...{tx.to_address.slice(-6)}
                      </span>
                      <a
                        href={`https://etherscan.io/tx/${tx.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Fish className="h-8 w-8 mb-2 opacity-50" />
              <p>No whale transactions yet</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSimulate}
                className="mt-2"
              >
                Simulate Activity
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
