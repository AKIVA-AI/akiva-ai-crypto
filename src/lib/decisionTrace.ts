/**
 * Decision Trace Engine
 * 
 * The backbone of radical transparency.
 * Every action or inaction produces a trace that can be:
 * - logged
 * - displayed in UI
 * - queried via API
 * - used for education
 * 
 * "I understand why the system didn't trade—and I agree with it."
 */

export type DecisionOutcome = 'EXECUTED' | 'BLOCKED' | 'MODIFIED' | 'PENDING';

export type GateType = 
  | 'META_DECISION_AGENT'
  | 'RISK_AGENT'
  | 'EXECUTION_COST_GATE'
  | 'CAPITAL_ALLOCATION_AGENT'
  | 'TRADING_GATE'
  | 'DATA_QUALITY_GATE'
  | 'REGIME_FILTER'
  | 'KILL_SWITCH'
  | 'REDUCE_ONLY';

export type BlockReason =
  | 'KILL_SWITCH_ACTIVE'
  | 'REDUCE_ONLY_ACTIVE'
  | 'VOLATILITY_REGIME_HIGH'
  | 'EXPECTED_EDGE_NEGATIVE'
  | 'EXECUTION_COST_EXCEEDS_EDGE'
  | 'DATA_QUALITY_INSUFFICIENT'
  | 'POSITION_LIMIT_EXCEEDED'
  | 'EXPOSURE_LIMIT_EXCEEDED'
  | 'DAILY_LOSS_LIMIT_EXCEEDED'
  | 'LIQUIDITY_INSUFFICIENT'
  | 'CONFIDENCE_TOO_LOW'
  | 'UNFAVORABLE_REGIME'
  | 'STRATEGY_QUARANTINED'
  | 'BOOK_FROZEN'
  | 'BOOK_HALTED'
  | 'VENUE_UNHEALTHY';

export interface GateCheckResult {
  gate: GateType;
  passed: boolean;
  reason?: BlockReason | string;
  details?: string;
  value?: number | string;
  limit?: number | string;
  timestamp: Date;
}

export interface MarketRegime {
  trend: 'bullish' | 'bearish' | 'sideways';
  volatility: 'low' | 'medium' | 'high' | 'extreme';
  liquidity: 'thin' | 'normal' | 'deep';
  overall: 'favorable' | 'neutral' | 'unfavorable';
  confidence: number;
}

export interface CostAnalysis {
  expectedEdgeBps: number;
  spreadCostBps: number;
  slippageEstimateBps: number;
  feeCostBps: number;
  totalCostBps: number;
  netEdgeBps: number;
  isCostEfficient: boolean;
  minimumEdgeRequired: number;
}

export interface DecisionTrace {
  id: string;
  timestamp: Date;
  
  // Intent details
  intent: {
    instrument: string;
    direction: 'LONG' | 'SHORT';
    targetExposureUsd: number;
    strategyId: string;
    strategyName: string;
    confidence: number;
    signalStrength: number;
  };
  
  // Decision outcome
  decision: DecisionOutcome;
  
  // All gates checked (in order)
  gatesChecked: GateCheckResult[];
  
  // Block reasons (if any)
  blockReasons: BlockReason[];
  
  // Market context
  regime: MarketRegime;
  
  // Cost analysis
  costs: CostAnalysis;
  
  // Final human-readable explanation
  explanation: string;
  
  // Machine-readable reason codes
  reasonCodes: string[];
}

// In-memory trace store (in production, this would go to a database)
const traceStore: DecisionTrace[] = [];
const MAX_TRACES = 100;

/**
 * Create a new decision trace
 */
