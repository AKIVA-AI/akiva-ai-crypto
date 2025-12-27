import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AICopilotSidebar } from '@/components/chat/AICopilotSidebar';
import { useAICopilot } from '@/contexts/AICopilotContext';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { isOpen, toggle } = useAICopilot();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          'pl-64 transition-all duration-300',
          isOpen ? 'pr-80' : 'pr-0'
        )}
      >
        <TopBar />
        <main className="p-6">
          {children}
        </main>
      </div>
      <AICopilotSidebar isOpen={isOpen} onToggle={toggle} />
    </div>
  );
}
