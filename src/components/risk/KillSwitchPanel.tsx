import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Power, 
  AlertTriangle, 
  ShieldOff, 
  ShieldCheck,
  Pause,
  Play,
  Loader2,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function KillSwitchPanel() {
  const queryClient = useQueryClient();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Fetch global settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['global-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .single();
      return data;
    },
  });

  // Fetch books for individual controls
  const { data: books = [] } = useQuery({
    queryKey: ['books-risk'],
    queryFn: async () => {
      const { data } = await supabase.from('books').select('*');
      return data || [];
    },
  });

  // Toggle global kill switch
  const toggleKillSwitch = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('global_settings')
        .update({ 
          global_kill_switch: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings?.id);
      
      if (error) throw error;

      // Log audit event
      await supabase.from('audit_events').insert({
        action: enabled ? 'KILL_SWITCH_ACTIVATED' : 'KILL_SWITCH_DEACTIVATED',
        resource_type: 'global_settings',
        severity: enabled ? 'critical' : 'warning',
      });

      // Create alert
      await supabase.from('alerts').insert({
        title: enabled ? 'KILL SWITCH ACTIVATED' : 'Kill Switch Deactivated',
        message: enabled ? 'All trading has been halted' : 'Trading has been resumed',
        severity: enabled ? 'critical' : 'info',
        source: 'risk_engine',
      });
    },
    onSuccess: (_, enabled) => {
      toast[enabled ? 'error' : 'success'](
        enabled ? '🚨 KILL SWITCH ACTIVATED' : '✅ Kill Switch Deactivated',
        { duration: 10000 }
      );
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
    },
    onError: (error: any) => {
      toast.error('Failed to toggle kill switch', { description: error.message });
    },
  });

  // Toggle reduce-only mode
  const toggleReduceOnly = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('global_settings')
        .update({ reduce_only_mode: enabled })
        .eq('id', settings?.id);
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      toast.info(enabled ? 'Reduce-only mode enabled' : 'Reduce-only mode disabled');
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
    },
  });

  // Toggle paper trading
  const togglePaperTrading = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('global_settings')
        .update({ paper_trading_mode: enabled })
        .eq('id', settings?.id);
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      toast.info(enabled ? 'Paper trading enabled' : 'LIVE trading enabled - BE CAREFUL!');
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
    },
  });

  // Freeze/unfreeze book
  const toggleBookFreeze = useMutation({
    mutationFn: async ({ bookId, freeze }: { bookId: string; freeze: boolean }) => {
      const { error } = await supabase
        .from('books')
        .update({ status: freeze ? 'frozen' : 'active' })
        .eq('id', bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books-risk'] });
    },
  });

  const killSwitchActive = settings?.global_kill_switch || false;

  return (
    <div className="space-y-6">
      {/* Global Kill Switch */}
      <Card className={cn(
        'transition-all duration-300',
        killSwitchActive && 'border-destructive bg-destructive/5 glow-danger'
      )}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className={cn(
              'h-6 w-6',
              killSwitchActive ? 'text-destructive animate-pulse' : 'text-muted-foreground'
            )} />
            Global Kill Switch
          </CardTitle>
          <CardDescription>
            Emergency halt all trading activity across all books and venues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {killSwitchActive ? (
                <Badge variant="destructive" className="text-lg px-4 py-2 animate-pulse">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  TRADING HALTED
                </Badge>
              ) : (
                <Badge variant="success" className="text-lg px-4 py-2">
                  <ShieldCheck className="mr-2 h-5 w-5" />
                  SYSTEMS ACTIVE
                </Badge>
              )}
            </div>

            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant={killSwitchActive ? 'default' : 'destructive'}
                  size="lg"
                  className={cn(
                    'min-w-32',
                    !killSwitchActive && 'animate-pulse'
                  )}
                >
                  {killSwitchActive ? (
                    <>
                      <Play className="mr-2 h-5 w-5" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Power className="mr-2 h-5 w-5" />
                      KILL
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    {killSwitchActive ? (
                      <>
                        <Play className="h-5 w-5 text-success" />
                        Resume Trading?
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Activate Kill Switch?
                      </>
                    )}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {killSwitchActive
                      ? 'This will resume all trading activity. Ensure market conditions are stable before proceeding.'
                      : 'This will immediately halt ALL trading activity across all books and venues. Open orders will be cancelled. This action is logged for audit purposes.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toggleKillSwitch.mutate(!killSwitchActive)}
                    className={cn(
                      killSwitchActive ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'
                    )}
                  >
                    {toggleKillSwitch.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : killSwitchActive ? (
                      'Resume Trading'
                    ) : (
                      'ACTIVATE KILL SWITCH'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Trading Mode Controls */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Trading Mode Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Paper Trading Mode</p>
              <p className="text-sm text-muted-foreground">
                Simulate trades without real execution
              </p>
            </div>
            <Switch
              checked={settings?.paper_trading_mode || false}
              onCheckedChange={(checked) => togglePaperTrading.mutate(checked)}
              disabled={isLoading || togglePaperTrading.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Reduce-Only Mode</p>
              <p className="text-sm text-muted-foreground">
                Only allow position-reducing trades
              </p>
            </div>
            <Switch
              checked={settings?.reduce_only_mode || false}
              onCheckedChange={(checked) => toggleReduceOnly.mutate(checked)}
              disabled={isLoading || toggleReduceOnly.isPending}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">DEX Venues Enabled</p>
              <p className="text-sm text-muted-foreground">
                Allow trading on decentralized exchanges
              </p>
            </div>
            <Switch
              checked={settings?.dex_venues_enabled || false}
              disabled={true}
            />
          </div>
        </CardContent>
      </Card>

      {/* Book-Level Controls */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-warning" />
            Book-Level Controls
          </CardTitle>
          <CardDescription>
            Freeze or unfreeze individual trading books
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {books.map((book) => {
              const isFrozen = book.status === 'frozen';
              return (
                <div
                  key={book.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                    isFrozen ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/30 border-border/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={isFrozen ? 'destructive' : 'success'}>
                      {book.type}
                    </Badge>
                    <div>
                      <p className="font-medium">{book.name}</p>
                      <p className="text-sm text-muted-foreground">
                        ${Number(book.capital_allocated).toLocaleString()} allocated
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={isFrozen ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleBookFreeze.mutate({ bookId: book.id, freeze: !isFrozen })}
                    disabled={toggleBookFreeze.isPending}
                  >
                    {isFrozen ? (
                      <>
                        <Play className="mr-1 h-4 w-4" />
                        Unfreeze
                      </>
                    ) : (
                      <>
                        <Pause className="mr-1 h-4 w-4" />
                        Freeze
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
            {books.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No books configured</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
