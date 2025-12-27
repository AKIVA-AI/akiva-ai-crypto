import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { RealtimePayload, AlertPayload, VenuePayload, BookPayload, StrategyPayload, OrderPayload, MemeMetricsPayload } from '@/types';

interface UseRealtimeOptions<T = Record<string, unknown>> {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
  onInsert?: (payload: RealtimePayload<T>) => void;
  onUpdate?: (payload: RealtimePayload<T>) => void;
  onDelete?: (payload: RealtimePayload<T>) => void;
  invalidateQueries?: string[];
}

export function useRealtimeSubscription<T = Record<string, unknown>>({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  invalidateQueries = [],
}: UseRealtimeOptions<T>) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = `realtime-${table}-${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as 'system',
        {
          event,
          schema: 'public',
          table,
        } as Parameters<typeof channel.on>[1],
        (payload: unknown) => {
          const typedPayload = payload as RealtimePayload<T>;
          console.log(`[Realtime] ${table}:`, typedPayload.eventType, typedPayload);

          // Invalidate queries
          invalidateQueries.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });

          // Call specific handlers
          if (typedPayload.eventType === 'INSERT') {
            onInsert?.(typedPayload);
          } else if (typedPayload.eventType === 'UPDATE') {
            onUpdate?.(typedPayload);
          } else if (typedPayload.eventType === 'DELETE') {
            onDelete?.(typedPayload);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] ${table} subscription:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, queryClient]);
}

// Venue Health Realtime
export function useVenueHealthRealtime() {
  const queryClient = useQueryClient();

  useRealtimeSubscription<VenuePayload>({
    table: 'venue_health',
    invalidateQueries: ['venues', 'venue-health'],
    onInsert: (payload) => {
      const status = payload.new?.status;
      if (status === 'degraded' || status === 'offline') {
        toast.warning(`Venue health alert: ${status.toUpperCase()}`);
      }
    },
  });

  useRealtimeSubscription<VenuePayload>({
    table: 'venues',
    invalidateQueries: ['venues'],
    onUpdate: (payload) => {
      const oldStatus = (payload.old as VenuePayload | null)?.status;
      if (payload.new?.status !== oldStatus) {
        const name = payload.new?.name || 'Unknown venue';
        const status = payload.new?.status;
        if (status === 'offline') {
          toast.error(`🔴 ${name} is DOWN`);
        } else if (status === 'degraded') {
          toast.warning(`🟡 ${name} is DEGRADED`);
        } else if (status === 'healthy' && oldStatus !== 'healthy') {
          toast.success(`🟢 ${name} is back HEALTHY`);
        }
      }
    },
  });
}

// Alerts Realtime
export function useAlertsRealtime() {
  useRealtimeSubscription<AlertPayload>({
    table: 'alerts',
    event: 'INSERT',
    invalidateQueries: ['alerts', 'unread-alerts'],
    onInsert: (payload) => {
      const alert = payload.new;
      const severity = alert?.severity || 'info';
      const title = alert?.title || 'New Alert';
      
      switch (severity) {
        case 'critical':
          toast.error(`🚨 ${title}`, { duration: 10000 });
          break;
        case 'warning':
          toast.warning(title, { duration: 5000 });
          break;
        default:
          toast.info(title);
      }
    },
  });
}

// Positions Realtime
export function usePositionsRealtime() {
  useRealtimeSubscription({
    table: 'positions',
    invalidateQueries: ['positions', 'dashboard-metrics'],
  });
}

// Orders Realtime
export function useOrdersRealtime() {
  useRealtimeSubscription<OrderPayload>({
    table: 'orders',
    invalidateQueries: ['orders', 'pending-orders'],
    onInsert: (payload) => {
      const order = payload.new;
      if (order?.status === 'filled') {
        toast.success(`Order filled: ${order.instrument} ${order.side}`);
      }
    },
    onUpdate: (payload) => {
      const order = payload.new;
      const oldOrder = payload.old as OrderPayload | null;
      if (order?.status === 'filled' && oldOrder?.status !== 'filled') {
        toast.success(`Order filled: ${order.instrument}`);
      } else if (order?.status === 'rejected') {
        toast.error(`Order rejected: ${order.instrument}`);
      }
    },
  });
}

// Meme Metrics Realtime
export function useMemeMetricsRealtime() {
  useRealtimeSubscription<MemeMetricsPayload>({
    table: 'meme_metrics',
    invalidateQueries: ['meme-metrics', 'meme-projects'],
    onInsert: (payload) => {
      const metrics = payload.new;
      if (metrics && metrics.liquidity_health < 30) {
        toast.error(`⚠️ Critical liquidity on meme project`);
      }
    },
  });
}

// Books Realtime
export function useBooksRealtime() {
  useRealtimeSubscription<BookPayload>({
    table: 'books',
    invalidateQueries: ['books', 'dashboard-metrics'],
    onUpdate: (payload) => {
      const book = payload.new;
      const oldBook = payload.old as BookPayload | null;
      if (book?.status === 'frozen' && oldBook?.status !== 'frozen') {
        toast.error(`📕 Book "${book.name}" HALTED`);
      } else if (book?.status === 'active' && oldBook?.status === 'frozen') {
        toast.success(`📗 Book "${book.name}" resumed`);
      }
    },
  });
}

// Strategies Realtime
export function useStrategiesRealtime() {
  useRealtimeSubscription<StrategyPayload>({
    table: 'strategies',
    invalidateQueries: ['strategies', 'active-strategies'],
    onUpdate: (payload) => {
      const strategy = payload.new;
      const oldStrategy = payload.old as StrategyPayload | null;
      if (strategy?.status !== oldStrategy?.status) {
        const statusEmoji = strategy?.status === 'live' ? '🟢' : strategy?.status === 'paper' ? '🟡' : '⚫';
        toast.info(`${statusEmoji} Strategy "${strategy?.name}" → ${strategy?.status?.toUpperCase()}`);
      }
    },
  });
}

// Combined hook for dashboard
export function useDashboardRealtime() {
  useVenueHealthRealtime();
  useAlertsRealtime();
  usePositionsRealtime();
  useOrdersRealtime();
  useBooksRealtime();
  useStrategiesRealtime();
}
