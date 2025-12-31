/**
 * Risk-Optimized High-Return Strategies
 * 
 * These strategies aim for 1-5% daily returns while implementing 
 * sophisticated risk management to improve consistency and reduce ruin probability.
 */

import { StrategyTemplate } from './strategyTemplates';
import { Shield, Zap, Target, TrendingUp, Activity, Scale, Brain, Layers } from 'lucide-react';

export interface RiskOptimizedConfig {
  // Core risk management
  kellyFraction: number; // 0.1-0.5 of Kelly optimal
  maxPositionPct: number;
  maxCorrelatedExposure: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  
  // Dynamic position sizing
  volatilityScaling: boolean;
  winStreakAdjustment: boolean;
  lossStreakReduction: boolean;
  
  // Entry optimization
  entryConfirmations: number;
  confluenceRequired: number; // Number of aligned signals
  antiCorrelationCheck: boolean;
  
  // Exit optimization
  timeDecay: boolean;
  partialExits: boolean;
  breakEvenStop: boolean;
  
  // Portfolio level
  maxConcurrentTrades: number;
  sectorDiversification: boolean;
  correlationLimit: number;
}

export const RISK_OPTIMIZED_PRESETS: Record<string, RiskOptimizedConfig> = {
  // Conservative: 1-2% daily target, 85% capital preservation
  conservative: {
    kellyFraction: 0.15,
    maxPositionPct: 5,
    maxCorrelatedExposure: 15,
    maxDailyLoss: 2,
    maxDrawdown: 8,
    volatilityScaling: true,
    winStreakAdjustment: false,
    lossStreakReduction: true,
    entryConfirmations: 3,
    confluenceRequired: 3,
    antiCorrelationCheck: true,
    timeDecay: true,
    partialExits: true,
    breakEvenStop: true,
    maxConcurrentTrades: 3,
    sectorDiversification: true,
    correlationLimit: 0.5,
  },
  
  // Balanced: 2-4% daily target, 70% capital preservation
  balanced: {
    kellyFraction: 0.25,
    maxPositionPct: 10,
    maxCorrelatedExposure: 25,
    maxDailyLoss: 4,
    maxDrawdown: 15,
    volatilityScaling: true,
    winStreakAdjustment: true,
    lossStreakReduction: true,
    entryConfirmations: 2,
    confluenceRequired: 2,
    antiCorrelationCheck: true,
    timeDecay: true,
    partialExits: true,
    breakEvenStop: true,
    maxConcurrentTrades: 4,
    sectorDiversification: true,
    correlationLimit: 0.6,
  },
  
  // Growth: 3-5% daily target, 50% capital preservation
  growth: {
    kellyFraction: 0.35,
    maxPositionPct: 15,
    maxCorrelatedExposure: 35,
    maxDailyLoss: 6,
    maxDrawdown: 20,
    volatilityScaling: true,
    winStreakAdjustment: true,
    lossStreakReduction: true,
    entryConfirmations: 2,
    confluenceRequired: 2,
    antiCorrelationCheck: false,
    timeDecay: false,
    partialExits: true,
    breakEvenStop: true,
    maxConcurrentTrades: 5,
    sectorDiversification: false,
    correlationLimit: 0.7,
  },
};

