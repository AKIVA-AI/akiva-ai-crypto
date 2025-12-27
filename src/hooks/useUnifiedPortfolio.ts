import { useCoinbaseBalances } from '@/hooks/useCoinbaseTrading';
import { useKrakenBalances } from '@/hooks/useKrakenTrading';
import { useBinanceUSAccount } from '@/hooks/useBinanceUSTrading';
import { useLivePriceFeed, LivePrice } from '@/hooks/useLivePriceFeed';
import { VENUES } from '@/lib/tradingModes';
import { useMemo } from 'react';

export interface ExchangeBalance {
  exchange: string;
  exchangeName: string;
  asset: string;
  available: number;
  locked: number;
  total: number;
  usdValue: number;
  isSimulated: boolean;
}

export interface AggregatedPortfolio {
  totalUsdValue: number;
  exchanges: {
    exchange: string;
    name: string;
    totalUsd: number;
    isSimulated: boolean;
    balances: ExchangeBalance[];
  }[];
  assets: {
    asset: string;
    totalAmount: number;
    totalUsd: number;
    byExchange: { exchange: string; amount: number; usd: number }[];
  }[];
  isLoading: boolean;
  hasRealData: boolean;
  livePrices: Map<string, LivePrice>;
  priceConnectionStatus: 'connected' | 'connecting' | 'disconnected';
}

// Static fallback prices (used when WebSocket not connected)
const FALLBACK_PRICES: Record<string, number> = {
  USD: 1,
  USDT: 1,
  USDC: 1,
  BTC: 95000,
  ETH: 3400,
  SOL: 190,
  XBT: 95000,
  XXBT: 95000,
  ZUSD: 1,
  XXRP: 2.2,
  XETH: 3400,
  XRP: 2.2,
  DOGE: 0.32,
  AVAX: 38,
  LINK: 23,
  ADA: 0.9,
  DOT: 7,
};

function normalizeAsset(asset: string): string {
  const normalized = asset.toUpperCase().replace(/^X+|Z+$/g, '');
  return normalized === 'XBT' ? 'BTC' : normalized;
}

function getUsdValue(asset: string, amount: number, livePrices: Map<string, LivePrice>): number {
  const normalized = normalizeAsset(asset);
  
  // Stablecoins always $1
  if (['USD', 'USDT', 'USDC', 'ZUSD'].includes(normalized)) {
    return amount;
  }
  
  // Try to get live price from WebSocket
  const symbol = `${normalized}-USDT`;
  const livePrice = livePrices.get(symbol);
  if (livePrice) {
    return amount * livePrice.price;
  }
  
  // Fallback to static prices
  const fallbackPrice = FALLBACK_PRICES[normalized] || FALLBACK_PRICES[asset.toUpperCase()] || 0;
  return amount * fallbackPrice;
}

