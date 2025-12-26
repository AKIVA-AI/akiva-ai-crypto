import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTradingAlerts, TradingAlert, PriceAlert, PnlAlert } from '@/hooks/useTradingAlerts';
import { usePositions } from '@/hooks/usePositions';
import { format } from 'date-fns';
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  DollarSign,
} from 'lucide-react';

const ALERT_INSTRUMENTS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'ARB/USDT',
  'OP/USDT',
  'AVAX/USDT',
];

export function TradingAlertsPanel() {
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [pnlAlerts, setPnlAlerts] = useState<PnlAlert[]>([]);
  const [showAddPriceAlert, setShowAddPriceAlert] = useState(false);
  const [showAddPnlAlert, setShowAddPnlAlert] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // New alert form state
  const [newPriceAlert, setNewPriceAlert] = useState({
    instrument: 'BTC/USDT',
    targetPrice: '',
    direction: 'above' as 'above' | 'below',
  });
  const [newPnlAlert, setNewPnlAlert] = useState({
    positionId: '',
    threshold: '',
    type: 'loss' as 'profit' | 'loss',
  });

  const { data: positions = [] } = usePositions();

  const { 
    alerts, 
    unacknowledgedCount, 
    acknowledgeAlert, 
    clearAlerts,
    resetPriceAlert,
    isConnected,
  } = useTradingAlerts({
    priceAlerts,
    pnlAlerts,
  });

  const handleAddPriceAlert = () => {
    const targetPrice = parseFloat(newPriceAlert.targetPrice);
    if (!targetPrice || targetPrice <= 0) return;

    const alert: PriceAlert = {
      id: `price-${Date.now()}`,
      instrument: newPriceAlert.instrument,
      targetPrice,
      direction: newPriceAlert.direction,
      enabled: true,
    };

    setPriceAlerts(prev => [...prev, alert]);
    setNewPriceAlert({ instrument: 'BTC/USDT', targetPrice: '', direction: 'above' });
    setShowAddPriceAlert(false);
  };

  const handleAddPnlAlert = () => {
    const threshold = parseFloat(newPnlAlert.threshold);
    if (!threshold || threshold <= 0 || !newPnlAlert.positionId) return;

    const position = positions.find(p => p.id === newPnlAlert.positionId);
    if (!position) return;

    const alert: PnlAlert = {
      id: `pnl-${Date.now()}`,
      positionId: newPnlAlert.positionId,
      instrument: position.instrument,
      threshold,
      type: newPnlAlert.type,
      enabled: true,
    };

    setPnlAlerts(prev => [...prev, alert]);
    setNewPnlAlert({ positionId: '', threshold: '', type: 'loss' });
    setShowAddPnlAlert(false);
  };

  const togglePriceAlert = (id: string) => {
    setPriceAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    ));
  };

  const deletePriceAlert = (id: string) => {
    setPriceAlerts(prev => prev.filter(a => a.id !== id));
  };

  const togglePnlAlert = (id: string) => {
    setPnlAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    ));
  };

  const deletePnlAlert = (id: string) => {
    setPnlAlerts(prev => prev.filter(a => a.id !== id));
  };

  const getSeverityIcon = (severity: TradingAlert['severity']) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-warning" />;
      default: return <Info className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="h-6 w-6" />
              {unacknowledgedCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                  {unacknowledgedCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Trading Alerts</h3>
              <p className="text-xs text-muted-foreground">
                {isConnected ? 'Monitoring active' : 'Connecting...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
              History ({alerts.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Price Alerts */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Price Alerts
          </h4>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowAddPriceAlert(true)}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>

        {priceAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No price alerts configured
          </p>
        ) : (
          <div className="space-y-2">
            {priceAlerts.map(alert => (
              <div 
                key={alert.id} 
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  alert.enabled ? 'bg-muted/30 border-border/50' : 'bg-muted/10 border-border/20 opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  {alert.direction === 'above' ? (
                    <TrendingUp className="h-4 w-4 text-trading-long" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-trading-short" />
                  )}
                  <div>
                    <p className="font-medium">{alert.instrument}</p>
                    <p className="text-sm text-muted-foreground">
                      {alert.direction === 'above' ? '≥' : '≤'} ${alert.targetPrice.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={alert.enabled} 
                    onCheckedChange={() => {
                      togglePriceAlert(alert.id);
                      if (!alert.enabled) resetPriceAlert(alert.id);
                    }}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deletePriceAlert(alert.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* P&L Alerts */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            P&L Alerts
          </h4>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-1" 
            onClick={() => setShowAddPnlAlert(true)}
            disabled={positions.length === 0}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>

        {pnlAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No P&L alerts configured
          </p>
        ) : (
          <div className="space-y-2">
            {pnlAlerts.map(alert => (
              <div 
                key={alert.id} 
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  alert.enabled ? 'bg-muted/30 border-border/50' : 'bg-muted/10 border-border/20 opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <Badge className={cn(
                    alert.type === 'profit' 
                      ? 'bg-trading-long/20 text-trading-long' 
                      : 'bg-trading-short/20 text-trading-short'
                  )}>
                    {alert.type === 'profit' ? '+' : '-'}${alert.threshold}
                  </Badge>
                  <p className="font-medium">{alert.instrument}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={alert.enabled} 
                    onCheckedChange={() => togglePnlAlert(alert.id)}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deletePnlAlert(alert.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Price Alert Dialog */}
      <Dialog open={showAddPriceAlert} onOpenChange={setShowAddPriceAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Price Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Instrument</Label>
              <Select 
                value={newPriceAlert.instrument} 
                onValueChange={(v) => setNewPriceAlert(prev => ({ ...prev, instrument: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_INSTRUMENTS.map(inst => (
                    <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select 
                value={newPriceAlert.direction} 
                onValueChange={(v) => setNewPriceAlert(prev => ({ ...prev, direction: v as 'above' | 'below' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Price goes above</SelectItem>
                  <SelectItem value="below">Price goes below</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Price ($)</Label>
              <Input
                type="number"
                value={newPriceAlert.targetPrice}
                onChange={(e) => setNewPriceAlert(prev => ({ ...prev, targetPrice: e.target.value }))}
                placeholder="Enter price..."
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPriceAlert(false)}>Cancel</Button>
            <Button onClick={handleAddPriceAlert}>Add Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add P&L Alert Dialog */}
      <Dialog open={showAddPnlAlert} onOpenChange={setShowAddPnlAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add P&L Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Position</Label>
              <Select 
                value={newPnlAlert.positionId} 
                onValueChange={(v) => setNewPnlAlert(prev => ({ ...prev, positionId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select position..." />
                </SelectTrigger>
                <SelectContent>
                  {positions.map(pos => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.instrument} ({pos.side === 'buy' ? 'Long' : 'Short'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alert Type</Label>
              <Select 
                value={newPnlAlert.type} 
                onValueChange={(v) => setNewPnlAlert(prev => ({ ...prev, type: v as 'profit' | 'loss' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profit">Take Profit (P&L ≥)</SelectItem>
                  <SelectItem value="loss">Stop Loss (P&L ≤)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Threshold ($)</Label>
              <Input
                type="number"
                value={newPnlAlert.threshold}
                onChange={(e) => setNewPnlAlert(prev => ({ ...prev, threshold: e.target.value }))}
                placeholder="Enter amount..."
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPnlAlert(false)}>Cancel</Button>
            <Button onClick={handleAddPnlAlert}>Add Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Alert History</span>
              {alerts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAlerts}>
                  Clear All
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            {alerts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No alerts yet</p>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div 
                    key={alert.id}
                    className={cn(
                      'p-3 rounded-lg border flex items-start gap-3',
                      alert.acknowledged ? 'bg-muted/20' : 'bg-muted/40'
                    )}
                  >
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{alert.title}</p>
                        {!alert.acknowledged && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(alert.triggeredAt, 'MMM dd, HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
