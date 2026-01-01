import { useState, useMemo, lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { TradingViewChart } from '@/components/charts/TradingViewChart';
import { UnifiedSpotTrader } from '@/components/trading/UnifiedSpotTrader';
import { LiveOrderBook } from '@/components/trading/LiveOrderBook';
import { TradeBlotter } from '@/components/trading/TradeBlotter';
import { PortfolioSummaryWidget } from '@/components/portfolio/PortfolioSummaryWidget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMarketData } from '@/contexts/MarketDataContext';
import { useHyperliquidHealth } from '@/hooks/useHyperliquid';
import { formatDistanceToNow } from 'date-fns';
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Star,
  BarChart2,
  Zap,
  Activity,
  Wallet,
  Brain,
  Layers,
  RefreshCw,
  Clock,
} from 'lucide-react';

// Lazy load heavy Intelligence components
const MarketIntelligencePanel = lazy(() => import('@/components/intelligence/MarketIntelligencePanel').then(m => ({ default: m.MarketIntelligencePanel })));
const IntelligenceOverview = lazy(() => import('@/components/intelligence/IntelligenceOverview').then(m => ({ default: m.IntelligenceOverview })));
const WhaleAlertPanel = lazy(() => import('@/components/intelligence/WhaleAlertPanel').then(m => ({ default: m.WhaleAlertPanel })));
const TradingCopilotPanel = lazy(() => import('@/components/intelligence/TradingCopilotPanel').then(m => ({ default: m.TradingCopilotPanel })));
const ExchangeAPIManager = lazy(() => import('@/components/intelligence/ExchangeAPIManager').then(m => ({ default: m.ExchangeAPIManager })));
const AutoTradeTriggers = lazy(() => import('@/components/intelligence/AutoTradeTriggers').then(m => ({ default: m.AutoTradeTriggers })));
const MobileIntelligenceView = lazy(() => import('@/components/intelligence/MobileIntelligenceView').then(m => ({ default: m.MobileIntelligenceView })));
const BacktestTriggers = lazy(() => import('@/components/intelligence/BacktestTriggers').then(m => ({ default: m.BacktestTriggers })));
const TelegramBotManager = lazy(() => import('@/components/intelligence/TelegramBotManager').then(m => ({ default: m.TelegramBotManager })));
const DerivativesPanel = lazy(() => import('@/components/intelligence/DerivativesPanel').then(m => ({ default: m.DerivativesPanel })));

// Loading skeleton for lazy components
const TabLoadingSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-32 w-full" />
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  </div>
);

interface MarketTicker {
  symbol: string;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  isFavorite?: boolean;
}

// Only supported symbols with real data
const TRACKED_SYMBOLS = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'ARB-USDT',
  'OP-USDT',
  'AVAX-USDT',
  'LINK-USDT',
  'DOGE-USDT',
  'XRP-USDT',
  'ADA-USDT',
  'DOT-USDT',
  'UNI-USDT',
  'AAVE-USDT',
  'NEAR-USDT',
  'ATOM-USDT',
];

const FAVORITES = new Set(['BTC-USDT', 'ETH-USDT', 'SOL-USDT']);

