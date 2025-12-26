import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Send, 
  Loader2,
  MessageSquare,
  Hash,
  Webhook,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationChannel {
  id: string;
  name: string;
  type: 'telegram' | 'discord' | 'slack' | 'webhook';
  webhook_url: string;
  is_enabled: boolean;
  alert_types: string[];
  created_at: string;
}

const channelIcons: Record<string, React.ReactNode> = {
  telegram: <Send className="h-4 w-4" />,
  discord: <Hash className="h-4 w-4" />,
  slack: <MessageSquare className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
};

const channelColors: Record<string, string> = {
  telegram: 'bg-blue-500/20 text-blue-400',
  discord: 'bg-indigo-500/20 text-indigo-400',
  slack: 'bg-purple-500/20 text-purple-400',
  webhook: 'bg-gray-500/20 text-gray-400',
};

export function NotificationChannelManager() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'discord' as NotificationChannel['type'],
    webhook_url: '',
    alert_types: ['critical', 'warning'] as string[],
  });

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_channels')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as NotificationChannel[];
    },
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['notification-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*, channel:notification_channels(name)')
        .order('sent_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  const addChannel = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('notification_channels')
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Channel added');
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      setIsAddOpen(false);
      setFormData({ name: '', type: 'discord', webhook_url: '', alert_types: ['critical', 'warning'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleChannel = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-channels'] }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Channel deleted');
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testChannel = useMutation({
    mutationFn: async (channel: NotificationChannel) => {
      const { error } = await supabase.functions.invoke('send-alert-notification', {
        body: {
          alertId: 'test-' + Date.now(),
          title: 'Test Alert',
          message: 'This is a test notification from your trading dashboard.',
          severity: 'info',
          source: 'Test',
          channelId: channel.id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Test notification sent'),
    onError: (err: Error) => toast.error(`Failed to send: ${err.message}`),
  });

  const handleAlertTypeToggle = (type: string) => {
    setFormData(prev => ({
      ...prev,
      alert_types: prev.alert_types.includes(type)
        ? prev.alert_types.filter(t => t !== type)
        : [...prev.alert_types, type],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Channels
            </CardTitle>
            <CardDescription>
              Configure webhooks for Telegram, Discord, and Slack alerts
            </CardDescription>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Notification Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Channel Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., Trading Alerts"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v: NotificationChannel['type']) => setFormData(p => ({ ...p, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discord">Discord</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="slack">Slack</SelectItem>
                      <SelectItem value="webhook">Generic Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <Input
                    value={formData.webhook_url}
                    onChange={(e) => setFormData(p => ({ ...p, webhook_url: e.target.value }))}
                    placeholder={
                      formData.type === 'discord' 
                        ? 'https://discord.com/api/webhooks/...'
                        : formData.type === 'telegram'
                        ? 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>'
                        : 'https://hooks.slack.com/services/...'
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alert Types</Label>
                  <div className="flex items-center gap-4">
                    {['critical', 'warning', 'info'].map(type => (
                      <div key={type} className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.alert_types.includes(type)}
                          onCheckedChange={() => handleAlertTypeToggle(type)}
                        />
                        <span className="text-sm capitalize">{type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button 
                  onClick={() => addChannel.mutate(formData)}
                  disabled={!formData.name || !formData.webhook_url || addChannel.isPending}
                >
                  {addChannel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Channel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No notification channels configured</p>
            <p className="text-sm">Add a webhook to receive alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map(channel => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-lg', channelColors[channel.type])}>
                    {channelIcons[channel.type]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{channel.name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {channel.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {channel.alert_types.map(type => (
                        <Badge 
                          key={type}
                          variant="secondary" 
                          className={cn(
                            'text-[10px]',
                            type === 'critical' && 'bg-destructive/20 text-destructive',
                            type === 'warning' && 'bg-warning/20 text-warning',
                          )}
                        >
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => testChannel.mutate(channel)}
                    disabled={testChannel.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={channel.is_enabled}
                    onCheckedChange={(checked) => toggleChannel.mutate({ id: channel.id, is_enabled: checked })}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Channel</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the "{channel.name}" channel.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteChannel.mutate(channel.id)}
                          className="bg-destructive"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Logs */}
        {recentLogs.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Recent Notifications</h4>
            <div className="space-y-2">
              {recentLogs.slice(0, 5).map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {log.status === 'sent' ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span>{log.channel?.name || 'Unknown'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.sent_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
