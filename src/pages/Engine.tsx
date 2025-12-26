import { MainLayout } from '@/components/layout/MainLayout';
import { EngineStatusPanel } from '@/components/engine/EngineStatusPanel';
import { BookControlPanel } from '@/components/engine/BookControlPanel';
import { SignalsTable } from '@/components/engine/SignalsTable';
import { IntentsTable } from '@/components/engine/IntentsTable';
import { Cpu } from 'lucide-react';

export default function Engine() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="h-7 w-7 text-primary" />
            Engine Control Panel
          </h1>
          <p className="text-muted-foreground">Monitor and control the trading engine</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <EngineStatusPanel />
          <div className="lg:col-span-2">
            <BookControlPanel />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SignalsTable limit={15} />
          <IntentsTable limit={15} />
        </div>
      </div>
    </MainLayout>
  );
}
