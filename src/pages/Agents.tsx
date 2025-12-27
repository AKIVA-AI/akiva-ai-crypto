import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAgents, useUpdateAgentStatus } from '@/hooks/useAgents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { Bot, RefreshCw, Power, Settings, Cpu, HardDrive, Clock, Zap, Loader2, Info, Shield, Brain, Activity, Wallet, Wrench, Eye, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { AGENT_ROLES, AgentRole, getAgentStatusColor } from '@/lib/agentRoles';

const agentTypeLabels: Record<string, string> = {
  'market-data': 'Market Data',
  'strategy': 'Strategy',
  'execution': 'Execution',
  'risk': 'Risk Management',
  'treasury': 'Treasury',
  'ops': 'Operations',
  'intelligence': 'Intelligence',
  'reconciliation': 'Reconciliation',
};

const agentTypeColors: Record<string, string> = {
  'market-data': 'bg-chart-1/20 text-chart-1',
  'strategy': 'bg-chart-2/20 text-chart-2',
  'execution': 'bg-chart-3/20 text-chart-3',
  'risk': 'bg-chart-4/20 text-chart-4',
  'treasury': 'bg-chart-5/20 text-chart-5',
  'ops': 'bg-primary/20 text-primary',
  'intelligence': 'bg-accent/20 text-accent-foreground',
  'reconciliation': 'bg-secondary/20 text-secondary-foreground',
};

const agentIcons: Record<string, React.ReactNode> = {
  'market-data': <Activity className="h-5 w-5" />,
  'strategy': <Brain className="h-5 w-5" />,
  'execution': <Zap className="h-5 w-5" />,
  'risk': <Shield className="h-5 w-5" />,
  'treasury': <Wallet className="h-5 w-5" />,
  'ops': <Wrench className="h-5 w-5" />,
  'intelligence': <Eye className="h-5 w-5" />,
  'reconciliation': <FileText className="h-5 w-5" />,
};

export default function Agents() {
  const { data: agents, isLoading, refetch, isRefetching } = useAgents();
  const updateStatus = useUpdateAgentStatus();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<AgentRole | null>(null);
  const [tab, setTab] = useState<'registry' | 'roles'>('registry');

  const handleRefresh = () => {
    refetch();
  };

  const toggleAgentPower = async (agentId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'online' ? 'offline' : 'online';
    await updateStatus.mutateAsync({ id: agentId, status: newStatus });
  };

  const onlineCount = agents?.filter(a => a.status === 'online').length || 0;
  const totalCount = agents?.length || 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-7 w-7 text-primary" />
              Agent Registry
            </h1>
            <p className="text-muted-foreground">
              Monitor and manage your autonomous agents 
              <span className="ml-2 text-sm">
                ({onlineCount}/{totalCount} online)
              </span>
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={isRefetching}>
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh Status
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'registry' | 'roles')}>
          <TabsList>
            <TabsTrigger value="registry">Live Agents</TabsTrigger>
            <TabsTrigger value="roles">Agent Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="registry" className="mt-6">
            {/* Agent cards */}
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="glass-panel rounded-xl p-6">
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-32 mb-4" />
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      {[1, 2, 3, 4].map((j) => (
                        <Skeleton key={j} className="h-16" />
                      ))}
                    </div>
                    <Skeleton className="h-2 w-full mb-2" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : agents?.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Agents Registered</h3>
                <p className="text-muted-foreground">
                  Agents will appear here once they connect to the system.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {agents?.map((agent) => {
                  const role = AGENT_ROLES[agent.type];
                  return (
                    <div
                      key={agent.id}
                      className={cn(
                        'glass-panel rounded-xl p-6 transition-all hover:border-primary/30',
                        agent.status === 'online' && 'border-success/20',
                        agent.status === 'degraded' && 'border-warning/20',
                        agent.status === 'offline' && 'border-destructive/20'
                      )}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">{agent.name}</h3>
                            <Badge variant={agent.status as 'online' | 'offline' | 'degraded'}>{agent.status}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1', agentTypeColors[agent.type])}>
                              {agentIcons[agent.type]}
                              {agentTypeLabels[agent.type] || agent.type}
                            </span>
                            <span className="text-sm text-muted-foreground">v{agent.version}</span>
                            {role && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 gap-1 text-xs"
                                onClick={() => setSelectedRole(role)}
                              >
                                <Info className="h-3 w-3" />
                                Role Info
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn(
                              'h-8 w-8',
                              agent.status === 'online' ? 'text-success hover:text-destructive' : 'text-muted-foreground hover:text-success'
                            )}
                            onClick={() => toggleAgentPower(agent.id, agent.status)}
                            disabled={updateStatus.isPending}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Description */}
                      {role && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{role.description}</p>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Uptime</p>
                          <p className="font-mono font-medium">{Number(agent.uptime).toFixed(1)}%</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Cpu className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">CPU</p>
                          <p className="font-mono font-medium">{Number(agent.cpu_usage).toFixed(0)}%</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <HardDrive className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Memory</p>
                          <p className="font-mono font-medium">{Number(agent.memory_usage).toFixed(0)}%</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-muted/50">
                          <Zap className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Heartbeat</p>
                          <p className="font-mono font-medium text-xs">
                            {formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: false })}
                          </p>
                        </div>
                      </div>

                      {/* Resource bars */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-12">CPU</span>
                          <Progress value={Number(agent.cpu_usage)} className="h-2 flex-1" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-12">MEM</span>
                          <Progress value={Number(agent.memory_usage)} className="h-2 flex-1" />
                        </div>
                      </div>

                      {/* Capabilities */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Capabilities</p>
                        <div className="flex flex-wrap gap-1">
                          {agent.capabilities?.map((cap) => (
                            <span
                              key={cap}
                              className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Error message if degraded/offline */}
                      {agent.error_message && (
                        <div className="mt-4 p-2 rounded bg-destructive/10 border border-destructive/20">
                          <p className="text-xs text-destructive">{agent.error_message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="roles" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.values(AGENT_ROLES).map((role) => (
                <div
                  key={role.type}
                  className={cn(
                    'glass-panel rounded-xl p-5 cursor-pointer transition-all hover:border-primary/30 hover:scale-[1.02]',
                    role.status === 'critical' && 'border-l-4 border-l-destructive',
                    role.status === 'important' && 'border-l-4 border-l-warning',
                    role.status === 'support' && 'border-l-4 border-l-muted-foreground'
                  )}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{role.icon}</span>
                    <div>
                      <h3 className="font-semibold">{role.name}</h3>
                      <Badge 
                        variant="outline" 
                        className={cn('text-xs', getAgentStatusColor(role.status))}
                      >
                        {role.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{role.description}</p>
                  <div className="flex items-center text-xs text-primary">
                    View details <ChevronRight className="h-3 w-3 ml-1" />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Role Detail Dialog */}
        <Dialog open={!!selectedRole} onOpenChange={() => setSelectedRole(null)}>
          <DialogContent className="max-w-2xl">
            {selectedRole && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <span className="text-3xl">{selectedRole.icon}</span>
                    {selectedRole.name}
                    <Badge 
                      variant="outline" 
                      className={cn('ml-2', getAgentStatusColor(selectedRole.status))}
                    >
                      {selectedRole.status}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>{selectedRole.description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Responsibilities
                    </h4>
                    <ul className="space-y-2">
                      {selectedRole.responsibilities.map((resp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          {resp}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      Interacts With
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedRole.interactions.map((interaction, i) => (
                        <Badge key={i} variant="secondary">{interaction}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
