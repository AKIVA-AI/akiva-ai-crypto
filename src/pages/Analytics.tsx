import { MainLayout } from '@/components/layout/MainLayout';
import { PortfolioAnalyticsPanel } from '@/components/portfolio/PortfolioAnalyticsPanel';
import { BarChart3 } from 'lucide-react';

export default function Analytics() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Portfolio Analytics
          </h1>
          <p className="text-muted-foreground">Performance metrics, exposure analysis, and risk attribution</p>
        </div>

        {/* Analytics Panel */}
        <PortfolioAnalyticsPanel />
      </div>
    </MainLayout>
  );
}
