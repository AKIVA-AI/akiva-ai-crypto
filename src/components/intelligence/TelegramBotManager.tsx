import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { 
  Send, 
  Bot, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react';

interface TelegramChannel {
  id: string;
  name: string;
  webhook_url: string;
  is_enabled: boolean;
  alert_types: string[];
}

const ALERT_TYPES = [
  { id: 'whale', label: 'Whale Alerts', description: 'Large transaction movements' },
  { id: 'signal', label: 'Trading Signals', description: 'High-confidence signals' },
  { id: 'trigger', label: 'Auto Triggers', description: 'Automated trade triggers' },
  { id: 'risk', label: 'Risk Alerts', description: 'Risk limit breaches' },
];

interface TelegramBotManagerProps {
  compact?: boolean;
}

export function TelegramBotManager({ compact = false }: TelegramBotManagerProps) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [selectedAlertTypes, setSelectedAlertTypes] = useState<string[]>(['whale', 'signal', 'trigger', 'risk']);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-alerts', {
        body: { action: 'get_config' },
      });
      
      if (error) throw error;
      setChannels(data.channels || []);
      
      // If there's a connected channel, update status
      if (data.channels?.length > 0 && data.channels[0].is_enabled) {
        setConnectionStatus('connected');
        const chatIdMatch = data.channels[0].webhook_url.match(/telegram:\/\/(.+)/);
        if (chatIdMatch) {
          setChatId(chatIdMatch[1]);
        }
      }
    } catch (error) {
      console.error('Failed to load Telegram config:', error);
    }
  };

  const testConnection = async () => {
    if (!botToken || !chatId) {
      toast.error('Please enter both bot token and chat ID');
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-alerts', {
        body: { 
          action: 'test_connection',
          botToken,
          chatId,
        },
      });
      
      if (error) throw error;
      
      if (data.success) {
        setConnectionStatus('connected');
        toast.success(data.message);
        
        // Save the configuration
        await saveConfig();
      } else {
        setConnectionStatus('error');
        toast.error(data.message);
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Failed to test connection');
    } finally {
      setIsConnecting(false);
    }
  };

  const saveConfig = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-alerts', {
        body: { 
          action: 'save_config',
          botToken,
          chatId,
          channelId: channels[0]?.id,
        },
      });
      
      if (error) throw error;
      await loadChannels();
      toast.success('Telegram configuration saved');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const sendTestAlert = async () => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-alerts', {
        body: { 
          action: 'send_alert',
          alert: {
            type: 'custom',
            title: 'Test Alert',
            message: 'This is a test alert from your Trading Intelligence System. If you received this, notifications are working correctly!',
            severity: 'info',
            metadata: {
              timestamp: new Date().toISOString(),
              source: 'Manual Test',
            },
          },
        },
      });
      
      if (error) throw error;
      toast.success('Test alert sent to Telegram');
    } catch (error) {
      toast.error('Failed to send test alert. Make sure TELEGRAM_BOT_TOKEN secret is configured.');
    } finally {
      setIsSending(false);
    }
  };

  if (compact) {
    return (
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Telegram Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge className={cn(
              connectionStatus === 'connected' ? 'bg-trading-long/20 text-trading-long' :
              connectionStatus === 'error' ? 'bg-trading-short/20 text-trading-short' :
              'bg-muted text-muted-foreground'
            )}>
              {connectionStatus === 'connected' ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
              ) : connectionStatus === 'error' ? (
                <><XCircle className="h-3 w-3 mr-1" /> Error</>
              ) : (
                'Not configured'
              )}
            </Badge>
          </div>
          {connectionStatus === 'connected' && (
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full h-7 text-xs"
              onClick={sendTestAlert}
              disabled={isSending}
            >
              {isSending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Send Test
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Telegram Bot Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-medium">Connection Status</span>
          </div>
          <Badge className={cn(
            connectionStatus === 'connected' ? 'bg-trading-long/20 text-trading-long' :
            connectionStatus === 'error' ? 'bg-trading-short/20 text-trading-short' :
            'bg-muted text-muted-foreground'
          )}>
            {connectionStatus === 'connected' ? (
              <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
            ) : connectionStatus === 'error' ? (
              <><XCircle className="h-3 w-3 mr-1" /> Connection Failed</>
            ) : (
              'Not Configured'
            )}
          </Badge>
        </div>

        {/* Setup Instructions */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-primary mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Setup Instructions:</strong></p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">@BotFather <ExternalLink className="h-3 w-3" /></a></li>
                <li>Copy the bot token provided</li>
                <li>Start a chat with your bot or add it to a group</li>
                <li>Get your chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">@userinfobot <ExternalLink className="h-3 w-3" /></a></li>
              </ol>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Bot Token</Label>
            <div className="relative">
              <Input 
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Chat ID</Label>
            <Input 
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890 or 123456789"
            />
            <p className="text-xs text-muted-foreground">
              Use negative ID for groups/channels, positive for personal chats
            </p>
          </div>

          <Button 
            onClick={testConnection} 
            disabled={isConnecting || !botToken || !chatId}
            className="w-full gap-2"
          >
            {isConnecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Testing Connection...</>
            ) : (
              <><Bot className="h-4 w-4" /> Test & Save Connection</>
            )}
          </Button>
        </div>

        {/* Alert Type Selection */}
        {connectionStatus === 'connected' && (
          <div className="space-y-3">
            <Label className="text-xs">Alert Types to Receive</Label>
            <div className="space-y-2">
              {ALERT_TYPES.map(alertType => (
                <div 
                  key={alertType.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id={alertType.id}
                      checked={selectedAlertTypes.includes(alertType.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedAlertTypes([...selectedAlertTypes, alertType.id]);
                        } else {
                          setSelectedAlertTypes(selectedAlertTypes.filter(t => t !== alertType.id));
                        }
                      }}
                    />
                    <div>
                      <Label htmlFor={alertType.id} className="text-sm font-medium cursor-pointer">
                        {alertType.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{alertType.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Alert Button */}
        {connectionStatus === 'connected' && (
          <Button 
            variant="outline" 
            onClick={sendTestAlert} 
            disabled={isSending}
            className="w-full gap-2"
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4" /> Send Test Alert</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
