/**
 * Hooks Index - Consolidated Exports
 * 
 * MIGRATION GUIDE:
 * ================
 * 
 * OLD (Deprecated)              →  NEW (Use This)
 * ────────────────────────────────────────────────────
 * useCoinbaseTrading()          →  useExchangeTrading({ exchange: 'coinbase' })
 * useKrakenTrading()            →  useExchangeTrading({ exchange: 'kraken' })
 * useBinanceUSTrading()         →  useExchangeTrading({ exchange: 'binance_us' })
 * 
 * useArbitrageEngine()          →  useArbitrage()
 * useCrossExchangeArbitrage()   →  useArbitrage({ type: 'cross_exchange' })
 * useFundingArbitrage()         →  useArbitrage({ type: 'funding' })
 * 
 * The old hooks still work but import from the unified modules internally.
 * Migrate to new hooks for better type safety and consistency.
 */

// ============================================================================
// NEW UNIFIED HOOKS (PREFERRED)
// ============================================================================

// Unified Exchange Trading
export {
  useExchangeTrading,
  useExchangeStatus,
  useExchangeBalances,
  useExchangeTicker,
  useExchangePlaceOrder,
  useExchangeCancelOrder,
  useExchangeOrders,
  EXCHANGE_CONFIG,
  EXCHANGE_FUNCTIONS,
  type ExchangeType,
  type ExchangeStatus,
  type ExchangeBalance,
  type ExchangeTicker,
  type PlaceOrderParams,
  type OrderResult,
} from './useExchangeTrading';

// Unified Arbitrage
export {
  useArbitrage,
  useArbitrageStatus,
  useArbitrageControl,
  useCrossExchangeOpportunities,
  useFundingOpportunities,
  useFundingHistory,
  useAllArbitrageOpportunities,
  useExecuteCrossExchangeArb,
  useExecuteFundingArb,
  useArbitragePositions,
  useActiveFundingPositions,
  type ArbitrageType,
  type ArbitrageOpportunityUnified,
  type ArbitrageStatus,
  type ArbitrageSettings,
} from './useArbitrage';

// ============================================================================
// CORE HOOKS (Keep as-is)
// ============================================================================

export { useAuth } from './useAuth';
export { useExchangeKeys } from './useExchangeKeys';
export { useTradingMode } from './useTradingMode';
export { useTradingGate } from './useTradingGate';
export { usePositions } from './usePositions';
export { useOrders } from './useOrders';
export { useBooks } from './useBooks';
export { useAlerts } from './useAlerts';
export { useStrategies } from './useStrategies';
export { useStrategyLifecycle } from './useStrategyLifecycle';
export { useVenues } from './useVenues';

// Real-time & WebSocket
export { useRealtimeSubscription, useDashboardRealtime } from './useRealtimeSubscriptions';
export { useLivePriceFeed } from './useLivePriceFeed';
export { useLiveOrderBook } from './useLiveOrderBook';
export { useRealtimeStream } from './useRealtimeStream';
export { useWebSocketManager } from './useWebSocketManager';
export { useWebSocketStream } from './useWebSocketStream';
export { useWebSocketExecution } from './useWebSocketExecution';

// Analytics & Metrics
export { useDashboardMetrics } from './useDashboardMetrics';
export { usePerformanceMetrics } from './usePerformanceMetrics';
export { useTokenMetrics } from './useTokenMetrics';
export { useSystemHealth } from './useSystemHealth';
export { useOrderFlowAnalysis } from './useOrderFlowAnalysis';

// Trading Features
export { useTradingAlerts } from './useTradingAlerts';
export { useTradingShortcuts } from './useTradingShortcuts';
export { useTradingCopilot } from './useTradingCopilot';
export { usePositionProtection } from './usePositionProtection';
export { useWhaleWallets } from './useWhaleAlerts';

// Agents & AI
export { useAgents } from './useAgents';
export { useFreqTradeStrategies } from './useFreqTradeStrategies';
export { useDecisionTraces } from './useDecisionTraces';

// Control & Settings
export { useEngineControl } from './useEngineControl';
export { useToggleStrategy } from './usePrivilegedActions';
export { useUserRoles } from './useUserRoles';

// Wallets & Portfolio
export { useWallet } from './useWallet';
export { useWallets } from './useWallets';
export { useUnifiedPortfolio } from './useUnifiedPortfolio';

// Utilities
export { useIsMobile } from './use-mobile';
export { useToast } from './use-toast';

// ============================================================================
// LEGACY HOOKS (Deprecated - use unified versions)
// ============================================================================

// Exchange-specific (DEPRECATED - use useExchangeTrading instead)
export * from './useCoinbaseTrading';
export * from './useKrakenTrading';
export * from './useBinanceUSTrading';
export * from './useHyperliquid';

// Arbitrage-specific (DEPRECATED - use useArbitrage instead)
export * from './useArbitrageEngine';
export * from './useCrossExchangeArbitrage';
export * from './useFundingArbitrage';
export * from './useArbitrageHistory';

