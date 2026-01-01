/**
 * Trade Explainability Panel
 * 
 * "Why Did This Happen?" - The key differentiator
 * 
 * For every trade or non-trade, shows:
 * - Market regime
 * - Strategy intent
 * - Why it was allowed or blocked
 * - Execution cost vs expected edge
 * - Risk checks that passed/failed
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  HelpCircle, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Shield,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Brain,
  Target,
  Scale,
  Zap,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RiskCheck {
  name: string;
  passed: boolean;
  reason?: string;
  value?: string;
  limit?: string;
}

interface TradeDecision {
  id: string;
  timestamp: Date;
  instrument: string;
  direction: 'buy' | 'sell';
  action: 'executed' | 'blocked' | 'modified';
  
  // Strategy context
  strategyName: string;
  strategyConfidence: number;
  signalStrength: number;
  
  // Market regime
  regime: {
    trend: 'bullish' | 'bearish' | 'neutral';
    volatility: 'low' | 'medium' | 'high';
    liquidity: 'low' | 'medium' | 'high';
    overall: 'favorable' | 'unfavorable' | 'neutral';
  };
  
  // Cost analysis
  costs: {
    expectedEdge: number;      // Expected profit in bps
    spreadCost: number;        // Cost of spread in bps
    slippageEstimate: number;  // Expected slippage in bps
    totalCost: number;         // Total cost in bps
    netEdge: number;           // Edge after costs
    costEfficient: boolean;
  };
  
  // Risk checks
  riskChecks: RiskCheck[];
  
  // Final decision
  finalDecision: string;
  decisionReason: string;
}

// Mock data for demonstration
const mockDecision: TradeDecision = {
  id: '1',
  timestamp: new Date(),
  instrument: 'BTC-USDT',
  direction: 'buy',
  action: 'executed',
  strategyName: 'Trend Following',
  strategyConfidence: 0.78,
  signalStrength: 0.65,
  regime: {
    trend: 'bullish',
    volatility: 'medium',
    liquidity: 'high',
    overall: 'favorable',
  },
  costs: {
    expectedEdge: 45,
    spreadCost: 8,
    slippageEstimate: 12,
    totalCost: 20,
    netEdge: 25,
    costEfficient: true,
  },
  riskChecks: [
    { name: 'Kill Switch', passed: true, reason: 'System active' },
    { name: 'Position Size', passed: true, value: '1.5%', limit: '2%' },
    { name: 'Total Exposure', passed: true, value: '8%', limit: '10%' },
    { name: 'Daily Loss', passed: true, value: '0.3%', limit: '2%' },
    { name: 'Execution Cost', passed: true, value: '20 bps', limit: '25 bps' },
    { name: 'Data Quality', passed: true, reason: 'Real-time prices' },
  ],
  finalDecision: 'APPROVED',
  decisionReason: 'All risk checks passed. Market regime favorable. Positive expected edge after costs.',
};

const mockBlockedDecision: TradeDecision = {
  id: '2',
  timestamp: new Date(Date.now() - 300000),
  instrument: 'ETH-USDT',
  direction: 'buy',
  action: 'blocked',
  strategyName: 'Mean Reversion',
  strategyConfidence: 0.52,
  signalStrength: 0.35,
  regime: {
    trend: 'bearish',
    volatility: 'high',
    liquidity: 'low',
    overall: 'unfavorable',
  },
  costs: {
    expectedEdge: 15,
    spreadCost: 25,
    slippageEstimate: 30,
    totalCost: 55,
    netEdge: -40,
    costEfficient: false,
  },
  riskChecks: [
    { name: 'Kill Switch', passed: true, reason: 'System active' },
    { name: 'Position Size', passed: true, value: '1%', limit: '2%' },
    { name: 'Total Exposure', passed: true, value: '5%', limit: '10%' },
    { name: 'Daily Loss', passed: true, value: '0.3%', limit: '2%' },
    { name: 'Execution Cost', passed: false, value: '55 bps', limit: '25 bps', reason: 'Costs exceed expected edge' },
    { name: 'Regime Check', passed: false, reason: 'Unfavorable market conditions' },
  ],
  finalDecision: 'BLOCKED',
  decisionReason: 'Execution costs (55 bps) exceed expected edge (15 bps). Would result in -40 bps net loss. Also: unfavorable market regime with high volatility and low liquidity.',
};

function RegimeBadge({ type, value }: { type: string; value: string }) {
  const colors: Record<string, string> = {
    bullish: 'bg-success/10 text-success border-success/20',
    bearish: 'bg-destructive/10 text-destructive border-destructive/20',
    neutral: 'bg-muted text-muted-foreground',
    low: 'bg-success/10 text-success border-success/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    favorable: 'bg-success/10 text-success border-success/20',
    unfavorable: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', colors[value])}>
      {type}: {value}
    </Badge>
  );
}

function RiskCheckRow({ check }: { check: RiskCheck }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        {check.passed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="text-sm">{check.name}</span>
      </div>
      <div className="text-right text-sm">
        {check.value && check.limit ? (
          <span className={check.passed ? 'text-muted-foreground' : 'text-destructive'}>
            {check.value} / {check.limit}
          </span>
        ) : (
          <span className="text-muted-foreground">{check.reason}</span>
        )}
      </div>
    </div>
  );
}

function DecisionCard({ decision }: { decision: TradeDecision }) {
  const [expanded, setExpanded] = useState(true);
  
  const isExecuted = decision.action === 'executed';
  
  return (
    <Card className={cn(
      'transition-all',
      isExecuted 
        ? 'border-success/30 bg-success/5' 
        : 'border-destructive/30 bg-destructive/5'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge 
              variant={isExecuted ? 'default' : 'destructive'}
              className="uppercase"
            >
              {decision.action}
            </Badge>
            <span className="font-semibold">{decision.instrument}</span>
            <Badge variant="outline" className="capitalize">
              {decision.direction}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-3 w-3" />
          {decision.timestamp.toLocaleTimeString()}
          <span className="mx-1">•</span>
          <Brain className="h-3 w-3" />
          {decision.strategyName}
          <span className="mx-1">•</span>
          Confidence: {(decision.strategyConfidence * 100).toFixed(0)}%
        </p>
      </CardHeader>
      
      {expanded && (
        <CardContent className="space-y-4">
          {/* Market Regime */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Market Regime
            </h4>
            <div className="flex flex-wrap gap-2">
              <RegimeBadge type="Trend" value={decision.regime.trend} />
              <RegimeBadge type="Volatility" value={decision.regime.volatility} />
              <RegimeBadge type="Liquidity" value={decision.regime.liquidity} />
              <RegimeBadge type="Overall" value={decision.regime.overall} />
            </div>
          </div>
          
          <Separator />
          
          {/* Cost Analysis */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Cost vs Edge Analysis
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Expected Edge</p>
                <p className="text-lg font-mono font-semibold text-success">
                  +{decision.costs.expectedEdge} bps
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-mono font-semibold text-destructive">
                  -{decision.costs.totalCost} bps
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Spread + Slippage</p>
                <p className="text-sm font-mono">
                  {decision.costs.spreadCost} + {decision.costs.slippageEstimate} bps
                </p>
              </div>
              <div className={cn(
                'p-3 rounded-lg',
                decision.costs.costEfficient 
                  ? 'bg-success/10 border border-success/20' 
                  : 'bg-destructive/10 border border-destructive/20'
              )}>
                <p className="text-xs text-muted-foreground">Net Edge</p>
                <p className={cn(
                  'text-lg font-mono font-semibold',
                  decision.costs.netEdge >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {decision.costs.netEdge >= 0 ? '+' : ''}{decision.costs.netEdge} bps
                </p>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Risk Checks */}
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Risk Checks ({decision.riskChecks.filter(c => c.passed).length}/{decision.riskChecks.length} passed)
            </h4>
            <div className="space-y-1">
              {decision.riskChecks.map((check, i) => (
                <RiskCheckRow key={i} check={check} />
              ))}
            </div>
          </div>
          
          <Separator />
          
          {/* Final Decision */}
          <div className={cn(
            'p-4 rounded-lg',
            isExecuted 
              ? 'bg-success/10 border border-success/30' 
              : 'bg-destructive/10 border border-destructive/30'
          )}>
            <div className="flex items-center gap-2 mb-2">
              {isExecuted ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-semibold">Decision: {decision.finalDecision}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {decision.decisionReason}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function TradeExplainabilityPanel() {
  const [decisions, setDecisions] = useState<TradeDecision[]>([
    mockDecision,
    mockBlockedDecision,
  ]);
  
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Why Did This Happen?
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Understand every trading decision. No black boxes.
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {decisions.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
