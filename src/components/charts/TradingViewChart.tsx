import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, CandlestickData, Time, ColorType, CandlestickSeriesPartialOptions } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradingViewChartProps {
  symbol?: string;
  className?: string;
  height?: number;
  showControls?: boolean;
  onSymbolChange?: (symbol: string) => void;
}

const TIMEFRAMES = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: 'D' },
];

const SYMBOLS = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'ARB-USDT',
  'OP-USDT',
  'AVAX-USDT',
  'MATIC-USDT',
  'LINK-USDT',
];

// Generate realistic OHLC data
function generateCandlestickData(basePrice: number, numCandles: number = 200): CandlestickData<Time>[] {
  const data: CandlestickData<Time>[] = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const candleInterval = 3600; // 1 hour

  for (let i = numCandles; i >= 0; i--) {
    const time = (now - i * candleInterval) as Time;
    const volatility = 0.02;
    const trend = Math.sin(i / 20) * 0.001;
    
    const change = (Math.random() - 0.5) * 2 * volatility + trend;
    const open = currentPrice;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    
    data.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
    
    currentPrice = close;
  }

  return data;
}

// Volume data generation
function generateVolumeData(candleData: CandlestickData<Time>[]): { time: Time; value: number; color: string }[] {
  return candleData.map((candle) => ({
    time: candle.time,
    value: Math.random() * 1000000 + 500000,
    color: candle.close >= candle.open 
      ? 'rgba(34, 197, 94, 0.5)' 
      : 'rgba(239, 68, 68, 0.5)',
  }));
}

const BASE_PRICES: Record<string, number> = {
  'BTC-USDT': 98500,
  'ETH-USDT': 3450,
  'SOL-USDT': 185,
  'ARB-USDT': 1.25,
  'OP-USDT': 2.15,
  'AVAX-USDT': 42,
  'MATIC-USDT': 0.95,
  'LINK-USDT': 23,
};

export function TradingViewChart({ 
  symbol = 'BTC-USDT', 
  className,
  height = 400,
  showControls = true,
  onSymbolChange,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  
  const [currentSymbol, setCurrentSymbol] = useState(symbol);
  const [timeframe, setTimeframe] = useState('60');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'hsl(var(--muted-foreground))',
      },
      grid: {
        vertLines: { color: 'hsl(var(--border) / 0.5)' },
        horzLines: { color: 'hsl(var(--border) / 0.5)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'hsl(var(--primary) / 0.5)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'hsl(var(--primary) / 0.5)',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'hsl(var(--border))',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'hsl(var(--border))',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Add candlestick series (using any to handle API version differences)
    const candlestickSeries = (chart as any).addCandlestickSeries({
      upColor: 'hsl(142, 76%, 36%)',
      downColor: 'hsl(0, 84%, 60%)',
      borderUpColor: 'hsl(142, 76%, 36%)',
      borderDownColor: 'hsl(0, 84%, 60%)',
      wickUpColor: 'hsl(142, 76%, 36%)',
      wickDownColor: 'hsl(0, 84%, 60%)',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Add volume series
    const volumeSeries = (chart as any).addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: isFullscreen ? window.innerHeight - 100 : height,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, isFullscreen]);

  // Load data when symbol or timeframe changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    const basePrice = BASE_PRICES[currentSymbol] || 100;
    const candleData = generateCandlestickData(basePrice);
    const volumeData = generateVolumeData(candleData);

    candlestickSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Set last price and change
    if (candleData.length >= 2) {
      const last = candleData[candleData.length - 1];
      const prev = candleData[candleData.length - 2];
      setLastPrice(last.close);
      setPriceChange(((last.close - prev.close) / prev.close) * 100);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [currentSymbol, timeframe]);

  // Real-time updates
  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    const interval = setInterval(() => {
      const basePrice = BASE_PRICES[currentSymbol] || 100;
      const now = Math.floor(Date.now() / 1000) as Time;
      const volatility = 0.001;
      const currentPrice = lastPrice || basePrice;
      
      const change = (Math.random() - 0.5) * 2 * volatility;
      const newPrice = currentPrice * (1 + change);
      const high = Math.max(currentPrice, newPrice) * (1 + Math.random() * volatility * 0.2);
      const low = Math.min(currentPrice, newPrice) * (1 - Math.random() * volatility * 0.2);

      candlestickSeriesRef.current?.update({
        time: now,
        open: currentPrice,
        high,
        low,
        close: newPrice,
      });

      setLastPrice(newPrice);
    }, 2000);

    return () => clearInterval(interval);
  }, [currentSymbol, lastPrice]);

  const handleSymbolChange = (value: string) => {
    setCurrentSymbol(value);
    onSymbolChange?.(value);
  };

  const handleRefresh = () => {
    const basePrice = BASE_PRICES[currentSymbol] || 100;
    const candleData = generateCandlestickData(basePrice);
    const volumeData = generateVolumeData(candleData);
    
    candlestickSeriesRef.current?.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  };

  return (
    <div className={cn(
      'glass-panel rounded-xl overflow-hidden',
      isFullscreen && 'fixed inset-4 z-50',
      className
    )}>
      {showControls && (
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Select value={currentSymbol} onValueChange={handleSymbolChange}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded transition-colors',
                    timeframe === tf.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {lastPrice && (
              <div className="flex items-center gap-2 ml-2">
                <span className="text-lg font-mono font-semibold">
                  ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={cn(
                  'text-sm font-medium',
                  priceChange >= 0 ? 'text-trading-long' : 'text-trading-short'
                )}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      <div 
        ref={chartContainerRef} 
        className="w-full"
        style={{ height: isFullscreen ? 'calc(100vh - 150px)' : height }}
      />
    </div>
  );
}