// Risk-optimized strategies with built-in capital preservation
export const RISK_OPTIMIZED_STRATEGIES: StrategyTemplate[] = [
  {
    id: 'multi-timeframe-momentum',
    name: 'Multi-Timeframe Momentum Confluence',
    description: 'Only enters when 3+ timeframes (15m, 1h, 4h) show aligned momentum. Dramatically reduces false signals while capturing strong trends. Uses fractional Kelly sizing.',
    category: 'momentum',
    tier: 'professional',
    icon: <Layers className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '15m',
      riskTier: 3,
      maxLeverage: 5,
      maxDrawdown: 8,
      parameters: {
        timeframes_count: 3, // 15m, 1h, 4h
        min_aligned_timeframes: 3,
        momentum_indicator: 'macd_histogram',
        volume_confirmation: true,
        atr_multiplier_stop: 1.5,
        atr_multiplier_target: 3.0,
        kelly_fraction: 0.2,
        max_position_pct: 8,
        partial_exit_levels: [0.33, 0.33, 0.34],
        max_daily_trades: 5,
        cooldown_after_loss_minutes: 30,
      },
    },
    venueScope: ['binance', 'bybit', 'coinbase'],
    assetClass: 'Crypto',
    difficulty: 'advanced',
    expectedReturn: '1-3% daily (reduced variance)',
    riskProfile: 'Fewer trades, higher win rate, controlled losses',
    capitalRequirement: '$10,000+',
    researchBasis: 'Multi-timeframe alignment, Kelly criterion, partial profit taking',
  },
  {
    id: 'hedged-momentum',
    name: 'Delta-Hedged Momentum',
    description: 'Takes momentum trades on altcoins while hedging beta exposure with BTC/ETH positions. Isolates alpha from pure momentum while protecting against market drawdowns.',
    category: 'momentum',
    tier: 'professional',
    icon: <Shield className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 2,
      maxLeverage: 3,
      maxDrawdown: 6,
      parameters: {
        hedge_instrument: 'BTC-PERP',
        beta_calculation_period: 30,
        target_beta: 0.0,
        max_beta_deviation: 0.1,
        momentum_entry_zscore: 2.0,
        momentum_exit_zscore: 0.5,
        rehedge_frequency_minutes: 60,
        gross_exposure_limit: 150,
        net_exposure_limit: 20,
        position_size_pct: 10,
        stop_loss_pct: 3,
      },
    },
    venueScope: ['binance', 'bybit', 'okx'],
    assetClass: 'Crypto Perpetuals',
    difficulty: 'advanced',
    expectedReturn: '1-2% daily (lower beta risk)',
    riskProfile: 'Market-neutral momentum, controlled drawdowns',
    capitalRequirement: '$25,000+',
    researchBasis: 'Beta hedging, market-neutral strategies, portable alpha',
  },
  {
    id: 'smart-mean-reversion',
    name: 'Smart Mean Reversion with Regime Filter',
    description: 'Mean reversion trades only in ranging/low-volatility regimes. Avoids trending markets where mean reversion fails catastrophically.',
    category: 'mean-reversion',
    tier: 'professional',
    icon: <Brain className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 2,
      maxLeverage: 3,
      maxDrawdown: 5,
      parameters: {
        regime_indicator: 'adx',
        regime_threshold: 25, // Only trade when ADX < 25
        bb_period: 20,
        bb_std: 2.5,
        rsi_confirmation: true,
        rsi_threshold: 25,
        mean_target: 'ema_20',
        stop_loss_bb_multiplier: 1.2,
        position_size_pct: 8,
        max_holding_hours: 12,
        scale_in_levels: 2,
        profit_target_bb: 0, // Target middle band
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken'],
    assetClass: 'Crypto',
    difficulty: 'intermediate',
    expectedReturn: '1-2% daily in ranging markets',
    riskProfile: 'High win rate, regime-dependent',
    capitalRequirement: '$10,000+',
    researchBasis: 'Market regime detection, conditional mean reversion',
  },
  {
    id: 'asymmetric-breakout',
    name: 'Asymmetric Risk Breakout',
    description: 'Breakout strategy with 1:5 risk/reward minimum. Uses tight stops with wide targets. Wins only 30-40% but profits are 5x losses.',
    category: 'momentum',
    tier: 'professional',
    icon: <Target className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 3,
      maxLeverage: 4,
      maxDrawdown: 10,
      parameters: {
        consolidation_periods: 15,
        breakout_threshold_atr: 1.2,
        volume_spike_multiplier: 2.5,
        stop_loss_atr: 0.8,
        take_profit_atr: 4.0,
        min_rr_ratio: 5.0,
        trailing_activation_rr: 2.0,
        trailing_distance_atr: 1.0,
        position_size_pct: 5,
        max_concurrent_breakouts: 2,
        invalidation_time_hours: 2,
      },
    },
    venueScope: ['binance', 'bybit', 'okx'],
    assetClass: 'Crypto',
    difficulty: 'advanced',
    expectedReturn: '2-4% daily (lumpy returns)',
    riskProfile: 'Low win rate, high payoff, psychologically challenging',
    capitalRequirement: '$15,000+',
    researchBasis: 'Asymmetric payoff, turtle trading principles',
  },
  {
    id: 'correlated-pairs-momentum',
    name: 'Correlated Pairs Momentum',
    description: 'Identifies temporary correlation breakdowns between historically correlated assets. Trades convergence with momentum confirmation. Lower risk than pure momentum.',
    category: 'statistical',
    tier: 'professional',
    icon: <Activity className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '4h',
      riskTier: 2,
      maxLeverage: 3,
      maxDrawdown: 6,
      parameters: {
        pair_type: 'sector', // Same sector pairs (e.g., AVAX/SOL)
        correlation_lookback: 60,
        min_correlation: 0.75,
        divergence_threshold_std: 2.0,
        convergence_target_std: 0.5,
        momentum_confirmation_bars: 3,
        stop_loss_std: 3.0,
        position_size_per_leg: 5,
        max_pairs: 3,
        rebalance_frequency: 'daily',
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken'],
    assetClass: 'Crypto',
    difficulty: 'advanced',
    expectedReturn: '1-2% daily (consistent)',
    riskProfile: 'Lower volatility, pair exposure only',
    capitalRequirement: '$20,000+',
    researchBasis: 'Pairs trading, correlation mean reversion',
  },
  {
    id: 'volatility-scaled-trend',
    name: 'Volatility-Scaled Trend Following',
    description: 'Classic trend following with position sizing inversely proportional to volatility. Smaller positions in volatile markets, larger in calm trends.',
    category: 'trend',
    tier: 'professional',
    icon: <TrendingUp className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '4h',
      riskTier: 2,
      maxLeverage: 4,
      maxDrawdown: 12,
      parameters: {
        trend_indicator: 'donchian',
        donchian_period: 20,
        atr_period: 14,
        target_volatility_pct: 1.5,
        position_sizing: 'volatility_target',
        stop_loss_atr: 2.0,
        trailing_stop_atr: 3.0,
        pyramid_enabled: true,
        pyramid_levels: 3,
        pyramid_distance_atr: 1.0,
        max_position_pct: 15,
        sector_limit: 2, // Max 2 positions per sector
      },
    },
    venueScope: ['binance', 'bybit', 'coinbase'],
    assetClass: 'Crypto',
    difficulty: 'intermediate',
    expectedReturn: '1-3% daily in trends',
    riskProfile: 'Consistent risk, adaptive sizing',
    capitalRequirement: '$15,000+',
    researchBasis: 'Volatility targeting, turtle trading, risk parity',
  },
  {
    id: 'funding-grid',
    name: 'Funding Rate Grid Strategy',
    description: 'Combines funding rate capture with grid trading. Collects funding while grid provides entry/exit discipline. Works in sideways and trending markets.',
    category: 'arbitrage',
    tier: 'professional',
    icon: <Scale className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 2,
      maxLeverage: 5,
      maxDrawdown: 5,
      parameters: {
        grid_range_pct: 5,
        grid_levels: 10,
        size_per_grid: 2, // % of capital
        funding_threshold: 0.01, // 1% annualized
        direction_bias: 'funding', // Follow funding direction
        hedge_on_extreme_funding: true,
        extreme_funding_threshold: 0.05,
        take_profit_grids: 3,
        stop_loss_grids: 5,
        rebalance_on_breakout: true,
      },
    },
    venueScope: ['binance', 'bybit', 'hyperliquid'],
    assetClass: 'Crypto Perpetuals',
    difficulty: 'intermediate',
    expectedReturn: '1-2% daily (steady)',
    riskProfile: 'Consistent small gains, range-bound risk',
    capitalRequirement: '$20,000+',
    researchBasis: 'Grid trading, funding rate arbitrage combination',
  },
  {
    id: 'event-momentum',
    name: 'Event-Driven Momentum',
    description: 'Trades momentum bursts around scheduled events (funding, listings, unlocks). Pre-positions with tight stops, captures event volatility.',
    category: 'momentum',
    tier: 'professional',
    icon: <Zap className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '5m',
      riskTier: 3,
      maxLeverage: 5,
      maxDrawdown: 8,
      parameters: {
        event_types_count: 3, // funding, listing, unlock
        pre_event_minutes: 30,
        post_event_minutes: 60,
        entry_on_volume_spike: true,
        volume_spike_threshold: 3.0,
        direction_from_orderflow: true,
        stop_loss_pct: 1.5,
        take_profit_pct: 4.0,
        trailing_after_target: true,
        position_size_pct: 8,
        max_events_per_day: 3,
      },
    },
    venueScope: ['binance', 'bybit', 'coinbase'],
    assetClass: 'Crypto',
    difficulty: 'advanced',
    expectedReturn: '2-5% on event days',
    riskProfile: 'Event-dependent, high variance',
    capitalRequirement: '$10,000+',
    researchBasis: 'Event studies, market microstructure',
  },
];

