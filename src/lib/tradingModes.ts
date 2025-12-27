/**
 * Trading Mode Configuration
 * 
 * Defines US vs International trading capabilities and venue restrictions
 */

export type TradingMode = 'us' | 'international';

export interface VenueConfig {
  id: string;
  name: string;
  icon: string;
  modes: TradingMode[];
  capabilities: {
    spot: boolean;
    futures: boolean;
    perpetuals: boolean;
    margin: boolean;
    staking: boolean;
    options: boolean;
  };
  usCompliant: boolean;
  apiIntegrated: boolean;
  description: string;
}

export interface ArbitrageStrategy {
  id: string;
  name: string;
  description: string;
  modes: TradingMode[];
  venues: string[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedApy: string;
}

export interface TradingModeConfig {
  mode: TradingMode;
  label: string;
  description: string;
  venues: string[];
  features: {
    spot: boolean;
    futures: boolean;
    perpetuals: boolean;
    margin: boolean;
    staking: boolean;
    options: boolean;
    arbitrage: ArbitrageStrategy[];
  };
}

// Venue definitions
export const VENUES: Record<string, VenueConfig> = {
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase Advanced',
    icon: '🔵',
    modes: ['us', 'international'],
    capabilities: {
      spot: true,
      futures: true, // CME-style limited
      perpetuals: false,
      margin: false,
      staking: true,
      options: false,
    },
    usCompliant: true,
    apiIntegrated: true,
    description: 'US-compliant spot trading with CME futures',
  },
  kraken: {
    id: 'kraken',
    name: 'Kraken',
    icon: '🟣',
    modes: ['us', 'international'],
    capabilities: {
      spot: true,
      futures: true, // Available to eligible US users
      perpetuals: false, // Not in US
      margin: true, // Limited in US
      staking: true,
      options: false,
    },
    usCompliant: true,
    apiIntegrated: true, // Now integrated
    description: 'Full-featured US exchange with futures',
  },
  binance_us: {
    id: 'binance_us',
    name: 'Binance.US',
    icon: '🟡',
    modes: ['us'],
    capabilities: {
      spot: true,
      futures: false,
      perpetuals: false,
      margin: false,
      staking: true,
      options: false,
    },
    usCompliant: true,
    apiIntegrated: true,
    description: 'US-compliant Binance with spot trading',
  },
  binance: {
    id: 'binance',
    name: 'Binance',
    icon: '🟡',
    modes: ['international'],
    capabilities: {
      spot: true,
      futures: true,
      perpetuals: true,
      margin: true,
      staking: true,
      options: true,
    },
    usCompliant: false,
    apiIntegrated: false,
    description: 'Global exchange with full derivatives',
  },
  bybit: {
    id: 'bybit',
    name: 'Bybit',
    icon: '🟠',
    modes: ['international'],
    capabilities: {
      spot: true,
      futures: true,
      perpetuals: true,
      margin: true,
      staking: true,
      options: true,
    },
    usCompliant: false,
    apiIntegrated: false,
    description: 'Derivatives-focused exchange',
  },
  okx: {
    id: 'okx',
    name: 'OKX',
    icon: '⚫',
    modes: ['international'],
    capabilities: {
      spot: true,
      futures: true,
      perpetuals: true,
      margin: true,
      staking: true,
      options: true,
    },
    usCompliant: false,
    apiIntegrated: false,
    description: 'Full-featured global exchange',
  },
  hyperliquid: {
    id: 'hyperliquid',
    name: 'HyperLiquid',
    icon: '💧',
    modes: ['international'],
    capabilities: {
      spot: false,
      futures: false,
      perpetuals: true,
      margin: true,
      staking: false,
      options: false,
    },
    usCompliant: false,
    apiIntegrated: true,
    description: 'On-chain perpetuals DEX',
  },
};

