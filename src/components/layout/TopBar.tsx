import { Bell, Search, Wifi, AlertOctagon, Server, ChevronDown, AlertTriangle, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState, useEffect } from 'react';
import { useBooks } from '@/hooks/useBooks';
import { useGlobalSettings } from '@/hooks/useControlPlane';
import { useVenues } from '@/hooks/useVenues';
import { useUnreadAlertsCount, useAlerts } from '@/hooks/useAlerts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { WalletButton } from '@/components/wallet/WalletButton';
import { TradingModeSelector } from '@/components/settings/TradingModeSelector';

export function TopBar() {
  const [time, setTime] = useState(new Date());
  
  const { data: globalSettings } = useGlobalSettings();
  const { data: books = [] } = useBooks();
  const { data: venues = [] } = useVenues();
  const { data: unreadCount = 0 } = useUnreadAlertsCount();
  const { data: recentAlerts = [] } = useAlerts(5);
  
  const [activeBookId, setActiveBookId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (books.length > 0 && !activeBookId) {
      setActiveBookId(books[0].id);
    }
  }, [books, activeBookId]);

  const activeBook = books.find(b => b.id === activeBookId);
  
  // Calculate venue health
  const healthyVenues = venues.filter(v => v.status === 'healthy').length;
  const degradedVenues = venues.filter(v => v.status === 'degraded').length;
  const offlineVenues = venues.filter(v => v.status === 'offline').length;
  
  const isKillSwitchActive = globalSettings?.global_kill_switch ?? false;
  const isReduceOnly = globalSettings?.reduce_only_mode ?? false;
  const isPaperMode = globalSettings?.paper_trading_mode ?? false;

  const getBookTypeColor = (type: string) => {
    switch (type) {
      case 'HEDGE': return 'bg-primary/20 text-primary border-primary/30';
      case 'PROP': return 'bg-chart-3/20 text-chart-3 border-chart-3/30';
      case 'MEME': return 'bg-chart-4/20 text-chart-4 border-chart-4/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex h-full items-center justify-between px-6">
        {/* Left side - Book selector and status */}
        <div className="flex items-center gap-4">
          {/* Book Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 min-w-[160px]">
                {activeBook ? (
                  <>
                    <Badge variant="outline" className={cn('text-xs', getBookTypeColor(activeBook.type))}>
                      {activeBook.type}
                    </Badge>
                    <span className="font-medium">{activeBook.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select Book</span>
                )}
                <ChevronDown className="h-4 w-4 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Trading Books</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {books.map((book) => (
                <DropdownMenuItem
                  key={book.id}
                  onClick={() => setActiveBookId(book.id)}
                  className="gap-2"
                >
                  <Badge variant="outline" className={cn('text-xs', getBookTypeColor(book.type))}>
                    {book.type}
                  </Badge>
                  <span>{book.name}</span>
                  {book.status === 'frozen' && (
                    <Badge variant="destructive" className="ml-auto text-xs">FROZEN</Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Kill Switch Indicator */}
          {isKillSwitchActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/20 border border-destructive/50 animate-pulse">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              <span className="text-xs font-bold text-destructive uppercase">Kill Switch Active</span>
            </div>
          )}

          {/* Reduce Only Mode */}
          {isReduceOnly && !isKillSwitchActive && (
            <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Reduce Only
            </Badge>
          )}

          {/* System Mode Indicator - Always show simulation status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-warning">SIMULATION MODE</span>
          </div>
        </div>

        {/* Center - Search */}
        <div className="relative w-96 hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents, strategies, positions..."
            className="pl-10 bg-muted/50 border-muted focus:border-primary"
          />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Trading Mode Selector */}
          <TradingModeSelector />

          {/* Venue Health */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className={cn(
                  "gap-2 px-3",
                  offlineVenues > 0 && "text-destructive",
                  degradedVenues > 0 && offlineVenues === 0 && "text-warning"
                )}
              >
                <Server className="h-4 w-4" />
                <span className="text-xs font-mono">
                  {healthyVenues}/{venues.length}
                </span>
                {(offlineVenues > 0 || degradedVenues > 0) && (
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Venue Health
                </h4>
                <div className="space-y-2">
                  {venues.map((venue) => (
                    <div key={venue.id} className="flex items-center justify-between text-sm">
                      <span>{venue.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {venue.latency_ms}ms
                        </span>
                        <span className={cn(
                          "h-2 w-2 rounded-full",
                          venue.status === 'healthy' && "bg-success",
                          venue.status === 'degraded' && "bg-warning",
                          venue.status === 'offline' && "bg-destructive"
                        )} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Wallet Connection */}
          <WalletButton />

          {/* Connection status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
            <Wifi className="h-4 w-4 text-success" />
            <span className="text-xs font-medium text-success">Feed</span>
          </div>

          {/* Time */}
          <div className="font-mono text-sm text-muted-foreground hidden md:block">
            {time.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })}
            <span className="text-xs ml-1">UTC</span>
          </div>

          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Recent Alerts</h4>
                  <Badge variant="secondary" className="text-xs">
                    {unreadCount} unread
                  </Badge>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentAlerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No recent alerts</p>
                  ) : (
                    recentAlerts.map((alert) => (
                      <div 
                        key={alert.id} 
                        className={cn(
                          "p-2 rounded-lg text-sm",
                          !alert.is_read && "bg-muted/50",
                          alert.severity === 'critical' && "border-l-2 border-destructive",
                          alert.severity === 'warning' && "border-l-2 border-warning"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-medium">{alert.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(alert.created_at), 'HH:mm')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
