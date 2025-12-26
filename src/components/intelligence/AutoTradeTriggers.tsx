import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { 
  Zap, 
  Plus,
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Fish,
  MessageCircle,
  Trash2,
  Play,
  Pause,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

interface TradeTrigger {
  id: string;
  name: string;
  type: 'whale' | 'sentiment' | 'signal';
  condition: {
    threshold: number;
    operator: 'gt' | 'lt' | 'eq';
    instrument?: string;
  };
  action: {
    type: 'alert' | 'paper_trade' | 'live_trade';
    side: 'buy' | 'sell';
    sizePercent: number; // % of available capital
    stopLossPercent: number;
    takeProfitPercent: number;
  };
  safety: {
    maxPositionSize: number;
    cooldownMinutes: number;
    dailyMaxTrades: number;
  };
  isActive: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

const DEFAULT_TRIGGER: Omit<TradeTrigger, 'id' | 'triggerCount'> = {
  name: '',
  type: 'whale',
  condition: {
    threshold: 1000000,
    operator: 'gt',
    instrument: 'BTC-USDT',
  },
  action: {
    type: 'alert',
    side: 'buy',
    sizePercent: 5,
    stopLossPercent: 2,
    takeProfitPercent: 5,
  },
  safety: {
    maxPositionSize: 10000,
    cooldownMinutes: 30,
    dailyMaxTrades: 5,
  },
  isActive: false,
};

export function AutoTradeTriggers() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTrigger, setNewTrigger] = useState(DEFAULT_TRIGGER);
  const [triggers, setTriggers] = useState<TradeTrigger[]>([
    {
      id: '1',
      name: 'Whale Buy Signal',
      type: 'whale',
      condition: { threshold: 5000000, operator: 'gt', instrument: 'BTC-USDT' },
      action: { type: 'alert', side: 'buy', sizePercent: 3, stopLossPercent: 2, takeProfitPercent: 6 },
      safety: { maxPositionSize: 5000, cooldownMinutes: 60, dailyMaxTrades: 3 },
      isActive: true,
      triggerCount: 2,
    },
    {
      id: '2',
      name: 'Bearish Sentiment Exit',
      type: 'sentiment',
      condition: { threshold: -0.5, operator: 'lt', instrument: 'ETH-USDT' },
      action: { type: 'alert', side: 'sell', sizePercent: 50, stopLossPercent: 1, takeProfitPercent: 3 },
      safety: { maxPositionSize: 10000, cooldownMinutes: 120, dailyMaxTrades: 2 },
      isActive: false,
      triggerCount: 0,
    },
  ]);

  const handleAddTrigger = () => {
    if (!newTrigger.name) {
      toast.error('Trigger name required');
      return;
    }

    const trigger: TradeTrigger = {
      ...newTrigger,
      id: crypto.randomUUID(),
      triggerCount: 0,
    };

    setTriggers(prev => [...prev, trigger]);
    setShowAddDialog(false);
    setNewTrigger(DEFAULT_TRIGGER);
    toast.success('Trigger created');
  };

  const toggleTrigger = (id: string) => {
    setTriggers(prev => prev.map(t => 
      t.id === id ? { ...t, isActive: !t.isActive } : t
    ));
  };

  const deleteTrigger = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id));
    toast.success('Trigger deleted');
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'whale': return <Fish className="h-4 w-4" />;
      case 'sentiment': return <MessageCircle className="h-4 w-4" />;
      case 'signal': return <Zap className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const formatCondition = (trigger: TradeTrigger) => {
    const op = trigger.condition.operator === 'gt' ? '>' : trigger.condition.operator === 'lt' ? '<' : '=';
    if (trigger.type === 'whale') {
      return `Whale TX ${op} $${(trigger.condition.threshold / 1000000).toFixed(1)}M`;
    }
    if (trigger.type === 'sentiment') {
      return `Sentiment ${op} ${(trigger.condition.threshold * 100).toFixed(0)}%`;
    }
    return `Signal strength ${op} ${(trigger.condition.threshold * 100).toFixed(0)}%`;
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Auto-Trade Triggers
          </CardTitle>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-3 w-3" />
                New Trigger
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Trade Trigger</DialogTitle>
                <DialogDescription>
                  Set conditions that automatically trigger trades or alerts.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh]">
                <div className="space-y-6 py-4 pr-4">
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      Safety limits are enforced. Start with "Alert Only" mode before enabling live trading.
                    </AlertDescription>
                  </Alert>

                  {/* Basic Info */}
                  <div className="space-y-3">
                    <Label>Trigger Name</Label>
                    <Input
                      placeholder="e.g., Whale Buy Alert"
                      value={newTrigger.name}
                      onChange={(e) => setNewTrigger(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  {/* Trigger Type */}
                  <div className="space-y-3">
                    <Label>Trigger Type</Label>
                    <Select
                      value={newTrigger.type}
                      onValueChange={(v: 'whale' | 'sentiment' | 'signal') => 
                        setNewTrigger(prev => ({ ...prev, type: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whale">
                          <span className="flex items-center gap-2">
                            <Fish className="h-4 w-4" /> Whale Transaction
                          </span>
                        </SelectItem>
                        <SelectItem value="sentiment">
                          <span className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4" /> Sentiment Score
                          </span>
                        </SelectItem>
                        <SelectItem value="signal">
                          <span className="flex items-center gap-2">
                            <Zap className="h-4 w-4" /> Intelligence Signal
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Condition */}
                  <div className="space-y-3">
                    <Label>Condition</Label>
                    <div className="flex gap-2">
                      <Select
                        value={newTrigger.condition.operator}
                        onValueChange={(v: 'gt' | 'lt' | 'eq') => 
                          setNewTrigger(prev => ({ 
                            ...prev, 
                            condition: { ...prev.condition, operator: v } 
                          }))
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gt">Greater than</SelectItem>
                          <SelectItem value="lt">Less than</SelectItem>
                          <SelectItem value="eq">Equals</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder={newTrigger.type === 'whale' ? '1000000' : '0.5'}
                        value={newTrigger.condition.threshold}
                        onChange={(e) => setNewTrigger(prev => ({ 
                          ...prev, 
                          condition: { ...prev.condition, threshold: parseFloat(e.target.value) || 0 } 
                        }))}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {newTrigger.type === 'whale' && 'USD value of transaction'}
                      {newTrigger.type === 'sentiment' && 'Score from -1 (bearish) to 1 (bullish)'}
                      {newTrigger.type === 'signal' && 'Signal strength from 0 to 1'}
                    </p>
                  </div>

                  {/* Instrument */}
                  <div className="space-y-3">
                    <Label>Instrument</Label>
                    <Select
                      value={newTrigger.condition.instrument}
                      onValueChange={(v) => 
                        setNewTrigger(prev => ({ 
                          ...prev, 
                          condition: { ...prev.condition, instrument: v } 
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BTC-USDT">BTC-USDT</SelectItem>
                        <SelectItem value="ETH-USDT">ETH-USDT</SelectItem>
                        <SelectItem value="SOL-USDT">SOL-USDT</SelectItem>
                        <SelectItem value="ARB-USDT">ARB-USDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action */}
                  <div className="space-y-3">
                    <Label>Action</Label>
                    <Select
                      value={newTrigger.action.type}
                      onValueChange={(v: 'alert' | 'paper_trade' | 'live_trade') => 
                        setNewTrigger(prev => ({ 
                          ...prev, 
                          action: { ...prev.action, type: v } 
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alert">Alert Only</SelectItem>
                        <SelectItem value="paper_trade">Paper Trade (Simulated)</SelectItem>
                        <SelectItem value="live_trade" disabled>
                          <span className="flex items-center gap-2">
                            Live Trade
                            <Badge variant="outline" className="text-[10px] px-1">Requires API</Badge>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Live trading requires connected exchange APIs with trading permissions.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label>Side</Label>
                      <Select
                        value={newTrigger.action.side}
                        onValueChange={(v: 'buy' | 'sell') => 
                          setNewTrigger(prev => ({ 
                            ...prev, 
                            action: { ...prev.action, side: v } 
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy / Long</SelectItem>
                          <SelectItem value="sell">Sell / Short</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label>Position Size %</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={newTrigger.action.sizePercent}
                        onChange={(e) => setNewTrigger(prev => ({ 
                          ...prev, 
                          action: { ...prev.action, sizePercent: parseFloat(e.target.value) || 5 } 
                        }))}
                      />
                    </div>
                  </div>

                  {/* Safety Limits */}
                  <div className="space-y-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
                    <Label className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Safety Limits
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Max Position ($)</Label>
                        <Input
                          type="number"
                          value={newTrigger.safety.maxPositionSize}
                          onChange={(e) => setNewTrigger(prev => ({ 
                            ...prev, 
                            safety: { ...prev.safety, maxPositionSize: parseFloat(e.target.value) || 10000 } 
                          }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooldown (min)</Label>
                        <Input
                          type="number"
                          value={newTrigger.safety.cooldownMinutes}
                          onChange={(e) => setNewTrigger(prev => ({ 
                            ...prev, 
                            safety: { ...prev.safety, cooldownMinutes: parseInt(e.target.value) || 30 } 
                          }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max Trades Per Day</Label>
                      <Slider
                        value={[newTrigger.safety.dailyMaxTrades]}
                        onValueChange={([v]) => setNewTrigger(prev => ({ 
                          ...prev, 
                          safety: { ...prev.safety, dailyMaxTrades: v } 
                        }))}
                        min={1}
                        max={20}
                        step={1}
                      />
                      <p className="text-xs text-muted-foreground text-right">{newTrigger.safety.dailyMaxTrades} trades/day</p>
                    </div>
                  </div>

                  <Button className="w-full" onClick={handleAddTrigger}>
                    <Zap className="h-4 w-4 mr-2" />
                    Create Trigger
                  </Button>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px]">
          {triggers.length > 0 ? (
            <div className="space-y-3">
              {triggers.map((trigger) => (
                <div
                  key={trigger.id}
                  className={cn(
                    "p-4 rounded-lg border space-y-3",
                    trigger.isActive 
                      ? "bg-primary/5 border-primary/30" 
                      : "bg-card/50 border-border/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        trigger.isActive ? "bg-primary/20" : "bg-muted"
                      )}>
                        {getTypeIcon(trigger.type)}
                      </div>
                      <div>
                        <h4 className="font-semibold">{trigger.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {formatCondition(trigger)} → {trigger.condition.instrument}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={trigger.isActive}
                      onCheckedChange={() => toggleTrigger(trigger.id)}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={trigger.action.side === 'buy' ? 'default' : 'destructive'} className="gap-1">
                      {trigger.action.side === 'buy' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {trigger.action.side.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">{trigger.action.sizePercent}% size</Badge>
                    <Badge variant="secondary" className="capitalize">{trigger.action.type.replace('_', ' ')}</Badge>
                    <Badge variant="outline" className="gap-1">
                      <Shield className="h-3 w-3" />
                      Max ${trigger.safety.maxPositionSize}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      Triggered {trigger.triggerCount}x
                      {trigger.lastTriggered && ` • Last: ${new Date(trigger.lastTriggered).toLocaleString()}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost">
                        <Settings2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-destructive"
                        onClick={() => deleteTrigger(trigger.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Zap className="h-8 w-8 mb-2 opacity-50" />
              <p>No triggers configured</p>
              <p className="text-xs">Create triggers to automate your trading</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