export function useUnifiedPortfolio(): AggregatedPortfolio {
  const { data: coinbaseData, isLoading: coinbaseLoading } = useCoinbaseBalances();
  const { data: krakenData, isLoading: krakenLoading } = useKrakenBalances();
  const { data: binanceData, isLoading: binanceLoading } = useBinanceUSAccount();

  // Collect unique assets to subscribe to price feeds
  const allAssets = useMemo(() => {
    const assets = new Set<string>();
    
    (coinbaseData?.balances || []).forEach((b: any) => {
      const normalized = normalizeAsset(b.currency);
      if (!['USD', 'USDT', 'USDC'].includes(normalized)) {
        assets.add(`${normalized}-USDT`);
      }
    });
    
    Object.keys(krakenData?.balances || {}).forEach((asset) => {
      const normalized = normalizeAsset(asset);
      if (!['USD', 'USDT', 'USDC', 'ZUSD'].includes(normalized)) {
        assets.add(`${normalized}-USDT`);
      }
    });
    
    (binanceData?.balances || []).forEach((b: any) => {
      const normalized = normalizeAsset(b.asset);
      if (!['USD', 'USDT', 'USDC'].includes(normalized)) {
        assets.add(`${normalized}-USDT`);
      }
    });
    
    return Array.from(assets);
  }, [coinbaseData, krakenData, binanceData]);

  // Subscribe to live price feeds
  const { prices, isConnected, isConnecting } = useLivePriceFeed({
    symbols: allAssets.length > 0 ? allAssets : ['BTC-USDT', 'ETH-USDT'],
    enabled: true,
  });

  const livePricesMap = useMemo(() => {
    const map = new Map<string, LivePrice>();
    Object.entries(prices).forEach(([symbol, price]) => {
      map.set(symbol, price);
    });
    return map;
  }, [prices]);

  const isLoading = coinbaseLoading || krakenLoading || binanceLoading;

  // Parse Coinbase balances with live prices
  const coinbaseBalances: ExchangeBalance[] = useMemo(() => 
    (coinbaseData?.balances || []).map((b: any) => ({
      exchange: 'coinbase',
      exchangeName: VENUES.coinbase?.name || 'Coinbase',
      asset: b.currency,
      available: parseFloat(b.available) || 0,
      locked: parseFloat(b.hold) || 0,
      total: parseFloat(b.total) || parseFloat(b.available) + parseFloat(b.hold) || 0,
      usdValue: getUsdValue(b.currency, parseFloat(b.total) || parseFloat(b.available) || 0, livePricesMap),
      isSimulated: coinbaseData?.simulation || false,
    })).filter((b: ExchangeBalance) => b.total > 0),
  [coinbaseData, livePricesMap]);

  // Parse Kraken balances with live prices
  const krakenBalances: ExchangeBalance[] = useMemo(() =>
    Object.entries(krakenData?.balances || {}).map(([asset, amount]) => ({
      exchange: 'kraken',
      exchangeName: VENUES.kraken?.name || 'Kraken',
      asset: asset,
      available: parseFloat(amount as string) || 0,
      locked: 0,
      total: parseFloat(amount as string) || 0,
      usdValue: getUsdValue(asset, parseFloat(amount as string) || 0, livePricesMap),
      isSimulated: krakenData?.simulation || false,
    })).filter((b: ExchangeBalance) => b.total > 0),
  [krakenData, livePricesMap]);

  // Parse Binance.US balances with live prices
  const binanceBalances: ExchangeBalance[] = useMemo(() =>
    (binanceData?.balances || []).map((b: any) => ({
      exchange: 'binance_us',
      exchangeName: VENUES.binance_us?.name || 'Binance.US',
      asset: b.asset,
      available: parseFloat(b.free) || 0,
      locked: parseFloat(b.locked) || 0,
      total: (parseFloat(b.free) || 0) + (parseFloat(b.locked) || 0),
      usdValue: getUsdValue(b.asset, (parseFloat(b.free) || 0) + (parseFloat(b.locked) || 0), livePricesMap),
      isSimulated: binanceData?.simulated || false,
    })).filter((b: ExchangeBalance) => b.total > 0),
  [binanceData, livePricesMap]);

  // Group by exchange
  const exchanges = useMemo(() => [
    {
      exchange: 'coinbase',
      name: VENUES.coinbase?.name || 'Coinbase',
      totalUsd: coinbaseBalances.reduce((sum, b) => sum + b.usdValue, 0),
      isSimulated: coinbaseData?.simulation || false,
      balances: coinbaseBalances,
    },
    {
      exchange: 'kraken',
      name: VENUES.kraken?.name || 'Kraken',
      totalUsd: krakenBalances.reduce((sum, b) => sum + b.usdValue, 0),
      isSimulated: krakenData?.simulation || false,
      balances: krakenBalances,
    },
    {
      exchange: 'binance_us',
      name: VENUES.binance_us?.name || 'Binance.US',
      totalUsd: binanceBalances.reduce((sum, b) => sum + b.usdValue, 0),
      isSimulated: binanceData?.simulated || false,
      balances: binanceBalances,
    },
  ].filter(e => e.balances.length > 0), [coinbaseBalances, krakenBalances, binanceBalances, coinbaseData, krakenData, binanceData]);

  // Aggregate by asset
  const assets = useMemo(() => {
    const allBalances = [...coinbaseBalances, ...krakenBalances, ...binanceBalances];
    const assetMap = new Map<string, { totalAmount: number; totalUsd: number; byExchange: { exchange: string; amount: number; usd: number }[] }>();

    allBalances.forEach(b => {
      const key = normalizeAsset(b.asset);
      
      if (!assetMap.has(key)) {
        assetMap.set(key, { totalAmount: 0, totalUsd: 0, byExchange: [] });
      }
      const entry = assetMap.get(key)!;
      entry.totalAmount += b.total;
      entry.totalUsd += b.usdValue;
      entry.byExchange.push({ exchange: b.exchange, amount: b.total, usd: b.usdValue });
    });

    return Array.from(assetMap.entries())
      .map(([asset, data]) => ({ asset, ...data }))
      .sort((a, b) => b.totalUsd - a.totalUsd);
  }, [coinbaseBalances, krakenBalances, binanceBalances]);

  const totalUsdValue = exchanges.reduce((sum, e) => sum + e.totalUsd, 0);
  const hasRealData = exchanges.some(e => !e.isSimulated);

  const priceConnectionStatus = isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected';

  return {
    totalUsdValue,
    exchanges,
    assets,
    isLoading,
    hasRealData,
    livePrices: livePricesMap,
    priceConnectionStatus,
  };
}