// Arbitrage strategies
export const ARBITRAGE_STRATEGIES: ArbitrageStrategy[] = [
  {
    id: 'cross_exchange_spot',
    name: 'Cross-Exchange Spot',
    description: 'Exploit price differences between exchanges for the same asset',
    modes: ['us', 'international'],
    venues: ['coinbase', 'kraken', 'binance_us', 'binance'],
    riskLevel: 'low',
    estimatedApy: '5-15%',
  },
  {
    id: 'funding_rate',
    name: 'Funding Rate Arbitrage',
    description: 'Capture funding rate spreads between perps and spot',
    modes: ['international'], // Requires perpetuals
    venues: ['binance', 'bybit', 'hyperliquid'],
    riskLevel: 'low',
    estimatedApy: '10-30%',
  },
  {
    id: 'triangular',
    name: 'Triangular Arbitrage',
    description: 'Exploit pricing inefficiencies across trading pairs',
    modes: ['us', 'international'],
    venues: ['coinbase', 'kraken', 'binance_us', 'binance'],
    riskLevel: 'medium',
    estimatedApy: '3-10%',
  },
  {
    id: 'basis_trade',
    name: 'Basis Trade',
    description: 'Trade the spread between futures and spot',
    modes: ['us', 'international'],
    venues: ['coinbase', 'kraken', 'binance_us', 'binance'],
    riskLevel: 'low',
    estimatedApy: '8-20%',
  },
  {
    id: 'dex_cex_arb',
    name: 'DEX/CEX Arbitrage',
    description: 'Exploit price differences between DEXs and CEXs',
    modes: ['international'],
    venues: ['hyperliquid', 'binance'],
    riskLevel: 'high',
    estimatedApy: '15-50%',
  },
];

// Mode configurations
export const TRADING_MODES: Record<TradingMode, TradingModeConfig> = {
  us: {
    mode: 'us',
    label: 'US Mode',
    description: 'US-compliant trading with regulated exchanges',
    venues: ['coinbase', 'kraken', 'binance_us'],
    features: {
      spot: true,
      futures: true, // CME-style only
      perpetuals: false,
      margin: true, // Limited
      staking: true,
      options: false,
      arbitrage: ARBITRAGE_STRATEGIES.filter(s => s.modes.includes('us')),
    },
  },
  international: {
    mode: 'international',
    label: 'International Mode',
    description: 'Full access to global exchanges and derivatives',
    venues: ['binance', 'bybit', 'okx', 'hyperliquid', 'coinbase', 'kraken'],
    features: {
      spot: true,
      futures: true,
      perpetuals: true,
      margin: true,
      staking: true,
      options: true,
      arbitrage: ARBITRAGE_STRATEGIES,
    },
  },
};

// Helper functions
export function getVenuesForMode(mode: TradingMode): VenueConfig[] {
  return Object.values(VENUES).filter(v => v.modes.includes(mode));
}

export function getIntegratedVenuesForMode(mode: TradingMode): VenueConfig[] {
  return getVenuesForMode(mode).filter(v => v.apiIntegrated);
}

export function getArbitrageStrategiesForMode(mode: TradingMode): ArbitrageStrategy[] {
  return ARBITRAGE_STRATEGIES.filter(s => s.modes.includes(mode));
}

export function canUsePerpetuals(mode: TradingMode): boolean {
  return mode === 'international';
}

export function canUseMargin(mode: TradingMode): boolean {
  return true; // Both modes support some form of margin
}

export function getDefaultVenue(mode: TradingMode): string {
  return mode === 'us' ? 'coinbase' : 'binance';
}

// Geo detection helpers
export const US_COUNTRY_CODES = ['US', 'USA', 'United States'];

export async function detectRegion(): Promise<{ country: string; isUS: boolean }> {
  try {
    // Use a free geo-IP service
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Geo detection failed');
    const data = await response.json();
    return {
      country: data.country_name || 'Unknown',
      isUS: US_COUNTRY_CODES.includes(data.country_code) || US_COUNTRY_CODES.includes(data.country_name),
    };
  } catch {
    // Default to US mode for safety
    return { country: 'Unknown', isUS: true };
  }
}
