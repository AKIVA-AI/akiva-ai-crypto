import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { AgentStatusGrid } from '@/components/dashboard/AgentStatusGrid';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { RecentEvents } from '@/components/dashboard/RecentEvents';
import { RiskGauge } from '@/components/dashboard/RiskGauge';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { DollarSign, TrendingUp, Layers, AlertTriangle, Loader2 } from 'lucide-react';

export default function Index() {
  const { data: metrics, isLoading } = useDashboardMetrics();

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Control Center</h1>
            <p className="text-muted-foreground">Real-time overview of your crypto operations</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10 border border-success/20">
            <span className="status-dot status-online" />
            <span className="text-sm font-medium text-success">All Systems Operational</span>
          </div>
        </div>

        {/* Key metrics */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-panel rounded-lg p-4 h-24 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total AUM"
              value={metrics?.totalAum ? `$${(metrics.totalAum / 1000000).toFixed(2)}M` : '$0'}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <MetricCard
              title="Daily P&L"
              value={metrics?.dailyPnl ? `$${metrics.dailyPnl.toLocaleString()}` : '$0'}
              change={metrics?.dailyPnlPercent || 0}
              changeLabel="today"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <MetricCard
              title="Active Strategies"
              value={metrics?.activeStrategies || 0}
              icon={<Layers className="h-5 w-5" />}
            />
            <MetricCard
              title="Active Alerts"
              value={metrics?.alertsActive || 0}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - positions and agents */}
          <div className="lg:col-span-2 space-y-6">
            <PositionsTable />
            <AgentStatusGrid />
          </div>

          {/* Right column - risk and events */}
          <div className="space-y-6">
            {/* Risk overview */}
            <div className="glass-panel rounded-xl p-4">
              <h3 className="font-semibold mb-4">Risk Utilization</h3>
              <RiskGauge value={metrics?.riskUtilization || 0} label="of max exposure" />
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-mono font-bold text-foreground">
                    {metrics?.openPositions || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Open Positions</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-mono font-bold text-foreground">
                    {metrics?.pendingOrders || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending Orders</p>
                </div>
              </div>
            </div>

            <RecentEvents />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
