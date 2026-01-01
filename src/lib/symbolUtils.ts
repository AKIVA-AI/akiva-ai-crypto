/**
 * Standardized Symbol Utilities
 * 
 * Centralizes all crypto symbol normalization and conversion
 * to ensure consistency across the entire application.
 */

// Canonical symbol format: BASE-QUOTE (e.g., "BTC-USDT")
export type CanonicalSymbol = string;

// Supported CoinGecko IDs for real data
export const SUPPORTED_COINGECKO_SYMBOLS: Record<string, string> = {
  // Major coins
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
  'BNB': 'binancecoin', 'XRP': 'ripple', 'ADA': 'cardano',
  'DOGE': 'dogecoin', 'AVAX': 'avalanche-2', 'LINK': 'chainlink',
  'DOT': 'polkadot', 'UNI': 'uniswap', 'ATOM': 'cosmos',
  'LTC': 'litecoin',
  
  // Layer 2 & Scaling
  'ARB': 'arbitrum', 'OP': 'optimism', 'IMX': 'immutable-x',
  'STRK': 'starknet', 'MANTA': 'manta-network', 'ZK': 'zksync',
  
  // DeFi
  'AAVE': 'aave', 'CRV': 'curve-dao-token', 'MKR': 'maker',
  'SNX': 'havven', 'COMP': 'compound-governance-token',
  'SUSHI': 'sushi', '1INCH': '1inch', 'LDO': 'lido-dao',
  'GMX': 'gmx', 'DYDX': 'dydx-chain', 'PENDLE': 'pendle',
  
  // Infrastructure
  'NEAR': 'near', 'FTM': 'fantom', 'ALGO': 'algorand',
  'ICP': 'internet-computer', 'FIL': 'filecoin',
  'HBAR': 'hedera-hashgraph', 'VET': 'vechain',
  'APT': 'aptos', 'SUI': 'sui', 'SEI': 'sei-network',
  'INJ': 'injective-protocol', 'TIA': 'celestia', 'STX': 'blockstack',
  
  // Gaming & Metaverse
  'SAND': 'the-sandbox', 'MANA': 'decentraland',
  'AXS': 'axie-infinity', 'GALA': 'gala', 'ENJ': 'enjincoin',
  
  // Meme Coins
  'SHIB': 'shiba-inu', 'PEPE': 'pepe', 'FLOKI': 'floki',
  'BONK': 'bonk', 'WIF': 'dogwifcoin',
  
  // AI & Compute
  'FET': 'fetch-ai', 'RNDR': 'render-token',
  'AGIX': 'singularitynet', 'TAO': 'bittensor',
  'AR': 'arweave', 'OCEAN': 'ocean-protocol',
  
  // Oracles
  'PYTH': 'pyth-network', 'API3': 'api3', 'BAND': 'band-protocol',
};

/**
 * Extract the base asset from any symbol format
 * e.g., "BTCUSDT" -> "BTC", "BTC-USDT" -> "BTC", "BTC/USD" -> "BTC"
 */
export function extractBaseAsset(symbol: string): string {
  const clean = symbol.toUpperCase().trim();
  
  // Handle delimited formats first
  const delimiters = ['-', '/', '_', ':'];
  for (const d of delimiters) {
    if (clean.includes(d)) {
      return clean.split(d)[0];
    }
  }
  
  // Handle concatenated formats (BTCUSDT, ETHBTC, etc.)
  const quoteAssets = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const quote of quoteAssets) {
    if (clean.endsWith(quote)) {
      return clean.slice(0, -quote.length);
    }
  }
  
  return clean;
}

/**
 * Convert any symbol format to canonical format (BASE-QUOTE)
 */
export function toCanonicalSymbol(symbol: string): CanonicalSymbol {
  const clean = symbol.toUpperCase().trim();
  
  // Already in canonical format
  if (clean.includes('-')) {
    const [base, quote] = clean.split('-');
    return `${base}-${quote || 'USDT'}`;
  }
  
  // Handle other delimiters
  if (clean.includes('/')) {
    const [base, quote] = clean.split('/');
    return `${base}-${quote || 'USDT'}`;
  }
  
  // Handle concatenated formats
  const quoteAssets = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH'];
  for (const quote of quoteAssets) {
    if (clean.endsWith(quote)) {
      return `${clean.slice(0, -quote.length)}-${quote}`;
    }
  }
  
  // Default to USDT quote
  return `${clean}-USDT`;
}

/**
 * Convert to Binance format (concatenated, uppercase)
 */
export function toBinanceSymbol(symbol: string): string {
  const canonical = toCanonicalSymbol(symbol);
  return canonical.replace('-', '');
}

/**
 * Convert to API request format (for CoinGecko edge function)
 */
export function toApiSymbol(symbol: string): string {
  return toBinanceSymbol(symbol);
}

/**
 * Convert from API response format to canonical
 */
export function fromApiSymbol(symbol: string): CanonicalSymbol {
  return toCanonicalSymbol(symbol);
}

/**
 * Check if a symbol is supported by CoinGecko (has real data)
 */
export function isSymbolSupported(symbol: string): boolean {
  const base = extractBaseAsset(symbol);
  return base in SUPPORTED_COINGECKO_SYMBOLS;
}

/**
 * Get CoinGecko ID for a symbol (if supported)
 */
export function getCoinGeckoId(symbol: string): string | null {
  const base = extractBaseAsset(symbol);
  return SUPPORTED_COINGECKO_SYMBOLS[base] || null;
}

/**
 * Format symbol for display
 */
export function formatSymbolDisplay(symbol: string): string {
  const canonical = toCanonicalSymbol(symbol);
  return canonical.replace('-', '/');
}

/**
 * Compare two symbols for equality (ignoring format)
 */
export function symbolsEqual(a: string, b: string): boolean {
  return toCanonicalSymbol(a) === toCanonicalSymbol(b);
}
