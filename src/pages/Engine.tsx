import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { EngineStatusPanel } from '@/components/engine/EngineStatusPanel';
import { BookControlPanel } from '@/components/engine/BookControlPanel';
import { SignalsTable } from '@/components/engine/SignalsTable';
import { IntentsTable } from '@/components/engine/IntentsTable';
import { SignalAnalysisPanel } from '@/components/ai/SignalAnalysisPanel';
import { Cpu, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export default function Engine() {
  const [selectedSignalId, setSelectedSignalId] = useState<string | undefined>();
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | undefined>();
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className="h-7 w-7 text-primary" />
              Engine Control Panel
            </h1>
            <p className="text-muted-foreground">Monitor and control the trading engine</p>
          </div>
          <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Brain className="h-4 w-4" />
                AI Analysis
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] p-0">
              <SignalAnalysisPanel
                signalId={selectedSignalId}
                strategyId={selectedStrategyId}
                onClose={() => setAiPanelOpen(false)}
              />
            </SheetContent>
          </Sheet>
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