// Calculate expected metrics for risk-optimized strategies
export function calculateOptimizedMetrics(
  config: RiskOptimizedConfig,
  winRate: number = 0.55,
  avgWinPct: number = 2.5,
  avgLossPct: number = 1.5
): {
  expectedDailyReturn: number;
  sharpeApprox: number;
  maxConsecutiveLosses: number;
  capitalPreservationPct: number;
  monthlyDrawdownProb: number;
} {
  const kellyOptimal = (winRate * avgWinPct - (1 - winRate) * avgLossPct) / avgWinPct;
  const fractionalKelly = kellyOptimal * config.kellyFraction;
  
  const expectedPerTrade = winRate * avgWinPct - (1 - winRate) * avgLossPct;
  const tradesPerDay = 24 / (config.entryConfirmations * 2); // Rough estimate
  const adjustedTrades = Math.min(tradesPerDay, config.maxConcurrentTrades * 2);
  
  const dailyReturn = expectedPerTrade * adjustedTrades * fractionalKelly * 0.5; // Conservative
  
  // Rough Sharpe approximation
  const dailyStd = Math.sqrt(adjustedTrades) * avgLossPct * fractionalKelly;
  const sharpe = dailyReturn / dailyStd * Math.sqrt(252);
  
  // Consecutive loss probability
  const consecutiveLossProb = Math.pow(1 - winRate, 5);
  const maxConsecutive = Math.ceil(Math.log(0.05) / Math.log(1 - winRate));
  
  // Capital preservation estimate
  const capitalPreservation = 100 - config.maxDrawdown * 0.7; // 70% of max DD expected
  
  return {
    expectedDailyReturn: Math.max(0, dailyReturn),
    sharpeApprox: Math.max(0, sharpe),
    maxConsecutiveLosses: maxConsecutive,
    capitalPreservationPct: capitalPreservation,
    monthlyDrawdownProb: consecutiveLossProb * 20, // Rough monthly probability
  };
}

