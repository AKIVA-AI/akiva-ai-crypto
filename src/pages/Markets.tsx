import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { TradeTicket } from '@/components/trading/TradeTicket';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Star,
  Activity,
  BarChart2,
  Zap,
} from 'lucide-react';

interface MarketTicker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  isFavorite?: boolean;
}

const MARKET_DATA: MarketTicker[] = [
  { symbol: 'BTC-USDT', price: 98542.50, change24h: 2.34, volume24h: 2840000000, high24h: 99200, low24h: 96800, isFavorite: true },
  { symbol: 'ETH-USDT', price: 3456.80, change24h: -1.25, volume24h: 1420000000, high24h: 3520, low24h: 3410, isFavorite: true },
  { symbol: 'SOL-USDT', price: 185.42, change24h: 5.67, volume24h: 890000000, high24h: 188, low24h: 175 },
  { symbol: 'ARB-USDT', price: 1.25, change24h: -3.45, volume24h: 245000000, high24h: 1.32, low24h: 1.22 },
  { symbol: 'OP-USDT', price: 2.15, change24h: 1.89, volume24h: 156000000, high24h: 2.20, low24h: 2.08 },
  { symbol: 'AVAX-USDT', price: 42.35, change24h: -0.78, volume24h: 312000000, high24h: 43.50, low24h: 41.80 },
  { symbol: 'MATIC-USDT', price: 0.9532, change24h: 2.12, volume24h: 198000000, high24h: 0.97, low24h: 0.93 },
  { symbol: 'LINK-USDT', price: 23.45, change24h: 4.56, volume24h: 287000000, high24h: 24.10, low24h: 22.40 },
];

export default function Markets() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isTradeTicketOpen, setIsTradeTicketOpen] = useState(false);

  const filteredMarkets = MARKET_DATA.filter(market => {
    const matchesSearch = market.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = !showFavoritesOnly || market.isFavorite;
    return matchesSearch && matchesFavorites;
  });

  const selectedMarket = MARKET_DATA.find(m => m.symbol === selectedSymbol);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-7 w-7 text-primary" />
              Markets
            </h1>
            <p className="text-muted-foreground">Real-time market data and price charts</p>
          </div>
          <Sheet open={isTradeTicketOpen} onOpenChange={setIsTradeTicketOpen}>
            <SheetTrigger asChild>
              <Button className="gap-2">
                <Zap className="h-4 w-4" />
                Trade
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md p-0 border-l border-border/50">
              <TradeTicket 
                defaultInstrument={selectedSymbol.replace('-', '/')} 
                onClose={() => setIsTradeTicketOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Market List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search markets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <button
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    showFavoritesOnly ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                  )}
                >
                  <Star className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
                {filteredMarkets.map((market) => (
                  <button
                    key={market.symbol}
                    onClick={() => setSelectedSymbol(market.symbol)}
                    className={cn(
                      'w-full p-3 rounded-lg text-left transition-all',
                      selectedSymbol === market.symbol
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {market.isFavorite && <Star className="h-3 w-3 text-warning fill-warning" />}
                        <span className="font-semibold">{market.symbol}</span>
                      </div>
                      <span className={cn(
                        'text-xs font-medium flex items-center gap-0.5',
                        market.change24h >= 0 ? 'text-trading-long' : 'text-trading-short'
                      )}>
                        {market.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">
                        ${market.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Vol: ${(market.volume24h / 1000000).toFixed(0)}M
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart and Details */}
          <div className="lg:col-span-3 space-y-4">
            {/* Price Header */}
            {selectedMarket && (
              <div className="glass-panel rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h2 className="text-xl font-bold">{selectedMarket.symbol}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-mono font-bold">
                          ${selectedMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <Badge className={cn(
                          selectedMarket.change24h >= 0 
                            ? 'bg-trading-long/20 text-trading-long' 
                            : 'bg-trading-short/20 text-trading-short'
                        )}>
                          {selectedMarket.change24h >= 0 ? '+' : ''}{selectedMarket.change24h.toFixed(2)}%
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h High</p>
                      <p className="font-mono font-medium text-trading-long">
                        ${selectedMarket.high24h.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h Low</p>
                      <p className="font-mono font-medium text-trading-short">
                        ${selectedMarket.low24h.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h Volume</p>
                      <p className="font-mono font-medium">
                        ${(selectedMarket.volume24h / 1000000000).toFixed(2)}B
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      className="gap-1"
                      onClick={() => setIsTradeTicketOpen(true)}
                    >
                      <Zap className="h-3 w-3" />
                      Trade {selectedSymbol.split('-')[0]}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Chart */}
            <TradingViewChart 
              symbol={selectedSymbol} 
              height={500}
              onSymbolChange={setSelectedSymbol}
            />

            {/* Order Book Simulation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-trading-long" />
                  Bids
                </h3>
                <div className="space-y-1">
                  {[...Array(5)].map((_, i) => {
                    const basePrice = selectedMarket?.price || 100;
                    const price = basePrice * (1 - (i + 1) * 0.001);
                    const size = Math.random() * 10 + 1;
                    const total = price * size;
                    const widthPercent = 100 - i * 15;

                    return (
                      <div key={i} className="relative flex items-center justify-between text-sm py-1">
                        <div 
                          className="absolute inset-y-0 left-0 bg-trading-long/10 rounded-r"
                          style={{ width: `${widthPercent}%` }}
                        />
                        <span className="relative font-mono text-trading-long">${price.toFixed(2)}</span>
                        <span className="relative font-mono text-muted-foreground">{size.toFixed(4)}</span>
                        <span className="relative font-mono">${total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="glass-panel rounded-xl p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-trading-short" />
                  Asks
                </h3>
                <div className="space-y-1">
                  {[...Array(5)].map((_, i) => {
                    const basePrice = selectedMarket?.price || 100;
                    const price = basePrice * (1 + (i + 1) * 0.001);
                    const size = Math.random() * 10 + 1;
                    const total = price * size;
                    const widthPercent = 100 - i * 15;

                    return (
                      <div key={i} className="relative flex items-center justify-between text-sm py-1">
                        <div 
                          className="absolute inset-y-0 right-0 bg-trading-short/10 rounded-l"
                          style={{ width: `${widthPercent}%` }}
                        />
                        <span className="relative font-mono text-trading-short">${price.toFixed(2)}</span>
                        <span className="relative font-mono text-muted-foreground">{size.toFixed(4)}</span>
                        <span className="relative font-mono">${total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
