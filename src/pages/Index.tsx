import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { RecentEvents } from '@/components/dashboard/RecentEvents';
import { RiskGauge } from '@/components/dashboard/RiskGauge';
import { PnLChart } from '@/components/dashboard/PnLChart';
import { OpportunityScannerPanel } from '@/components/intelligence/OpportunityScannerPanel';
import { WhyNoTradeAccordion } from '@/components/dashboard/WhyNoTradeAccordion';
import { SystemStatusBanner } from '@/components/dashboard/SystemStatusBanner';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useDashboardRealtime } from '@/hooks/useRealtimeSubscriptions';
import { useTradingShortcuts } from '@/hooks/useTradingShortcuts';
import { useIsMobile } from '@/hooks/use-mobile';
import { DollarSign, TrendingUp, Layers, AlertTriangle, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Index() {
  const { data: metrics, isLoading } = useDashboardMetrics();
  const isMobile = useIsMobile();
  
  useDashboardRealtime();
  useTradingShortcuts();

  if (isMobile) {
    return <MobileDashboard />;
  }

  const dailyPnl = metrics?.dailyPnl || 0;
  const dailyPnlPositive = dailyPnl >= 0;

  return (
    <MainLayout>
      {/* Full viewport cockpit — no scroll */}
      <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
        
        {/* ── TOP BAR: Status + KPIs ── */}
        <div className="flex-none border-b border-border/50 bg-card/30 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-2">
            <SystemStatusBanner />
            
            <div className="h-6 w-px bg-border/50 mx-1" />
            
            {/* Inline KPIs */}
            {isLoading ? (
              <div className="flex items-center gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <div className="h-4 w-16 bg-muted/50 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-6 flex-1 overflow-x-auto">
                <KpiPill
                  label="AUM"
                  value={metrics?.totalAum ? `$${(metrics.totalAum / 1e6).toFixed(2)}M` : '$0'}
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                />
                <KpiPill
                  label="Day P&L"
                  value={`${dailyPnlPositive ? '+' : ''}$${dailyPnl.toLocaleString()}`}
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  variant={dailyPnlPositive ? 'success' : 'danger'}
                  sub={metrics?.dailyPnlPercent ? `${metrics.dailyPnlPercent >= 0 ? '+' : ''}${metrics.dailyPnlPercent.toFixed(2)}%` : undefined}
                />
                <KpiPill
                  label="Strategies"
                  value={String(metrics?.activeStrategies || 0)}
                  icon={<Layers className="h-3.5 w-3.5" />}
                />
                <KpiPill
                  label="Risk"
                  value={`${metrics?.riskUtilization?.toFixed(0) || 0}%`}
                  icon={<Shield className="h-3.5 w-3.5" />}
                  variant={(metrics?.riskUtilization || 0) > 80 ? 'danger' : (metrics?.riskUtilization || 0) > 50 ? 'warning' : 'success'}
                />
                <KpiPill
                  label="Alerts"
                  value={String(metrics?.alertsActive || 0)}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  variant={(metrics?.alertsActive || 0) > 0 ? 'warning' : 'default'}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN COCKPIT GRID ── */}
        <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden min-h-0">
          
          {/* LEFT: P&L + Positions (8 cols) */}
          <div className="col-span-8 flex flex-col border-r border-border/30 min-h-0">
            
            {/* P&L Chart — compact */}
            <div className="flex-none h-[200px] border-b border-border/30 p-3 overflow-hidden">
              <PnLChart />
            </div>
            
            {/* Positions Table — fills remaining space */}
            <div className="flex-1 overflow-auto p-3 min-h-0">
              <PositionsTable />
            </div>
          </div>

          {/* RIGHT: Risk sidebar (4 cols) */}
          <div className="col-span-4 flex flex-col overflow-auto min-h-0">
            
            {/* Risk Gauge — compact */}
            <div className="flex-none p-3 border-b border-border/30">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <RiskGauge value={metrics?.riskUtilization || 0} label="of max exposure" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/30">
                    <p className="text-lg font-mono font-bold">{metrics?.openPositions || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Positions</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/30">
                    <p className="text-lg font-mono font-bold">{metrics?.pendingOrders || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Why No Trade — accordion */}
            <div className="flex-none border-b border-border/30">
              <WhyNoTradeAccordion />
            </div>

            {/* Opportunity Scanner — compact */}
            <div className="flex-none border-b border-border/30 p-3">
              <OpportunityScannerPanel compact />
            </div>

            {/* Recent Events — fills remaining */}
            <div className="flex-1 overflow-auto p-3 min-h-0">
              <RecentEvents />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

/* ── Inline KPI Pill ── */
function KpiPill({ 
  label, value, icon, variant = 'default', sub 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode; 
  variant?: 'default' | 'success' | 'warning' | 'danger';
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn(
        'p-1 rounded',
        variant === 'success' && 'text-success bg-success/10',
        variant === 'warning' && 'text-warning bg-warning/10',
        variant === 'danger' && 'text-destructive bg-destructive/10',
        variant === 'default' && 'text-muted-foreground bg-muted/30',
      )}>
        {icon}
      </span>
      <div className="leading-none">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn(
          'text-sm font-mono font-bold',
          variant === 'success' && 'text-success',
          variant === 'danger' && 'text-destructive',
          variant === 'warning' && 'text-warning',
        )}>
          {value}
          {sub && <span className="ml-1 text-[10px] font-normal">{sub}</span>}
        </p>
      </div>
    </div>
  );
}