// Risk management principles for high returns
export const HIGH_RETURN_RISK_PRINCIPLES = [
  '🎯 Use fractional Kelly (10-25% of optimal) to survive variance',
  '📊 Require 2-3 signal confluences before entry',
  '⚖️ Scale position size inversely with volatility',
  '🛡️ Move to break-even after 1-2% gain',
  '📈 Take partial profits at 1x, 2x, 3x targets',
  '🔄 Reduce size by 50% after 2 consecutive losses',
  '⏰ Use time stops - exit if no move within expected timeframe',
  '🌐 Diversify across uncorrelated strategies',
  '📉 Hard stop at 3-5% daily loss - no exceptions',
  '🧠 Trade your edge, not your emotions',
];

// Risk tier descriptions
export const RISK_TIERS = {
  conservative: {
    name: 'Conservative',
    dailyTarget: '1-2%',
    monthlyTarget: '20-40%',
    maxDrawdown: '8%',
    winRate: '60%+',
    tradesPerDay: 3,
    ruinProbability: 5,
  },
  balanced: {
    name: 'Balanced',
    dailyTarget: '2-4%',
    monthlyTarget: '40-80%',
    maxDrawdown: '15%',
    winRate: '55%+',
    tradesPerDay: 5,
    ruinProbability: 12,
  },
  growth: {
    name: 'Growth',
    dailyTarget: '3-5%',
    monthlyTarget: '60-100%+',
    maxDrawdown: '20%',
    winRate: '50%+',
    tradesPerDay: 6,
    ruinProbability: 25,
  },
};
