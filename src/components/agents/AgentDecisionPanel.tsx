/**
 * Agent Decision Panel
 * 
 * Shows the multi-agent system in action.
 * Every agent's role is visible and auditable.
 * 
 * "What is each agent doing right now?"
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Brain,
  Shield,
  Target,
  Zap,
  Scale,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentState {
  id: string;
  name: string;
  role: string;
  icon: React.ReactNode;
  status: 'active' | 'idle' | 'blocked' | 'processing';
  lastDecision?: {
    action: string;
    result: 'allow' | 'block' | 'modify';
    reason?: string;
    timestamp: Date;
  };
  metrics?: {
    label: string;
    value: number;
    max: number;
  };
}

const CANONICAL_AGENTS: AgentState[] = [
  {
    id: 'strategy',
    name: 'Strategy Agents',
    role: 'Propose ideas only — never execute',
    icon: <Brain className="h-5 w-5" />,
    status: 'active',
    lastDecision: {
      action: 'LONG BTC-USDT',
      result: 'allow',
      reason: 'Trend following signal detected',
      timestamp: new Date(Date.now() - 120000),
    },
    metrics: {
      label: 'Active Strategies',
      value: 3,
      max: 8,
    },
  },
  {
    id: 'meta',
    name: 'Meta-Decision Agent',
    role: 'Decides if trading is allowed at all',
    icon: <Activity className="h-5 w-5" />,
    status: 'active',
    lastDecision: {
      action: 'Trading allowed',
      result: 'allow',
      reason: 'Market regime favorable, volatility normal',
      timestamp: new Date(Date.now() - 60000),
    },
    metrics: {
      label: 'Regime Score',
      value: 72,
      max: 100,
    },
  },
  {
    id: 'capital',
    name: 'Capital Allocation Agent',
    role: 'Decides how much risk per strategy',
    icon: <Scale className="h-5 w-5" />,
    status: 'active',
    lastDecision: {
      action: 'Allocated $5,000 to Trend Following',
      result: 'modify',
      reason: 'Reduced from $8,000 due to correlation limits',
      timestamp: new Date(Date.now() - 180000),
    },
    metrics: {
      label: 'Capital Deployed',
      value: 45,
      max: 100,
    },
  },
  {
    id: 'risk',
    name: 'Risk Agent',
    role: 'Decides what is absolutely forbidden',
    icon: <Shield className="h-5 w-5" />,
    status: 'active',
    lastDecision: {
      action: 'Blocked SHORT SOL-USDT',
      result: 'block',
      reason: 'Reduce-only mode active',
      timestamp: new Date(Date.now() - 300000),
    },
    metrics: {
      label: 'Risk Utilization',
      value: 35,
      max: 100,
    },
  },
  {
    id: 'execution',
    name: 'Execution Agent',
    role: 'Executes precisely, or not at all',
    icon: <Zap className="h-5 w-5" />,
    status: 'idle',
    lastDecision: {
      action: 'Executed BTC-USDT LONG',
      result: 'allow',
      reason: 'Filled at $42,150 (0.02% slippage)',
      timestamp: new Date(Date.now() - 150000),
    },
    metrics: {
      label: 'Avg Slippage',
      value: 2,
      max: 25,
    },
  },
];

const SACRED_GATES = [
  'Trading Gate',
  'Risk Agent',
  'Execution Cost Checks',
];

function AgentCard({ agent }: { agent: AgentState }) {
  const statusColors = {
    active: 'bg-success/10 text-success border-success/20',
    idle: 'bg-muted text-muted-foreground border-muted',
    blocked: 'bg-destructive/10 text-destructive border-destructive/20',
    processing: 'bg-primary/10 text-primary border-primary/20',
  };

  const resultColors = {
    allow: 'text-success',
    block: 'text-destructive',
    modify: 'text-warning',
  };

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-card/50 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {agent.icon}
          </div>
          <div>
            <h4 className="font-medium">{agent.name}</h4>
            <p className="text-xs text-muted-foreground">{agent.role}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('capitalize', statusColors[agent.status])}>
          {agent.status}
        </Badge>
      </div>

      {agent.metrics && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{agent.metrics.label}</span>
            <span className="font-mono">
              {agent.metrics.value}{agent.metrics.max === 100 ? '%' : `/${agent.metrics.max}`}
            </span>
          </div>
          <Progress 
            value={(agent.metrics.value / agent.metrics.max) * 100} 
            className="h-1.5" 
          />
        </div>
      )}

      {agent.lastDecision && (
        <div className="pt-2 border-t border-border/30">
          <div className="flex items-center gap-2 text-xs">
            {agent.lastDecision.result === 'allow' && (
              <CheckCircle2 className="h-3 w-3 text-success" />
            )}
            {agent.lastDecision.result === 'block' && (
              <XCircle className="h-3 w-3 text-destructive" />
            )}
            {agent.lastDecision.result === 'modify' && (
              <Target className="h-3 w-3 text-warning" />
            )}
            <span className={cn('font-medium', resultColors[agent.lastDecision.result])}>
              {agent.lastDecision.action}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 pl-5">
            {agent.lastDecision.reason}
          </p>
          <p className="text-xs text-muted-foreground mt-1 pl-5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {agent.lastDecision.timestamp.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

export function AgentDecisionPanel() {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Multi-Agent System
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every agent's role is visible and auditable. No black boxes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Decision Flow */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground overflow-x-auto py-2">
          <Badge variant="outline">Strategy</Badge>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <Badge variant="outline">Meta-Decision</Badge>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <Badge variant="outline">Capital</Badge>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <Badge variant="outline">Risk</Badge>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <Badge variant="outline">Execution</Badge>
        </div>

        <Separator />

        {/* Agent Cards */}
        <div className="space-y-3">
          {CANONICAL_AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        <Separator />

        {/* Sacred Gates */}
        <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-destructive" />
            <span className="font-semibold text-sm">Sacred Gates (Cannot Be Bypassed)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SACRED_GATES.map((gate) => (
              <Badge 
                key={gate} 
                variant="outline" 
                className="bg-destructive/10 text-destructive border-destructive/30"
              >
                {gate}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            No agent — human or machine — may bypass these controls.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
