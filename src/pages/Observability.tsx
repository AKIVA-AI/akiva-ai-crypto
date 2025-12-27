import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAgents } from '@/hooks/useAgents';
import { useAlerts } from '@/hooks/useAlerts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Search, Download, AlertTriangle, Info, XCircle, AlertOctagon, RefreshCw, Wifi, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const severityIcons = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

const severityColors = {
  info: 'text-primary',
  warning: 'text-warning',
  critical: 'text-destructive',
};

interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  user_email: string | null;
  severity: 'info' | 'warning' | 'critical';
  before_state: unknown;
  after_state: unknown;
  book_id: string | null;
  ip_address: string | null;
  created_at: string;
}

function useAuditEvents() {
  return useQuery({
    queryKey: ['audit_events', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as AuditEvent[];
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

export default function Observability() {
  const { data: agents } = useAgents();
  const { data: alerts } = useAlerts();
  const { data: events, isLoading: eventsLoading, refetch, isRefetching } = useAuditEvents();
  
  const [filter, setFilter] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);

  const filteredEvents = events?.filter((event) => {
    const matchesSearch = filter === '' || 
      event.action.toLowerCase().includes(filter.toLowerCase()) ||
      event.resource_type.toLowerCase().includes(filter.toLowerCase()) ||
      (event.user_email?.toLowerCase().includes(filter.toLowerCase()) ?? false);
    const matchesSeverity = !selectedSeverity || event.severity === selectedSeverity;
    return matchesSearch && matchesSeverity;
  }) || [];

  const severityCounts = events?.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const onlineAgents = agents?.filter(a => a.status === 'online').length || 0;
  const totalAgents = agents?.length || 0;
  const unresolvedAlerts = alerts?.filter(a => !a.is_resolved).length || 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" />
              Observability
            </h1>
            <p className="text-muted-foreground">Event logs, alerts, and system health monitoring</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Link to="/audit">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Full Audit Log
              </Button>
            </Link>
          </div>
        </div>

        {/* System health */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="h-4 w-4 text-success" />
              <span className="text-sm text-muted-foreground">Agents Online</span>
            </div>
            <p className="text-2xl font-mono font-semibold text-success">
              {onlineAgents}/{totalAgents}
            </p>
          </div>
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Audit Events</span>
            </div>
            <p className="text-2xl font-mono font-semibold">{events?.length || 0}</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-4 w-4 text-warning" />
              <span className="text-sm text-muted-foreground">Active Alerts</span>
            </div>
            <p className={cn(
              "text-2xl font-mono font-semibold",
              unresolvedAlerts > 0 && "text-warning"
            )}>
              {unresolvedAlerts}
            </p>
          </div>
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm text-muted-foreground">Warnings</span>
            </div>
            <p className="text-2xl font-mono font-semibold text-warning">{severityCounts.warning || 0}</p>
          </div>
          <div className="metric-card">
            <div className="flex items-center gap-2 mb-2">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Critical</span>
            </div>
            <p className="text-2xl font-mono font-semibold text-destructive">{severityCounts.critical || 0}</p>
          </div>
        </div>

        {/* Event log */}
        <div className="glass-panel rounded-xl p-4">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
            <div className="flex items-center gap-2">
              {(['info', 'warning', 'critical'] as const).map((severity) => (
                <Button
                  key={severity}
                  variant={selectedSeverity === severity ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSeverity(selectedSeverity === severity ? null : severity)}
                  className={cn(
                    'capitalize',
                    selectedSeverity === severity && severityColors[severity]
                  )}
                >
                  {severity}
                  {severityCounts[severity] && (
                    <span className="ml-1 text-xs">({severityCounts[severity]})</span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No audit events yet</p>
              <p className="text-sm">Events will appear here when actions are performed in the system.</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredEvents.map((event) => {
                const Icon = severityIcons[event.severity];
                return (
                  <div
                    key={event.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-muted/30 font-mono text-sm',
                      event.severity === 'critical' && 'bg-destructive/5 border-l-2 border-destructive',
                      event.severity === 'warning' && 'bg-warning/5'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', severityColors[event.severity])} />
                    <span className="text-muted-foreground w-20 flex-shrink-0">
                      {format(new Date(event.created_at), 'HH:mm:ss')}
                    </span>
                    <Badge variant={event.severity} className="flex-shrink-0">
                      {event.severity}
                    </Badge>
                    <span className="px-2 py-0.5 rounded bg-muted text-xs flex-shrink-0 capitalize">
                      {event.resource_type}
                    </span>
                    <span className="font-medium flex-shrink-0">{event.action}</span>
                    <span className="text-muted-foreground truncate flex-1">
                      {event.resource_id ? `ID: ${event.resource_id.substring(0, 8)}...` : ''}
                    </span>
                    <span className="text-muted-foreground text-xs flex-shrink-0">
                      {event.user_email || 'System'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {filteredEvents.length} of {events?.length || 0} events</span>
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
              <span>Auto-refresh enabled (5s)</span>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
