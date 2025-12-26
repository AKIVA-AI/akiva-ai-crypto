import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useStrategies, useCreateStrategy, useUpdateStrategy, useDeleteStrategy } from '@/hooks/useStrategies';
import { useBooks } from '@/hooks/useBooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LineChart, Plus, Play, Pause, Settings, TrendingUp, TrendingDown, Trash2, Edit, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  off: 'bg-muted text-muted-foreground',
  paper: 'bg-warning/20 text-warning',
  live: 'bg-success/20 text-success',
};

export default function Strategies() {
  const { data: strategies = [], isLoading } = useStrategies();
  const { data: books = [] } = useBooks();
  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const deleteStrategy = useDeleteStrategy();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', book_id: '', timeframe: '1h', risk_tier: 1 });

  const handleCreate = async () => {
    if (!formData.name || !formData.book_id) return;
    await createStrategy.mutateAsync(formData);
    setIsCreateOpen(false);
    setFormData({ name: '', book_id: '', timeframe: '1h', risk_tier: 1 });
  };

  const handleStatusChange = async (id: string, status: 'off' | 'paper' | 'live') => {
    await updateStrategy.mutateAsync({ id, status });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LineChart className="h-7 w-7 text-primary" />
              Strategy Library
            </h1>
            <p className="text-muted-foreground">Create, backtest, and deploy trading strategies</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New Strategy</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Strategy</DialogTitle>
                <DialogDescription>Add a new trading strategy</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Strategy Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g., BTC Momentum Alpha" />
                </div>
                <div className="space-y-2">
                  <Label>Trading Book</Label>
                  <Select value={formData.book_id} onValueChange={(v) => setFormData(p => ({ ...p, book_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                    <SelectContent>
                      {books.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Timeframe</Label>
                    <Select value={formData.timeframe} onValueChange={(v) => setFormData(p => ({ ...p, timeframe: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['1m', '5m', '15m', '1h', '4h', '1d'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Tier</Label>
                    <Select value={formData.risk_tier.toString()} onValueChange={(v) => setFormData(p => ({ ...p, risk_tier: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(t => <SelectItem key={t} value={t.toString()}>Tier {t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createStrategy.isPending || !formData.name || !formData.book_id}>
                  {createStrategy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : strategies.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <LineChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No Strategies</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first trading strategy</p>
            <Button onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Strategy</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {strategies.map((strategy) => (
              <div key={strategy.id} className="glass-panel rounded-xl p-6 transition-all hover:border-primary/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{strategy.name}</h3>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', statusColors[strategy.status])}>{strategy.status}</span>
                      <span className="text-xs text-muted-foreground">• {strategy.timeframe} • Tier {strategy.risk_tier}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">Book: {(strategy as any).books?.name || 'N/A'}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div><p className="text-xs text-muted-foreground">P&L</p><p className={cn('font-mono font-semibold', Number(strategy.pnl) >= 0 ? 'text-success' : 'text-destructive')}>${Number(strategy.pnl).toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Max Drawdown</p><p className="font-mono font-semibold text-destructive">{Number(strategy.max_drawdown).toFixed(1)}%</p></div>
                      <div><p className="text-xs text-muted-foreground">Asset Class</p><p className="font-mono font-semibold">{strategy.asset_class}</p></div>
                      <div><p className="text-xs text-muted-foreground">Created</p><p className="font-mono font-semibold">{format(new Date(strategy.created_at), 'MMM d, yyyy')}</p></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Select value={strategy.status} onValueChange={(v: 'off' | 'paper' | 'live') => handleStatusChange(strategy.id, v)}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off</SelectItem>
                        <SelectItem value="paper">Paper</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete Strategy</AlertDialogTitle><AlertDialogDescription>Are you sure?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteStrategy.mutate(strategy.id)} className="bg-destructive">Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
