import { useAgents } from '@/hooks/useAgents';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Bot, Cpu, HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';

const agentTypeIcons: Record<string, string> = {
  'market-data': '📊',
  'strategy': '🧠',
  'execution': '⚡',
  'risk': '🛡️',
  'treasury': '🏦',
  'ops': '🔧',
};

export function AgentStatusGrid() {
  const { data: agents, isLoading } = useAgents();

  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agent Fleet
          </h3>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const onlineCount = agents?.filter(a => a.status === 'online').length || 0;

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <Link to="/agents" className="font-semibold flex items-center gap-2 hover:text-primary transition-colors">
          <Bot className="h-5 w-5 text-primary" />
          Agent Fleet
        </Link>
        <span className="text-xs text-muted-foreground font-mono">
          {onlineCount}/{agents?.length || 0} online
        </span>
      </div>
      {(!agents || agents.length === 0) ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No agents registered
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                'p-3 rounded-lg border transition-all',
                agent.status === 'online'
                  ? 'bg-success/5 border-success/20'
                  : agent.status === 'degraded'
                  ? 'bg-warning/5 border-warning/20'
                  : 'bg-destructive/5 border-destructive/20'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg">{agentTypeIcons[agent.type] || '🤖'}</span>
                <Badge variant={agent.status as 'online' | 'offline' | 'degraded'}>{agent.status}</Badge>
              </div>
              <p className="text-sm font-medium truncate">{agent.name}</p>
              <p className="text-xs text-muted-foreground mb-2">v{agent.version}</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="h-3 w-3 text-muted-foreground" />
                  <Progress value={Number(agent.cpu_usage)} className="h-1 flex-1" />
                  <span className="font-mono w-8 text-right">{Number(agent.cpu_usage).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive className="h-3 w-3 text-muted-foreground" />
                  <Progress value={Number(agent.memory_usage)} className="h-1 flex-1" />
                  <span className="font-mono w-8 text-right">{Number(agent.memory_usage).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