export function createDecisionTrace(
  intent: DecisionTrace['intent'],
  regime: MarketRegime,
  costs: CostAnalysis
): DecisionTrace {
  const trace: DecisionTrace = {
    id: `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    intent,
    decision: 'PENDING',
    gatesChecked: [],
    blockReasons: [],
    regime,
    costs,
    explanation: '',
    reasonCodes: [],
  };
  
  return trace;
}

/**
 * Add a gate check result to a trace
 */
export function addGateCheck(
  trace: DecisionTrace,
  gate: GateType,
  passed: boolean,
  details?: {
    reason?: BlockReason | string;
    details?: string;
    value?: number | string;
    limit?: number | string;
  }
): void {
  const check: GateCheckResult = {
    gate,
    passed,
    reason: details?.reason,
    details: details?.details,
    value: details?.value,
    limit: details?.limit,
    timestamp: new Date(),
  };
  
  trace.gatesChecked.push(check);
  
  if (!passed && details?.reason) {
    trace.blockReasons.push(details.reason as BlockReason);
    trace.reasonCodes.push(details.reason);
  }
}

/**
 * Finalize a decision trace
 */
export function finalizeTrace(
  trace: DecisionTrace,
  decision: DecisionOutcome
): DecisionTrace {
  trace.decision = decision;
  
  // Generate human-readable explanation
  trace.explanation = generateExplanation(trace);
  
  // Store the trace
  traceStore.unshift(trace);
  if (traceStore.length > MAX_TRACES) {
    traceStore.pop();
  }
  
  return trace;
}

/**
 * Generate a human-readable explanation
 */
function generateExplanation(trace: DecisionTrace): string {
  const { intent, decision, blockReasons, costs, regime } = trace;
  
  if (decision === 'EXECUTED') {
    return `${intent.direction} ${intent.instrument} was EXECUTED. ` +
      `Strategy "${intent.strategyName}" had ${(intent.confidence * 100).toFixed(0)}% confidence. ` +
      `Market regime was ${regime.overall}. ` +
      `Net edge after costs: +${costs.netEdgeBps.toFixed(1)} bps. ` +
      `All ${trace.gatesChecked.length} safety checks passed.`;
  }
  
  if (decision === 'BLOCKED') {
    const reasonExplanations = blockReasons.map(r => reasonToHuman(r));
    return `${intent.direction} ${intent.instrument} was BLOCKED. ` +
      `Reasons: ${reasonExplanations.join('; ')}. ` +
      `Expected edge (${costs.expectedEdgeBps} bps) ${costs.isCostEfficient ? 'exceeded' : 'did not exceed'} costs (${costs.totalCostBps} bps).`;
  }
  
  if (decision === 'MODIFIED') {
    return `${intent.direction} ${intent.instrument} was MODIFIED to comply with risk limits. ` +
      `Original exposure ${intent.targetExposureUsd.toLocaleString()} USD was adjusted.`;
  }
  
  return 'Decision pending.';
}

/**
 * Convert reason code to human-readable text
 */
function reasonToHuman(reason: BlockReason): string {
  const map: Record<BlockReason, string> = {
    KILL_SWITCH_ACTIVE: 'Emergency kill switch is active',
    REDUCE_ONLY_ACTIVE: 'System is in reduce-only mode',
    VOLATILITY_REGIME_HIGH: 'Market volatility is too high for new positions',
    EXPECTED_EDGE_NEGATIVE: 'Expected edge was negative',
    EXECUTION_COST_EXCEEDS_EDGE: 'Execution costs exceed expected profit',
    DATA_QUALITY_INSUFFICIENT: 'Market data quality is insufficient for trading',
    POSITION_LIMIT_EXCEEDED: 'Would exceed position size limit',
    EXPOSURE_LIMIT_EXCEEDED: 'Would exceed total exposure limit',
    DAILY_LOSS_LIMIT_EXCEEDED: 'Daily loss limit has been reached',
    LIQUIDITY_INSUFFICIENT: 'Market liquidity is too thin',
    CONFIDENCE_TOO_LOW: 'Strategy confidence was below threshold',
    UNFAVORABLE_REGIME: 'Market regime is unfavorable',
    STRATEGY_QUARANTINED: 'Strategy has been quarantined for poor performance',
    BOOK_FROZEN: 'Trading book is frozen',
    BOOK_HALTED: 'Trading book has been halted',
    VENUE_UNHEALTHY: 'Exchange or venue is unhealthy',
  };
  
  return map[reason] || reason;
}

/**
 * Get recent decision traces
 */
export function getRecentTraces(limit: number = 20): DecisionTrace[] {
  return traceStore.slice(0, limit);
}

/**
 * Get traces by outcome
 */
export function getTracesByOutcome(outcome: DecisionOutcome): DecisionTrace[] {
  return traceStore.filter(t => t.decision === outcome);
}

/**
 * Get block statistics
 */
export function getBlockStats(): Record<BlockReason, number> {
  const stats: Partial<Record<BlockReason, number>> = {};
  
  for (const trace of traceStore) {
    for (const reason of trace.blockReasons) {
      stats[reason] = (stats[reason] || 0) + 1;
    }
  }
  
  return stats as Record<BlockReason, number>;
}

/**
 * Export trace for logging/API
 */
export function traceToJSON(trace: DecisionTrace): object {
  return {
    id: trace.id,
    intent: `${trace.intent.direction} ${trace.intent.instrument}`,
    decision: trace.decision,
    gates_checked: trace.gatesChecked.map(g => g.gate),
    reasons: trace.blockReasons,
    timestamp: trace.timestamp.toISOString(),
  };
}

// Pre-populate with some example traces for demo
export function initializeDemoTraces(): void {
  const demoTraces: Partial<DecisionTrace>[] = [
    {
      id: 'demo_1',
      timestamp: new Date(),
      intent: {
        instrument: 'BTC-USDT',
        direction: 'LONG',
        targetExposureUsd: 5000,
        strategyId: 'strat_1',
        strategyName: 'Trend Following',
        confidence: 0.78,
        signalStrength: 0.65,
      },
      decision: 'EXECUTED',
      gatesChecked: [
        { gate: 'KILL_SWITCH', passed: true, timestamp: new Date() },
        { gate: 'RISK_AGENT', passed: true, timestamp: new Date() },
        { gate: 'EXECUTION_COST_GATE', passed: true, timestamp: new Date() },
      ],
      blockReasons: [],
      regime: {
        trend: 'bullish',
        volatility: 'medium',
        liquidity: 'deep',
        overall: 'favorable',
        confidence: 0.82,
      },
      costs: {
        expectedEdgeBps: 45,
        spreadCostBps: 8,
        slippageEstimateBps: 12,
        feeCostBps: 5,
        totalCostBps: 25,
        netEdgeBps: 20,
        isCostEfficient: true,
        minimumEdgeRequired: 15,
      },
      explanation: '',
      reasonCodes: [],
    },
    {
      id: 'demo_2',
      timestamp: new Date(Date.now() - 300000),
      intent: {
        instrument: 'ETH-USDT',
        direction: 'LONG',
        targetExposureUsd: 3000,
        strategyId: 'strat_2',
        strategyName: 'Mean Reversion',
        confidence: 0.52,
        signalStrength: 0.35,
      },
      decision: 'BLOCKED',
      gatesChecked: [
        { gate: 'KILL_SWITCH', passed: true, timestamp: new Date() },
        { gate: 'RISK_AGENT', passed: true, timestamp: new Date() },
        { gate: 'EXECUTION_COST_GATE', passed: false, reason: 'EXECUTION_COST_EXCEEDS_EDGE', timestamp: new Date() },
        { gate: 'REGIME_FILTER', passed: false, reason: 'UNFAVORABLE_REGIME', timestamp: new Date() },
      ],
      blockReasons: ['EXECUTION_COST_EXCEEDS_EDGE', 'UNFAVORABLE_REGIME'],
      regime: {
        trend: 'bearish',
        volatility: 'high',
        liquidity: 'thin',
        overall: 'unfavorable',
        confidence: 0.45,
      },
      costs: {
        expectedEdgeBps: 15,
        spreadCostBps: 25,
        slippageEstimateBps: 30,
        feeCostBps: 10,
        totalCostBps: 65,
        netEdgeBps: -50,
        isCostEfficient: false,
        minimumEdgeRequired: 15,
      },
      explanation: '',
      reasonCodes: ['EXECUTION_COST_EXCEEDS_EDGE', 'UNFAVORABLE_REGIME'],
    },
    {
      id: 'demo_3',
      timestamp: new Date(Date.now() - 600000),
      intent: {
        instrument: 'SOL-USDT',
        direction: 'SHORT',
        targetExposureUsd: 2000,
        strategyId: 'strat_3',
        strategyName: 'Momentum',
        confidence: 0.88,
        signalStrength: 0.75,
      },
      decision: 'BLOCKED',
      gatesChecked: [
        { gate: 'KILL_SWITCH', passed: true, timestamp: new Date() },
        { gate: 'REDUCE_ONLY', passed: false, reason: 'REDUCE_ONLY_ACTIVE', timestamp: new Date() },
      ],
      blockReasons: ['REDUCE_ONLY_ACTIVE'],
      regime: {
        trend: 'bearish',
        volatility: 'medium',
        liquidity: 'normal',
        overall: 'favorable',
        confidence: 0.71,
      },
      costs: {
        expectedEdgeBps: 55,
        spreadCostBps: 10,
        slippageEstimateBps: 8,
        feeCostBps: 5,
        totalCostBps: 23,
        netEdgeBps: 32,
        isCostEfficient: true,
        minimumEdgeRequired: 15,
      },
      explanation: '',
      reasonCodes: ['REDUCE_ONLY_ACTIVE'],
    },
  ];
  
  // Generate explanations and add to store
  demoTraces.forEach(t => {
    const trace = t as DecisionTrace;
    trace.explanation = generateExplanation(trace);
    traceStore.push(trace);
  });
}

// Initialize demo traces
initializeDemoTraces();
