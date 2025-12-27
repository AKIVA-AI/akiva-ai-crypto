// Agent roles and their descriptions for the trading system

export interface AgentRole {
  type: string;
  name: string;
  icon: string;
  description: string;
  responsibilities: string[];
  interactions: string[];
  status: 'critical' | 'important' | 'support';
}

export const AGENT_ROLES: Record<string, AgentRole> = {
  'market-data': {
    type: 'market-data',
    name: 'Market Data Agent',
    icon: '📊',
    description: 'Aggregates and normalizes real-time market data from all connected venues. Maintains order book snapshots, trade streams, and OHLCV candles.',
    responsibilities: [
      'Connect to exchange WebSocket feeds',
      'Normalize data formats across venues',
      'Detect and handle stale/missing data',
      'Calculate derived metrics (VWAP, spreads)',
      'Broadcast updates to downstream agents',
    ],
    interactions: ['Strategy Agent', 'Execution Agent', 'Risk Agent'],
    status: 'critical',
  },
  'strategy': {
    type: 'strategy',
    name: 'Strategy Agent',
    icon: '🧠',
    description: 'Runs quantitative models and generates trading signals. Evaluates market conditions against strategy rules and emits trade intents.',
    responsibilities: [
      'Execute strategy logic on market ticks',
      'Generate buy/sell signals with confidence scores',
      'Emit TradeIntent objects to risk engine',
      'Track strategy P&L and performance metrics',
      'Manage strategy parameters and rebalancing',
    ],
    interactions: ['Market Data Agent', 'Risk Agent'],
    status: 'critical',
  },
  'execution': {
    type: 'execution',
    name: 'Execution Agent',
    icon: '⚡',
    description: 'Handles order routing and execution across venues. Implements smart order routing, TWAP/VWAP algos, and tracks fill quality.',
    responsibilities: [
      'Route orders to optimal venues',
      'Execute TWAP, VWAP, and iceberg orders',
      'Monitor fill rates and slippage',
      'Handle partial fills and resubmissions',
      'Implement execution algorithms',
    ],
    interactions: ['Risk Agent', 'OMS', 'Venues'],
    status: 'critical',
  },
  'risk': {
    type: 'risk',
    name: 'Risk Agent',
    icon: '🛡️',
    description: 'Pre-trade and real-time risk management. Validates all trade intents against risk limits, monitors exposure, and can trigger circuit breakers.',
    responsibilities: [
      'Pre-trade risk checks on all intents',
      'Real-time position and exposure monitoring',
      'Enforce leverage and concentration limits',
      'Trigger circuit breakers on breaches',
      'Calculate VaR and stress test scenarios',
    ],
    interactions: ['Strategy Agent', 'Execution Agent', 'Kill Switch'],
    status: 'critical',
  },
  'treasury': {
    type: 'treasury',
    name: 'Treasury Agent',
    icon: '🏦',
    description: 'Manages capital allocation, wallet balances, and fund flows between venues. Handles rebalancing and liquidity provisioning.',
    responsibilities: [
      'Track balances across all venues/wallets',
      'Execute capital rebalancing between venues',
      'Monitor funding rates and borrowing costs',
      'Handle stablecoin conversions',
      'Report NAV and fund performance',
    ],
    interactions: ['Risk Agent', 'Execution Agent', 'Wallets'],
    status: 'important',
  },
  'ops': {
    type: 'ops',
    name: 'Operations Agent',
    icon: '🔧',
    description: 'System health monitoring and operational tasks. Handles deployments, reconciliation, alerting, and infrastructure management.',
    responsibilities: [
      'Monitor system health and uptime',
      'Execute daily reconciliation',
      'Manage deployments and rollbacks',
      'Send alerts via configured channels',
      'Handle failover and disaster recovery',
    ],
    interactions: ['All Agents', 'Notification Channels'],
    status: 'support',
  },
  'intelligence': {
    type: 'intelligence',
    name: 'Intelligence Agent',
    icon: '🔮',
    description: 'Gathers and analyzes market intelligence from on-chain data, social sentiment, news, and whale tracking. Feeds alpha signals to strategies.',
    responsibilities: [
      'Monitor on-chain whale movements',
      'Analyze social media sentiment',
      'Track market news and events',
      'Generate intelligence signals',
      'Identify emerging narratives and trends',
    ],
    interactions: ['Strategy Agent', 'Market Data Agent'],
    status: 'important',
  },
  'reconciliation': {
    type: 'reconciliation',
    name: 'Reconciliation Agent',
    icon: '📋',
    description: 'Ensures consistency between internal records and venue data. Detects discrepancies in positions, fills, and balances.',
    responsibilities: [
      'Compare internal vs. venue positions',
      'Verify fill records match exchange data',
      'Detect and flag discrepancies',
      'Generate reconciliation reports',
      'Trigger alerts on mismatches',
    ],
    interactions: ['Treasury Agent', 'Ops Agent', 'Venues'],
    status: 'important',
  },
};

export const getAgentStatusColor = (status: AgentRole['status']) => {
  switch (status) {
    case 'critical': return 'text-destructive';
    case 'important': return 'text-warning';
    case 'support': return 'text-muted-foreground';
    default: return 'text-muted-foreground';
  }
};

export const getAgentRole = (type: string): AgentRole | undefined => {
  return AGENT_ROLES[type];
};