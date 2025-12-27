import { TrendingUp, Activity, Repeat, Coins, Flame, BarChart3, Scale, Brain, LineChart, Shuffle, Layers } from 'lucide-react';

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'mean-reversion' | 'arbitrage' | 'momentum' | 'volatility' | 'statistical' | 'market-making' | 'factor';
  icon: React.ReactNode;
  tier: 'retail' | 'professional' | 'institutional';
  defaultConfig: {
    timeframe: string;
    riskTier: number;
    maxLeverage: number;
    maxDrawdown: number;
    parameters: Record<string, number | string | boolean | number[]>;
  };
  venueScope: string[];
  assetClass: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'quant';
  expectedReturn: string;
  riskProfile: string;
  capitalRequirement?: string;
  researchBasis?: string;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  // ============ RETAIL TIER ============
  {
    id: 'trend-following-ma',
    name: 'Trend Following (MA Crossover)',
    description: 'Classic moving average crossover strategy. Enters long when fast MA crosses above slow MA, and vice versa for shorts. Works best in trending markets.',
    category: 'trend',
    tier: 'retail',
    icon: <TrendingUp className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '4h',
      riskTier: 2,
      maxLeverage: 3,
      maxDrawdown: 10,
      parameters: {
        fast_period: 12,
        slow_period: 26,
        signal_period: 9,
        use_ema: true,
        min_adx: 25,
        trailing_stop_pct: 2.5,
      },
    },
    venueScope: ['binance', 'coinbase'],
    assetClass: 'Crypto',
    difficulty: 'beginner',
    expectedReturn: '15-30% annually',
    riskProfile: 'Medium drawdowns, steady gains in trends',
  },
  {
    id: 'mean-reversion-rsi',
    name: 'Mean Reversion (RSI Oversold/Overbought)',
    description: 'Buys when RSI indicates oversold conditions and sells when overbought. Includes Bollinger Band confirmation for higher probability entries.',
    category: 'mean-reversion',
    tier: 'retail',
    icon: <Repeat className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 2,
      maxLeverage: 2,
      maxDrawdown: 8,
      parameters: {
        rsi_period: 14,
        rsi_oversold: 30,
        rsi_overbought: 70,
        bb_period: 20,
        bb_std: 2,
        min_volume_ratio: 1.5,
        take_profit_pct: 3,
      },
    },
    venueScope: ['binance', 'mexc'],
    assetClass: 'Crypto',
    difficulty: 'intermediate',
    expectedReturn: '20-40% annually',
    riskProfile: 'Quick trades, higher win rate',
  },
  {
    id: 'breakout-momentum',
    name: 'Breakout Momentum',
    description: 'Enters on confirmed breakouts from consolidation patterns with volume confirmation. Uses ATR-based stops and targets.',
    category: 'momentum',
    tier: 'retail',
    icon: <Activity className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 3,
      maxLeverage: 4,
      maxDrawdown: 15,
      parameters: {
        lookback_period: 20,
        breakout_threshold_pct: 2,
        volume_confirmation_ratio: 2.0,
        atr_period: 14,
        stop_atr_multiplier: 1.5,
        target_atr_multiplier: 3.0,
        max_holding_hours: 48,
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken'],
    assetClass: 'Crypto',
    difficulty: 'intermediate',
    expectedReturn: '30-60% annually',
    riskProfile: 'Higher volatility, explosive gains',
  },
  {
    id: 'meme-sniper',
    name: 'Meme Coin Sniper',
    description: 'Detects early momentum in meme coins using social signals and on-chain metrics. High risk, high reward with strict position sizing.',
    category: 'momentum',
    tier: 'retail',
    icon: <Flame className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '5m',
      riskTier: 5,
      maxLeverage: 1,
      maxDrawdown: 25,
      parameters: {
        min_viral_score: 70,
        min_social_velocity: 50,
        max_holder_concentration: 40,
        entry_size_pct: 1,
        scale_in_levels: 3,
        take_profit_levels: [50, 100, 200],
        trailing_stop_activation: 30,
        max_position_time_hours: 24,
      },
    },
    venueScope: ['raydium', 'jupiter'],
    assetClass: 'Meme Coins',
    difficulty: 'advanced',
    expectedReturn: '100%+ potential (high risk)',
    riskProfile: 'Extreme volatility, frequent losses',
  },
  {
    id: 'volatility-breakout',
    name: 'Volatility Expansion',
    description: 'Trades volatility contractions followed by expansions using Bollinger Band squeeze detection. Captures large directional moves.',
    category: 'volatility',
    tier: 'retail',
    icon: <BarChart3 className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '4h',
      riskTier: 3,
      maxLeverage: 3,
      maxDrawdown: 12,
      parameters: {
        bb_period: 20,
        bb_std: 2,
        keltner_period: 20,
        keltner_atr_mult: 1.5,
        squeeze_lookback: 6,
        momentum_period: 12,
        min_squeeze_bars: 4,
        breakout_confirmation_bars: 2,
      },
    },
    venueScope: ['binance', 'bybit'],
    assetClass: 'Crypto',
    difficulty: 'intermediate',
    expectedReturn: '25-50% annually',
    riskProfile: 'Infrequent trades, large winners',
  },

  // ============ PROFESSIONAL TIER ============
  {
    id: 'funding-arbitrage',
    name: 'Funding Rate Arbitrage',
    description: 'Captures funding rate differentials between perpetual futures across exchanges. Market-neutral strategy with hedged positions.',
    category: 'arbitrage',
    tier: 'professional',
    icon: <Coins className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '8h',
      riskTier: 1,
      maxLeverage: 5,
      maxDrawdown: 3,
      parameters: {
        min_funding_spread: 0.01,
        max_position_time_hours: 8,
        hedge_ratio: 1.0,
        min_apr_threshold: 15,
        rebalance_threshold_pct: 5,
        max_slippage_bps: 10,
      },
    },
    venueScope: ['binance', 'bybit', 'okx'],
    assetClass: 'Crypto Derivatives',
    difficulty: 'advanced',
    expectedReturn: '10-25% annually',
    riskProfile: 'Low risk, consistent returns',
    capitalRequirement: '$50,000+',
  },
  {
    id: 'pairs-trading',
    name: 'Pairs Trading (Cointegration)',
    description: 'Identifies statistically cointegrated asset pairs (e.g., ETH/BTC) and trades mean-reversion of the spread. Market-neutral with hedged exposure.',
    category: 'statistical',
    tier: 'professional',
    icon: <Shuffle className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1h',
      riskTier: 2,
      maxLeverage: 3,
      maxDrawdown: 8,
      parameters: {
        lookback_days: 60,
        zscore_entry: 2.0,
        zscore_exit: 0.5,
        zscore_stop: 3.5,
        min_correlation: 0.7,
        cointegration_pvalue: 0.05,
        half_life_max_days: 14,
        rebalance_frequency: 'daily',
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken'],
    assetClass: 'Crypto',
    difficulty: 'advanced',
    expectedReturn: '15-30% annually',
    riskProfile: 'Market-neutral, controlled drawdowns',
    capitalRequirement: '$25,000+',
    researchBasis: 'Engle-Granger cointegration, Ornstein-Uhlenbeck process',
  },
  {
    id: 'cross-exchange-arb',
    name: 'Cross-Exchange Arbitrage',
    description: 'Exploits price discrepancies across exchanges with sub-second execution. Requires colocation and low-latency infrastructure.',
    category: 'arbitrage',
    tier: 'professional',
    icon: <Layers className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1s',
      riskTier: 1,
      maxLeverage: 10,
      maxDrawdown: 2,
      parameters: {
        min_spread_bps: 5,
        max_latency_ms: 100,
        position_limit_usd: 50000,
        fee_buffer_bps: 2,
        inventory_rebalance_threshold: 0.3,
        circuit_breaker_loss_pct: 0.5,
      },
    },
    venueScope: ['coinbase', 'kraken', 'binance_us'],
    assetClass: 'Crypto Spot',
    difficulty: 'advanced',
    expectedReturn: '5-15% annually',
    riskProfile: 'Very low risk, execution-dependent',
    capitalRequirement: '$100,000+',
  },

  // ============ INSTITUTIONAL TIER (HEDGE FUND GRADE) ============
  {
    id: 'stat-arb-pca',
    name: 'Statistical Arbitrage (PCA-Based)',
    description: 'Uses Principal Component Analysis to identify mispriced assets relative to factor exposures. Constructs dollar-neutral portfolios with residual alpha.',
    category: 'statistical',
    tier: 'institutional',
    icon: <Brain className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1d',
      riskTier: 2,
      maxLeverage: 4,
      maxDrawdown: 10,
      parameters: {
        pca_components: 5,
        lookback_days: 252,
        zscore_entry: 1.5,
        zscore_exit: 0.25,
        max_sector_exposure: 0.15,
        target_gross_exposure: 2.0,
        target_net_exposure: 0.0,
        rebalance_frequency: 'daily',
        transaction_cost_bps: 5,
        min_adv_pct: 0.5,
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken', 'bybit'],
    assetClass: 'Crypto Multi-Asset',
    difficulty: 'quant',
    expectedReturn: '12-25% annually (risk-adjusted)',
    riskProfile: 'Low beta, Sharpe > 1.5 target',
    capitalRequirement: '$500,000+',
    researchBasis: 'Avellaneda & Lee (2010), Fama-French factors adapted for crypto',
  },
  {
    id: 'delta-neutral-mm',
    name: 'Delta-Neutral Market Making',
    description: 'Provides liquidity with continuous bid-ask quotes while dynamically hedging delta exposure. Profits from spread capture with controlled inventory risk.',
    category: 'market-making',
    tier: 'institutional',
    icon: <Scale className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '100ms',
      riskTier: 2,
      maxLeverage: 10,
      maxDrawdown: 5,
      parameters: {
        quote_width_bps: 3,
        skew_factor: 0.5,
        inventory_target: 0,
        max_inventory_pct: 10,
        hedge_threshold_delta: 0.1,
        volatility_adjustment: true,
        order_refresh_ms: 500,
        min_spread_vol_ratio: 0.3,
        gamma_scalping_enabled: true,
        fill_probability_model: 'poisson',
      },
    },
    venueScope: ['binance', 'bybit', 'okx', 'deribit'],
    assetClass: 'Crypto Derivatives',
    difficulty: 'quant',
    expectedReturn: '20-40% annually',
    riskProfile: 'Consistent P&L, tail risk from gaps',
    capitalRequirement: '$1,000,000+',
    researchBasis: 'Avellaneda-Stoikov model, Gueant-Lehalle-Fernandez-Tapia',
  },
  {
    id: 'factor-momentum',
    name: 'Multi-Factor Momentum',
    description: 'Combines multiple alpha signals (price momentum, volume, on-chain flows, sentiment) with machine learning ensemble for signal combination.',
    category: 'factor',
    tier: 'institutional',
    icon: <LineChart className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '4h',
      riskTier: 3,
      maxLeverage: 2,
      maxDrawdown: 15,
      parameters: {
        momentum_lookbacks: [7, 30, 90],
        momentum_weight: 0.3,
        volume_weight: 0.15,
        onchain_weight: 0.25,
        sentiment_weight: 0.15,
        volatility_weight: 0.15,
        ensemble_method: 'gradient_boost',
        rebalance_frequency: '4h',
        position_sizing: 'inverse_volatility',
        max_position_concentration: 0.15,
        turnover_penalty: 0.001,
      },
    },
    venueScope: ['binance', 'coinbase', 'kraken', 'bybit', 'okx'],
    assetClass: 'Crypto Multi-Asset',
    difficulty: 'quant',
    expectedReturn: '30-60% annually',
    riskProfile: 'Higher volatility, strong risk-adjusted returns',
    capitalRequirement: '$250,000+',
    researchBasis: 'Jegadeesh-Titman momentum, Barra risk model adapted',
  },
  {
    id: 'dispersion-trading',
    name: 'Volatility Dispersion Trading',
    description: 'Trades implied volatility of index vs. constituents. Sells index vol, buys constituent vol to capture dispersion premium.',
    category: 'volatility',
    tier: 'institutional',
    icon: <BarChart3 className="h-5 w-5" />,
    defaultConfig: {
      timeframe: '1d',
      riskTier: 3,
      maxLeverage: 5,
      maxDrawdown: 12,
      parameters: {
        index_symbol: 'BTC-DOM',
        constituent_count: 10,
        min_iv_spread: 5,
        delta_hedge_frequency: '1h',
        vega_limit_pct: 2,
        gamma_limit_pct: 0.5,
        correlation_lookback: 60,
        roll_days_before_expiry: 7,
        strike_selection: 'atm',
      },
    },
    venueScope: ['deribit', 'bybit', 'okx'],
    assetClass: 'Crypto Options',
    difficulty: 'quant',
    expectedReturn: '15-35% annually',
    riskProfile: 'Complex Greeks exposure, requires active management',
    capitalRequirement: '$500,000+',
    researchBasis: 'Correlation trading, variance swaps replication',
  },
];

export const getCategoryColor = (category: StrategyTemplate['category']) => {
  switch (category) {
    case 'trend': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'mean-reversion': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'arbitrage': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'momentum': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'volatility': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
    case 'statistical': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'market-making': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'factor': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export const getDifficultyColor = (difficulty: StrategyTemplate['difficulty']) => {
  switch (difficulty) {
    case 'beginner': return 'text-success';
    case 'intermediate': return 'text-yellow-500';
    case 'advanced': return 'text-destructive';
    case 'quant': return 'text-primary';
    default: return 'text-muted-foreground';
  }
};

export const getTierColor = (tier: StrategyTemplate['tier']) => {
  switch (tier) {
    case 'retail': return 'bg-muted text-muted-foreground border-border';
    case 'professional': return 'bg-chart-3/20 text-chart-3 border-chart-3/30';
    case 'institutional': return 'bg-primary/20 text-primary border-primary/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export const getTierLabel = (tier: StrategyTemplate['tier']) => {
  switch (tier) {
    case 'retail': return 'Retail';
    case 'professional': return 'Professional';
    case 'institutional': return 'Institutional';
    default: return tier;
  }
};
