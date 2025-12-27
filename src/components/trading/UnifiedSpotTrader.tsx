import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Zap,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTradingMode } from '@/hooks/useTradingMode';
import { useCoinbaseTicker, useCoinbasePlaceOrder, useCoinbaseBalances } from '@/hooks/useCoinbaseTrading';
import { useKrakenTicker, useKrakenPlaceOrder, useKrakenBalances } from '@/hooks/useKrakenTrading';
import { useBinanceUSTicker, useBinanceUSPlaceOrder, useBinanceUSAccount } from '@/hooks/useBinanceUSTrading';
import { useArbitragePrices } from '@/hooks/useCrossExchangeArbitrage';
import { VENUES } from '@/lib/tradingModes';

type Exchange = 'coinbase' | 'kraken' | 'binance_us';

interface ExchangePrice {
  exchange: Exchange;
  bid: number;
  ask: number;
  spread: number;
  spreadPercent: number;
}

const TRADING_PAIRS: Record<string, { coinbase: string; kraken: string; binance_us: string }> = {
  'BTC/USD': { coinbase: 'BTC-USD', kraken: 'XXBTZUSD', binance_us: 'BTCUSD' },
  'ETH/USD': { coinbase: 'ETH-USD', kraken: 'XETHZUSD', binance_us: 'ETHUSD' },
  'SOL/USD': { coinbase: 'SOL-USD', kraken: 'SOLUSD', binance_us: 'SOLUSD' },
  'AVAX/USD': { coinbase: 'AVAX-USD', kraken: 'AVAXUSD', binance_us: 'AVAXUSD' },
  'LINK/USD': { coinbase: 'LINK-USD', kraken: 'LINKUSD', binance_us: 'LINKUSD' },
  'DOGE/USD': { coinbase: 'DOGE-USD', kraken: 'XDGUSD', binance_us: 'DOGEUSD' },
};

