import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      // Fetch multiple metrics in parallel
      const [
        positionsResult,
        strategiesResult,
        alertsResult,
        ordersResult,
        booksResult,
      ] = await Promise.all([
        supabase
          .from('positions')
          .select('unrealized_pnl, realized_pnl')
          .eq('is_open', true),
        supabase
          .from('strategies')
          .select('id, status')
          .eq('status', 'live'),
        supabase
          .from('alerts')
          .select('id')
          .eq('is_resolved', false),
        supabase
          .from('orders')
          .select('id')
          .eq('status', 'open'),
        supabase
          .from('books')
          .select('capital_allocated, current_exposure'),
      ]);

      const positions = positionsResult.data || [];
      const strategies = strategiesResult.data || [];
      const alerts = alertsResult.data || [];
      const orders = ordersResult.data || [];
      const books = booksResult.data || [];

      const totalPnl = positions.reduce(
        (sum, p) => sum + Number(p.unrealized_pnl || 0) + Number(p.realized_pnl || 0),
        0
      );

      const totalAum = books.reduce(
        (sum, b) => sum + Number(b.capital_allocated || 0),
        0
      );

      const totalExposure = books.reduce(
        (sum, b) => sum + Number(b.current_exposure || 0),
        0
      );

      const riskUtilization = totalAum > 0 ? (totalExposure / totalAum) * 100 : 0;

      return {
        totalAum,
        dailyPnl: totalPnl,
        dailyPnlPercent: totalAum > 0 ? (totalPnl / totalAum) * 100 : 0,
        openPositions: positions.length,
        activeStrategies: strategies.length,
        pendingOrders: orders.length,
        alertsActive: alerts.length,
        riskUtilization: Math.min(riskUtilization, 100),
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
