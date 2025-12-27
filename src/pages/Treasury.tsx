import { MainLayout } from '@/components/layout/MainLayout';
import { useWallets, useTotalTreasuryValue } from '@/hooks/useWallets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Plus, Send, ArrowDownLeft, Shield, Key, Copy, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const networkColors: Record<string, string> = {
  ethereum: 'bg-chart-4/20 text-chart-4',
  bitcoin: 'bg-chart-3/20 text-chart-3',
  solana: 'bg-chart-2/20 text-chart-2',
  base: 'bg-chart-1/20 text-chart-1',
  arbitrum: 'bg-chart-5/20 text-chart-5',
  optimism: 'bg-destructive/20 text-destructive',
  polygon: 'bg-primary/20 text-primary',
};

const typeIcons: Record<string, string> = {
  hot: '🔥',
  cold: '❄️',
  multisig: '🔐',
};

export default function Treasury() {
  const { data: wallets, isLoading, refetch, isRefetching } = useWallets();
  const { data: totalValue } = useTotalTreasuryValue();

  const pendingApprovals = wallets?.reduce((sum, w) => sum + w.pending_approvals, 0) || 0;

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const getExplorerUrl = (network: string, address: string) => {
    const explorers: Record<string, string> = {
      ethereum: `https://etherscan.io/address/${address}`,
      bitcoin: `https://mempool.space/address/${address}`,
      solana: `https://solscan.io/account/${address}`,
      base: `https://basescan.org/address/${address}`,
      arbitrum: `https://arbiscan.io/address/${address}`,
      optimism: `https://optimistic.etherscan.io/address/${address}`,
      polygon: `https://polygonscan.com/address/${address}`,
    };
    return explorers[network] || '#';
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-7 w-7 text-primary" />
              Treasury & Wallets
            </h1>
            <p className="text-muted-foreground">Watch-only wallets, balances, and transfer approvals</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Wallet
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="metric-card md:col-span-2">
            <p className="text-sm text-muted-foreground">Total Treasury Value</p>
            {isLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <p className="text-3xl font-mono font-bold">${(totalValue || 0).toLocaleString()}</p>
            )}
          </div>
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Watched Wallets</p>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className="text-2xl font-mono font-semibold">{wallets?.length || 0}</p>
            )}
          </div>
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Pending Approvals</p>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <p className={cn(
                'text-2xl font-mono font-semibold',
                pendingApprovals > 0 ? 'text-warning' : ''
              )}>
                {pendingApprovals}
              </p>
            )}
          </div>
        </div>

        {/* Wallet cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-panel rounded-xl p-6">
                <div className="flex justify-between mb-4">
                  <div>
                    <Skeleton className="h-6 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="h-12 w-full mb-4" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                </div>
              </div>
            ))}
          </div>
        ) : wallets?.length === 0 ? (
          <div className="glass-panel rounded-xl p-12 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Wallets Added</h3>
            <p className="text-muted-foreground mb-4">
              Add watch-only wallets to track balances across chains.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Wallet
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {wallets?.map((wallet) => (
              <div key={wallet.id} className="glass-panel rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{typeIcons[wallet.type]}</span>
                      <h3 className="font-semibold">{wallet.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium capitalize', networkColors[wallet.network])}>
                        {wallet.network}
                      </span>
                      <Badge variant={wallet.type === 'cold' ? 'secondary' : wallet.type === 'multisig' ? 'outline' : 'warning'}>
                        {wallet.type}
                      </Badge>
                      {wallet.is_watch_only && (
                        <Badge variant="secondary" className="text-xs">watch-only</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-mono font-bold">
                      {Number(wallet.balance).toLocaleString()} {wallet.currency}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${Number(wallet.usd_value).toLocaleString()}
                    </p>
                    {wallet.pending_approvals > 0 && (
                      <Badge variant="warning" className="mt-1">
                        {wallet.pending_approvals} pending
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 mb-4">
                  <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {wallet.address}
                  </code>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyAddress(wallet.address)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => window.open(getExplorerUrl(wallet.network, wallet.address), '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>

                {/* Multi-sig info */}
                {wallet.type === 'multisig' && (
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 mb-4">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Multi-Signature</p>
                      <p className="text-xs text-muted-foreground">
                        {wallet.required_signers} of {wallet.signers} signers required
                      </p>
                    </div>
                    <div className="flex-1" />
                    <div className="flex -space-x-2">
                      {Array.from({ length: wallet.signers }).map((_, i) => (
                        <div
                          key={i}
                          className="w-7 h-7 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center"
                        >
                          <span className="text-xs font-medium text-primary">{i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1">
                    <ArrowDownLeft className="h-4 w-4" />
                    Receive
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1" disabled={wallet.is_watch_only}>
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                  {wallet.type === 'multisig' && wallet.pending_approvals > 0 && (
                    <Button size="sm" className="flex-1 gap-1">
                      <Shield className="h-4 w-4" />
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
