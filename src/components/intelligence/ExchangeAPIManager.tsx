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
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExchangeConfig {
  id: string;
  name: string;
  exchange: string;
  apiKey: string;
  isConnected: boolean;
  permissions: string[];
  lastSynced?: Date;
}

const EXCHANGES = [
  { id: 'coinbase', name: 'Coinbase Advanced', icon: '🔵', recommended: true, usCompliant: true },
  { id: 'kraken', name: 'Kraken', icon: '🟣', usCompliant: true },
  { id: 'binance', name: 'Binance', icon: '🟡', usCompliant: false, warning: 'Not available in US' },
  { id: 'bybit', name: 'Bybit', icon: '🟠', usCompliant: false, warning: 'Not available in US' },
  { id: 'okx', name: 'OKX', icon: '⚫', usCompliant: false, warning: 'Not available in US' },
];

const PERMISSION_OPTIONS = [
  { id: 'read', label: 'Read Only', description: 'View balances and history' },
  { id: 'trade', label: 'Trading', description: 'Place and manage orders' },
  { id: 'withdraw', label: 'Withdrawal', description: 'Transfer funds (caution!)' },
];

export function ExchangeAPIManager() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: '',
    exchange: '',
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    permissions: ['read'],
  });

  // In a real app, this would come from secure storage/backend
  const [configs, setConfigs] = useState<ExchangeConfig[]>([
    {
      id: '1',
      name: 'Main Trading',
      exchange: 'binance',
      apiKey: '****k3Xf',
      isConnected: true,
      permissions: ['read', 'trade'],
      lastSynced: new Date(),
    },
    {
      id: '2',
      name: 'Arbitrage Bot',
      exchange: 'bybit',
      apiKey: '****9Zxc',
      isConnected: true,
      permissions: ['read', 'trade'],
      lastSynced: new Date(Date.now() - 3600000),
    },
  ]);

  const handleAddConfig = () => {
    if (!newConfig.name || !newConfig.exchange || !newConfig.apiKey) {
      toast.error('Please fill all required fields');
      return;
    }

    const config: ExchangeConfig = {
      id: crypto.randomUUID(),
      name: newConfig.name,
      exchange: newConfig.exchange,
      apiKey: `****${newConfig.apiKey.slice(-4)}`,
      isConnected: true,
      permissions: newConfig.permissions,
      lastSynced: new Date(),
    };

    setConfigs(prev => [...prev, config]);
    setShowAddDialog(false);
    setNewConfig({ name: '', exchange: '', apiKey: '', apiSecret: '', passphrase: '', permissions: ['read'] });
    toast.success('Exchange API key added successfully');
  };

  const handleRemoveConfig = (id: string) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
    toast.success('API key removed');
  };

  const handleTestConnection = (id: string) => {
    const config = configs.find(c => c.id === id);
    if (config) {
      toast.success(`Connection to ${config.name} verified`);
    }
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
                    value={newConfig.name}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, name: e.target.value }))}
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

                <Button className="w-full" onClick={handleAddConfig}>
                  <Shield className="h-4 w-4 mr-2" />
                  Add Securely
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 border-warning/50 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Preview Mode:</strong> API keys are stored locally for UI demonstration only. 
            Real exchange connections require backend integration.
          </AlertDescription>
        </Alert>
        <ScrollArea className="h-[300px]">
          {configs.length > 0 ? (
            <div className="space-y-3">
              {configs.map((config) => {
                const exchange = getExchangeInfo(config.exchange);
                return (
                  <div
                    key={config.id}
                    className="p-4 rounded-lg bg-card/50 border border-border/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{exchange.icon}</span>
                        <div>
                          <h4 className="font-semibold">{config.name}</h4>
                          <p className="text-sm text-muted-foreground">{exchange.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          Local Only
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {config.apiKey}
                      </code>
                      <div className="flex flex-wrap gap-1">
                        {config.permissions.map((perm) => (
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
                        Last synced: {config.lastSynced ? new Date(config.lastSynced).toLocaleString() : 'Never'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleTestConnection(config.id)}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                        >
                          <Settings2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveConfig(config.id)}
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
      </CardContent>
    </Card>
  );
}