export default function Markets() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isTradeTicketOpen, setIsTradeTicketOpen] = useState(false);

  // HyperLiquid health check
  const { data: hlHealth } = useHyperliquidHealth();

  // Use centralized market data provider
  const {
    getTicker,
    isLoading,
    lastUpdate,
    source: dataSource,
    latencyMs: apiLatency,
    refresh: forceRefresh,
    error: marketDataError,
  } = useMarketData();

  // Convert tickers map to market data format
  const marketData: MarketTicker[] = useMemo(() => {
    return TRACKED_SYMBOLS.map(symbol => {
      const ticker = getTicker(symbol);
      return {
        symbol,
        price: ticker?.price ?? null,
        change24h: ticker?.change24h ?? null,
        volume24h: ticker?.volume24h ?? null,
        high24h: ticker?.high24h ?? null,
        low24h: ticker?.low24h ?? null,
        isFavorite: FAVORITES.has(symbol),
      };
    });
  }, [getTicker]);

  const filteredMarkets = marketData.filter(market => {
    const matchesSearch = market.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = !showFavoritesOnly || market.isFavorite;
    return matchesSearch && matchesFavorites;
  });

  const selectedMarket = marketData.find(m => m.symbol === selectedSymbol);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart2 className="h-7 w-7 text-primary" />
                Markets
              </h1>
              <p className="text-muted-foreground">Real-time market data and price charts</p>
            </div>
            
            {/* Data freshness indicator */}
            {lastUpdate > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ml-2",
                      Date.now() - lastUpdate < 10000 
                        ? "bg-success/10 text-success" 
                        : Date.now() - lastUpdate < 60000 
                          ? "bg-warning/10 text-warning"
                          : "bg-destructive/10 text-destructive"
                    )}>
                      <Clock className="h-3 w-3" />
                      <span className="font-medium">
                        {Date.now() - lastUpdate < 5000 
                          ? "Live" 
                          : formatDistanceToNow(lastUpdate, { addSuffix: true })}
                      </span>
                      {isLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Last update: {new Date(lastUpdate).toLocaleTimeString()}</p>
                    <p className="text-xs text-muted-foreground">
                      Source: {dataSource || 'API'}
                    </p>
                    {apiLatency > 0 && (
                      <p className="text-xs text-muted-foreground">Latency: {apiLatency}ms</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* API Source Badge */}
            {dataSource && (
              <Badge variant="outline" className="ml-2 text-xs">
                {dataSource === 'coingecko' ? 'CoinGecko Pro' : dataSource}
              </Badge>
            )}
            
            {/* Manual Refresh Button */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-2 h-7 gap-1.5"
              onClick={forceRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
          <Sheet open={isTradeTicketOpen} onOpenChange={setIsTradeTicketOpen}>
            <SheetTrigger asChild>
              <Button className="gap-2">
                <Zap className="h-4 w-4" />
                Trade
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg p-0 border-l border-border/50 overflow-y-auto">
              <UnifiedSpotTrader />
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

                      {typeof market.change24h === 'number' ? (
                        <span
                          className={cn(
                            'text-xs font-medium flex items-center gap-0.5',
                            market.change24h >= 0 ? 'text-trading-long' : 'text-trading-short'
                          )}
                        >
                          {market.change24h >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {market.change24h >= 0 ? '+' : ''}
                          {market.change24h.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">
                        {typeof market.price === 'number' && market.price > 0 ? (
                          <>${market.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                        ) : isLoading ? (
                          <span className="text-muted-foreground">Loading…</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {typeof market.volume24h === 'number' && market.volume24h > 0
                          ? `Vol: ${(market.volume24h / 1000000).toFixed(0)}M`
                          : 'Vol: —'}
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
                          {typeof selectedMarket.price === 'number' && selectedMarket.price > 0 ? (
                            <>${selectedMarket.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
                          ) : isLoading ? (
                            <span className="text-muted-foreground">Loading…</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>

                        {typeof selectedMarket.change24h === 'number' && (
                          <Badge
                            className={cn(
                              selectedMarket.change24h >= 0
                                ? 'bg-trading-long/20 text-trading-long'
                                : 'bg-trading-short/20 text-trading-short'
                            )}
                          >
                            {selectedMarket.change24h >= 0 ? '+' : ''}
                            {selectedMarket.change24h.toFixed(2)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h High</p>
                      <p className="font-mono font-medium text-trading-long">
                        {typeof selectedMarket.high24h === 'number' && selectedMarket.high24h > 0
                          ? `$${selectedMarket.high24h.toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h Low</p>
                      <p className="font-mono font-medium text-trading-short">
                        {typeof selectedMarket.low24h === 'number' && selectedMarket.low24h > 0
                          ? `$${selectedMarket.low24h.toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">24h Volume</p>
                      <p className="font-mono font-medium">
                        {typeof selectedMarket.volume24h === 'number' && selectedMarket.volume24h > 0
                          ? `$${(selectedMarket.volume24h / 1000000000).toFixed(2)}B`
                          : '—'}
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

            {/* Order Book, Blotter, Portfolio Tabs */}
            <Tabs defaultValue="orderbook" className="space-y-4">
              <TabsList className="glass-panel">
                <TabsTrigger value="orderbook" className="gap-2">
                  <BarChart2 className="h-4 w-4" />
                  Order Book
                </TabsTrigger>
                <TabsTrigger value="blotter" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Trade Blotter
                </TabsTrigger>
                <TabsTrigger value="portfolio" className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Portfolio
                </TabsTrigger>
                <TabsTrigger value="derivatives" className="gap-2">
                  <Layers className="h-4 w-4" />
                  Derivatives
                </TabsTrigger>
                <TabsTrigger value="intelligence" className="gap-2">
                  <Brain className="h-4 w-4" />
                  Intelligence
                </TabsTrigger>
              </TabsList>

              <TabsContent value="orderbook">
                <div className="space-y-4">
                  {/* HyperLiquid status badge */}
                  {hlHealth && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn(
                        "gap-1",
                        hlHealth.status === 'healthy' ? 'border-success text-success' : 'border-warning text-warning'
                      )}>
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          hlHealth.status === 'healthy' ? 'bg-success' : 'bg-warning'
                        )} />
                        HyperLiquid: {hlHealth.mode} ({hlHealth.latencyMs}ms)
                      </Badge>
                    </div>
                  )}
                  <LiveOrderBook symbol={selectedSymbol} depth={10} />
                </div>
              </TabsContent>

              <TabsContent value="blotter">
                <TradeBlotter />
              </TabsContent>

              <TabsContent value="portfolio">
                <PortfolioSummaryWidget />
              </TabsContent>

              <TabsContent value="derivatives">
                <Suspense fallback={<TabLoadingSkeleton />}>
                  <DerivativesPanel instruments={TRACKED_SYMBOLS.slice(0, 6)} />
                </Suspense>
              </TabsContent>

              <TabsContent value="intelligence">
                <Suspense fallback={<TabLoadingSkeleton />}>
                  <div className="space-y-4">
                    {/* Mobile-optimized view for smaller screens */}
                    <div className="block lg:hidden">
                      <MobileIntelligenceView instruments={TRACKED_SYMBOLS.slice(0, 6)} />
                    </div>
                    
                    {/* Full desktop layout */}
                    <div className="hidden lg:block space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <IntelligenceOverview instruments={TRACKED_SYMBOLS.slice(0, 6)} />
                        <MarketIntelligencePanel instruments={TRACKED_SYMBOLS.slice(0, 6)} compact />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <WhaleAlertPanel compact />
                        <TradingCopilotPanel defaultInstrument={selectedSymbol} compact />
                        <ExchangeAPIManager />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <AutoTradeTriggers />
                        <BacktestTriggers />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <TelegramBotManager />
                        <DerivativesPanel instruments={TRACKED_SYMBOLS.slice(0, 6)} compact />
                      </div>
                    </div>
                  </div>
                </Suspense>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