export function UnifiedSpotTrader() {
  const { mode, availableVenues } = useTradingMode();
  
  const [selectedPair, setSelectedPair] = useState('BTC/USD');
  const [selectedExchange, setSelectedExchange] = useState<Exchange>('coinbase');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');
  
  // Get exchange-specific symbols
  const pairConfig = TRADING_PAIRS[selectedPair];
  
  // Fetch prices from all exchanges
  const { data: arbPrices, isLoading: pricesLoading } = useArbitragePrices(selectedPair);
  
  // Exchange accounts
  const { data: coinbaseAccount } = useCoinbaseBalances();
  const { data: krakenBalance } = useKrakenBalances();
  const { data: binanceAccount } = useBinanceUSAccount();
  
  // Order mutations
  const coinbaseOrder = useCoinbasePlaceOrder();
  const krakenOrder = useKrakenPlaceOrder();
  const binanceOrder = useBinanceUSPlaceOrder();
  
  // Calculate best prices
  const exchangePrices: ExchangePrice[] = useMemo(() => {
    if (!arbPrices || !Array.isArray(arbPrices)) return [];
    
    return arbPrices.map((p: any) => ({
      exchange: p.exchange as Exchange,
      bid: p.bid,
      ask: p.ask,
      spread: p.ask - p.bid,
      spreadPercent: ((p.ask - p.bid) / p.bid) * 100,
    }));
  }, [arbPrices]);
  
  // Get current exchange price
  const currentExchangePrice = exchangePrices.find(p => p.exchange === selectedExchange);
  const currentPrice = side === 'buy' 
    ? (currentExchangePrice?.ask || 0)
    : (currentExchangePrice?.bid || 0);
  
  // Find best price
  const bestBuyExchange = exchangePrices.length > 0 
    ? exchangePrices.reduce((best, curr) => curr.ask < best.ask ? curr : best)
    : null;
  const bestSellExchange = exchangePrices.length > 0
    ? exchangePrices.reduce((best, curr) => curr.bid > best.bid ? curr : best)
    : null;
  
  // Auto-select best exchange for the side
  const handleAutoSelectBest = () => {
    const bestExchange = side === 'buy' ? bestBuyExchange?.exchange : bestSellExchange?.exchange;
    if (bestExchange) {
      setSelectedExchange(bestExchange);
      toast.info(`Selected ${VENUES[bestExchange]?.name} - best ${side} price`);
    }
  };
  
  // Calculate order value
  const quantityNum = parseFloat(quantity) || 0;
  const priceNum = orderType === 'market' ? currentPrice : (parseFloat(limitPrice) || currentPrice);
  const orderValue = quantityNum * priceNum;
  
  // Execute order
  const handleSubmitOrder = async () => {
    try {
      switch (selectedExchange) {
        case 'coinbase':
          await coinbaseOrder.mutateAsync({
            instrument: pairConfig.coinbase,
            side: side,
            size: parseFloat(quantity),
            order_type: orderType,
            ...(orderType === 'limit' && { price: parseFloat(limitPrice) }),
          });
          break;
          
        case 'kraken':
          await krakenOrder.mutateAsync({
            pair: pairConfig.kraken,
            type: side,
            ordertype: orderType,
            volume: quantity,
            ...(orderType === 'limit' && { price: limitPrice }),
          });
          break;
          
        case 'binance_us':
          await binanceOrder.mutateAsync({
            symbol: pairConfig.binance_us,
            side: side.toUpperCase() as 'BUY' | 'SELL',
            type: orderType.toUpperCase() as 'MARKET' | 'LIMIT',
            quantity: parseFloat(quantity),
            ...(orderType === 'limit' && { price: parseFloat(limitPrice) }),
          });
          break;
      }
    } catch (error) {
      // Error handling done in mutation hooks
    }
  };
  
  const isSubmitting = coinbaseOrder.isPending || krakenOrder.isPending || binanceOrder.isPending;
  
  // Get account status for selected exchange
  const getAccountStatus = () => {
    switch (selectedExchange) {
      case 'coinbase':
        return coinbaseAccount?.simulation ? 'simulated' : 'live';
      case 'kraken':
        return krakenBalance?.simulation ? 'simulated' : 'live';
      case 'binance_us':
        return binanceAccount?.simulated ? 'simulated' : 'live';
    }
  };
  
  const accountStatus = getAccountStatus();

  return (
    <Card className="glass-panel w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Spot Trading
          </span>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                'gap-1 text-xs',
                accountStatus === 'live' 
                  ? 'border-success/50 text-success' 
                  : 'border-warning/50 text-warning'
              )}
            >
              {accountStatus === 'live' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {accountStatus === 'live' ? 'Live' : 'Paper'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {mode.toUpperCase()} Mode
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Trading Pair Selector */}
        <div className="space-y-2">
          <Label>Trading Pair</Label>
          <Select value={selectedPair} onValueChange={setSelectedPair}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(TRADING_PAIRS).map((pair) => (
                <SelectItem key={pair} value={pair}>
                  {pair}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Exchange Selector with Live Prices */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Exchange</Label>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs gap-1"
              onClick={handleAutoSelectBest}
            >
              <Zap className="h-3 w-3" />
              Best {side === 'buy' ? 'Ask' : 'Bid'}
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {(['coinbase', 'kraken', 'binance_us'] as Exchange[]).map((exchange) => {
              const venue = VENUES[exchange];
              const price = exchangePrices.find(p => p.exchange === exchange);
              const isBest = (side === 'buy' && exchange === bestBuyExchange?.exchange) ||
                           (side === 'sell' && exchange === bestSellExchange?.exchange);
              
              return (
                <button
                  key={exchange}
                  onClick={() => setSelectedExchange(exchange)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-all relative',
                    selectedExchange === exchange
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50',
                    isBest && 'ring-1 ring-success'
                  )}
                >
                  {isBest && (
                    <Badge className="absolute -top-2 -right-2 text-[10px] h-4 bg-success">
                      Best
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm">{venue?.icon}</span>
                    <span className="text-xs font-medium truncate">{venue?.name}</span>
                  </div>
                  {pricesLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : price ? (
                    <div className="text-xs font-mono">
                      <div className="text-success">${price.ask.toFixed(2)}</div>
                      <div className="text-destructive">${price.bid.toFixed(2)}</div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Side Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={side === 'buy' ? 'default' : 'outline'}
            className={cn(
              'h-12 text-lg font-semibold transition-all',
              side === 'buy' && 'bg-success hover:bg-success/90 text-success-foreground'
            )}
            onClick={() => setSide('buy')}
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            BUY
          </Button>
          <Button
            type="button"
            variant={side === 'sell' ? 'default' : 'outline'}
            className={cn(
              'h-12 text-lg font-semibold transition-all',
              side === 'sell' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
            )}
            onClick={() => setSide('sell')}
          >
            <TrendingDown className="mr-2 h-5 w-5" />
            SELL
          </Button>
        </div>

        {/* Order Type */}
        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as 'market' | 'limit')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="market">Market</TabsTrigger>
            <TabsTrigger value="limit">Limit</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Quantity */}
        <div className="space-y-2">
          <Label>Quantity ({selectedPair.split('/')[0]})</Label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="font-mono text-lg"
            step="0.001"
            min="0"
          />
        </div>

        {/* Limit Price (if limit order) */}
        {orderType === 'limit' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Limit Price</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setLimitPrice(currentPrice.toFixed(2))}
              >
                Use Current
              </Button>
            </div>
            <Input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={currentPrice.toFixed(2)}
              className="font-mono"
              step="0.01"
            />
          </div>
        )}

        <Separator />

        {/* Order Summary */}
        <div className="rounded-lg bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Exchange</span>
            <span className="font-medium">{VENUES[selectedExchange]?.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {side === 'buy' ? 'Ask Price' : 'Bid Price'}
            </span>
            <span className="font-mono">${currentPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Order Value</span>
            <span className="font-mono font-semibold">${orderValue.toFixed(2)}</span>
          </div>
          {currentExchangePrice && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spread</span>
              <span className="font-mono text-xs">
                ${currentExchangePrice.spread.toFixed(2)} ({currentExchangePrice.spreadPercent.toFixed(3)}%)
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button
          className={cn(
            'w-full h-12 font-semibold text-lg',
            side === 'buy' 
              ? 'bg-success hover:bg-success/90' 
              : 'bg-destructive hover:bg-destructive/90'
          )}
          onClick={handleSubmitOrder}
          disabled={isSubmitting || quantityNum <= 0}
        >
          {isSubmitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              {side.toUpperCase()} {quantity} {selectedPair.split('/')[0]}
              <span className="ml-2 text-sm opacity-80">
                @ {VENUES[selectedExchange]?.name}
              </span>
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
