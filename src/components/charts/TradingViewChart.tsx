import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  createChart, 
  IChartApi, 
  CandlestickData, 
  Time, 
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface TradingViewChartProps {
  symbol?: string;
  className?: string;
  height?: number;
  showControls?: boolean;
  onSymbolChange?: (symbol: string) => void;
}

const TIMEFRAMES = [
  { label: '1H', value: '1h', interval: '1h' },
  { label: '4H', value: '4h', interval: '4h' },
  { label: '1D', value: '1d', interval: '1d' },
  { label: '1W', value: '1w', interval: '1w' },
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

// Convert symbol format for API
function toApiSymbol(symbol: string): string {
  return symbol.replace('-', '').toUpperCase();
}

// Fetch kline data from edge function – includes volume
async function fetchKlineData(
  symbol: string,
  interval: string
): Promise<{ candles: CandlestickData<Time>[]; volumes: number[] }> {
  try {
    const apiSymbol = toApiSymbol(symbol);
    const { data, error } = await supabase.functions.invoke('market-data', {
      body: { symbol: apiSymbol, interval, endpoint: 'klines' },
      method: 'POST',
    });

    if (error || !data?.candles || data.candles.length === 0) {
      console.warn('[Chart] Failed to fetch klines:', error);
      return { candles: [], volumes: [] };
    }

    const candles: CandlestickData<Time>[] = data.candles.map((c: any) => ({
      time: Math.floor(c.time / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumes: number[] = data.candles.map((c: any) => c.volume ?? 0);

    return { candles, volumes };
  } catch (err) {
    console.error('[Chart] Kline fetch error:', err);
    return { candles: [], volumes: [] };
  }
}

// Volume bars derived from candle data
function deriveVolumeData(
  candleData: CandlestickData<Time>[],
  volumeRaw: number[]
): { time: Time; value: number; color: string }[] {
  return candleData.map((candle, i) => ({
    time: candle.time,
    value: volumeRaw[i] ?? 0,
    color:
      candle.close >= candle.open
        ? 'rgba(34, 197, 94, 0.5)'
        : 'rgba(239, 68, 68, 0.5)',
  }));
}
// REMOVED: BASE_PRICES constant – no longer needed since we don't generate fake data

export function TradingViewChart({ 
  symbol = 'BTC-USDT', 
  className,
  height = 400,
  showControls = true,
  onSymbolChange,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Series refs - using ISeriesApi type for proper typing
  const candlestickSeriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  
  const [currentSymbol, setCurrentSymbol] = useState(symbol);
  const [timeframe, setTimeframe] = useState('1h');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [chartError, setChartError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'hsl(270 12% 50%)',
        },
        grid: {
          vertLines: { color: 'rgba(139, 92, 246, 0.1)' },
          horzLines: { color: 'rgba(139, 92, 246, 0.1)' },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: 'rgba(139, 92, 246, 0.5)',
            width: 1,
            style: 2,
          },
          horzLine: {
            color: 'rgba(139, 92, 246, 0.5)',
            width: 1,
            style: 2,
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(139, 92, 246, 0.2)',
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
        },
        timeScale: {
          borderColor: 'rgba(139, 92, 246, 0.2)',
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

      // Add candlestick series using v5 API
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
      candlestickSeriesRef.current = candlestickSeries;

      // Add volume series using v5 API
      const volumeSeries = chart.addSeries(HistogramSeries, {
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

      setChartError(null);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    } catch (error) {
      console.error('Chart initialization error:', error);
      setChartError(error instanceof Error ? error.message : 'Failed to initialize chart');
    }
  }, [height, isFullscreen]);

  // Load data when symbol or timeframe changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    const loadData = async () => {
      setIsLoading(true);
      setChartError(null);

      // Fetch real data only
      const { candles, volumes } = await fetchKlineData(currentSymbol, timeframe);

      if (candles.length === 0) {
        // No data available – show error state
        setChartError(`No chart data for ${currentSymbol}`);
        candlestickSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);
        setLastPrice(null);
        setPriceChange(0);
        setIsLoading(false);
        return;
      }

      const volumeData = deriveVolumeData(candles, volumes);

      candlestickSeriesRef.current?.setData(candles);
      volumeSeriesRef.current?.setData(volumeData);

      // Set last price and change
      if (candles.length >= 2) {
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        setLastPrice(last.close);
        setPriceChange(((last.close - prev.close) / prev.close) * 100);
      } else if (candles.length === 1) {
        setLastPrice(candles[0].close);
        setPriceChange(0);
      }

      // Fit content
      chartRef.current?.timeScale().fitContent();
      setIsLoading(false);
    };

    loadData();
  }, [currentSymbol, timeframe]);

  // REMOVED: Fake real-time updates – only real data now

  const handleSymbolChange = (value: string) => {
    setCurrentSymbol(value);
    onSymbolChange?.(value);
  };

  const handleRefresh = useCallback(async () => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    setIsLoading(true);
    setChartError(null);

    const { candles, volumes } = await fetchKlineData(currentSymbol, timeframe);

    if (candles.length === 0) {
      setChartError(`No chart data for ${currentSymbol}`);
      candlestickSeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      setIsLoading(false);
      return;
    }

    const volumeData = deriveVolumeData(candles, volumes);

    candlestickSeriesRef.current?.setData(candles);
    volumeSeriesRef.current?.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
    setIsLoading(false);
  }, [currentSymbol, timeframe]);

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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
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

      {chartError ? (
        <div 
          className="w-full flex items-center justify-center bg-card/50"
          style={{ height: isFullscreen ? 'calc(100vh - 150px)' : height }}
        >
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Chart unavailable</p>
            <p className="text-xs mt-1">{chartError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <div 
          ref={chartContainerRef} 
          className="w-full"
          style={{ height: isFullscreen ? 'calc(100vh - 150px)' : height }}
        />
      )}
    </div>
  );
}
