import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Key,
  Plus,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useExchangeKeys } from '@/hooks/useExchangeKeys';

const EXCHANGES = [
  { id: 'coinbase', name: 'Coinbase Advanced', icon: '🔵', recommended: true, usCompliant: true },
  { id: 'kraken', name: 'Kraken', icon: '🟣', usCompliant: true },
  { id: 'binance', name: 'Binance', icon: '🟡', usCompliant: false, warning: 'Not available in US' },
  { id: 'bybit', name: 'Bybit', icon: '🟠', usCompliant: false, warning: 'Not available in US' },
  { id: 'okx', name: 'OKX', icon: '⚫', usCompliant: false, warning: 'Not available in US' },
  { id: 'mexc', name: 'MEXC', icon: '🔷', usCompliant: false, warning: 'Not available in US' },
  { id: 'hyperliquid', name: 'Hyperliquid', icon: '💎', usCompliant: true },
];

const PERMISSION_OPTIONS = [
  { id: 'read', label: 'Read Only', description: 'View balances and history' },
  { id: 'trade', label: 'Trading', description: 'Place and manage orders' },
  { id: 'withdraw', label: 'Withdrawal', description: 'Transfer funds (caution!)' },
];

export function ExchangeAPIManager() {
  const { keys, isLoading, addKey, deleteKey, validateKey, maskKey } = useExchangeKeys();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [newConfig, setNewConfig] = useState({
    label: '',
    exchange: '',
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    permissions: ['read'],
  });

  const handleAddConfig = async () => {
    if (!newConfig.label || !newConfig.exchange || !newConfig.apiKey || !newConfig.apiSecret) {
      return;
    }

    await addKey.mutateAsync({
      exchange: newConfig.exchange,
      label: newConfig.label,
      apiKey: newConfig.apiKey,
      apiSecret: newConfig.apiSecret,
      passphrase: newConfig.passphrase || undefined,
      permissions: newConfig.permissions,
    });

    setShowAddDialog(false);
    setNewConfig({ label: '', exchange: '', apiKey: '', apiSecret: '', passphrase: '', permissions: ['read'] });
  };

  const handleRemoveConfig = async (id: string) => {
    await deleteKey.mutateAsync(id);
  };

  const handleTestConnection = async (id: string) => {
    await validateKey.mutateAsync(id);
  };

  const getExchangeInfo = (exchangeId: string) => {
    return EXCHANGES.find(e => e.id === exchangeId) || { name: exchangeId, icon: '🔗', recommended: false, usCompliant: false };
  };

  const togglePermission = (permission: string) => {
    setNewConfig(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5 text-primary" />
            Exchange API Keys
          </CardTitle>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-3 w-3" />
                Add Exchange
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Exchange API</DialogTitle>
                <DialogDescription>
                  Securely connect your exchange account. API keys are encrypted and stored securely.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Your API keys are encrypted end-to-end. Never share them with anyone.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Exchange</Label>
                  <Select
                    value={newConfig.exchange}
                    onValueChange={(v) => setNewConfig(prev => ({ ...prev, exchange: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select exchange" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGES.map((ex) => (
                        <SelectItem key={ex.id} value={ex.id}>
                          <span className="flex items-center gap-2">
                            <span>{ex.icon}</span>
                            {ex.name}
                            {ex.recommended && (
                              <Badge variant="outline" className="text-xs border-primary text-primary ml-1">
                                Recommended
                              </Badge>
                            )}
                            {ex.warning && (
                              <Badge variant="outline" className="text-xs border-warning text-warning ml-1">
                                {ex.warning}
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    placeholder="e.g., Main Trading Account"
                    value={newConfig.label}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, label: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    placeholder="Enter your API key"
                    value={newConfig.apiKey}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>API Secret</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      placeholder="Enter your API secret"
                      value={newConfig.apiSecret}
                      onChange={(e) => setNewConfig(prev => ({ ...prev, apiSecret: e.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {(newConfig.exchange === 'okx' || newConfig.exchange === 'coinbase') && (
                  <div className="space-y-2">
                    <Label>Passphrase (if required)</Label>
                    <Input
                      type="password"
                      placeholder="API passphrase"
                      value={newConfig.passphrase}
                      onChange={(e) => setNewConfig(prev => ({ ...prev, passphrase: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="space-y-2">
                    {PERMISSION_OPTIONS.map((perm) => (
                      <div
                        key={perm.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                          newConfig.permissions.includes(perm.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50",
                          perm.id === 'withdraw' && "border-destructive/50"
                        )}
                        onClick={() => togglePermission(perm.id)}
                      >
                        <div>
                          <p className="font-medium text-sm">{perm.label}</p>
                          <p className="text-xs text-muted-foreground">{perm.description}</p>
                        </div>
                        <Switch
                          checked={newConfig.permissions.includes(perm.id)}
                          onCheckedChange={() => togglePermission(perm.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleAddConfig}
                  disabled={addKey.isPending || !newConfig.label || !newConfig.exchange || !newConfig.apiKey || !newConfig.apiSecret}
                >
                  {addKey.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  {addKey.isPending ? 'Adding...' : 'Add Securely'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {keys.length > 0 && (
          <Alert className="mb-4 border-success/50 bg-success/5">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertDescription className="text-success">
              <strong>Keys Stored:</strong> Your exchange API keys are encrypted and stored securely in your account.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
        <ScrollArea className="h-[300px]">
          {keys.length > 0 ? (
            <div className="space-y-3">
              {keys.map((keyData) => {
                const exchange = getExchangeInfo(keyData.exchange);
                return (
                  <div
                    key={keyData.id}
                    className={cn(
                      "p-4 rounded-lg bg-card/50 border space-y-3",
                      keyData.is_validated ? "border-success/30" : "border-border/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{exchange.icon}</span>
                        <div>
                          <h4 className="font-semibold">{keyData.label}</h4>
                          <p className="text-sm text-muted-foreground">{exchange.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {keyData.is_validated ? (
                          <Badge variant="outline" className="gap-1 border-success/50 text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : keyData.validation_error ? (
                          <Badge variant="outline" className="gap-1 border-destructive/50 text-destructive">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            Not Verified
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {keyData.exchange}-{keyData.label}
                      </code>
                      <div className="flex flex-wrap gap-1">
                        {keyData.permissions.map((perm) => (
                          <Badge
                            key={perm}
                            variant="outline"
                            className={cn(
                              "text-xs",
                              perm === 'withdraw' && "border-destructive text-destructive"
                            )}
                          >
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">
                        {keyData.last_validated_at
                          ? `Validated: ${new Date(keyData.last_validated_at).toLocaleString()}`
                          : `Added: ${new Date(keyData.created_at).toLocaleString()}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleTestConnection(keyData.id)}
                          disabled={validateKey.isPending}
                        >
                          {validateKey.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveConfig(keyData.id)}
                          disabled={deleteKey.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Key className="h-8 w-8 mb-2 opacity-50" />
              <p>No exchange APIs connected</p>
              <p className="text-xs">Add your exchange API keys to enable trading</p>
            </div>
          )}
        </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
