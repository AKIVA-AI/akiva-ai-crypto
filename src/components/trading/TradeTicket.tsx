import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Zap,
  Shield,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLivePriceFeed, LivePrice } from '@/hooks/useLivePriceFeed';

interface TradeTicketProps {
  onClose?: () => void;
  defaultInstrument?: string;
  defaultBookId?: string;
}

// Convert instrument to Binance symbol format
const toFeedSymbol = (instrument: string): string => {
  return instrument.replace('/', '-');
};

// Available instruments
const INSTRUMENTS = [
  'BTC/USDT',
  'ETH/USDT',
  'SOL/USDT',
  'ARB/USDT',
  'OP/USDT',
  'AVAX/USDT',
  'MATIC/USDT',
  'LINK/USDT',
];

export function TradeTicket({ onClose, defaultInstrument = 'BTC/USDT', defaultBookId }: TradeTicketProps) {
  const queryClient = useQueryClient();
  
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_loss' | 'take_profit'>('market');
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [size, setSize] = useState('0.1');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [bookId, setBookId] = useState(defaultBookId || '');
  const [strategyId, setStrategyId] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [riskPercent, setRiskPercent] = useState([1]);

  // Get live price feed for the current instrument
  const feedSymbols = useMemo(() => [toFeedSymbol(instrument)], [instrument]);
  const { prices, isConnected, getPrice } = useLivePriceFeed({
    symbols: feedSymbols,
    enabled: true,
  });

  // Get the live price for the selected instrument
  const livePrice: LivePrice | undefined = getPrice(toFeedSymbol(instrument));
  const currentPrice = livePrice?.price || 0;
  const priceChange = livePrice?.change24h || 0;

  // Fetch books
  const { data: books = [] } = useQuery({
    queryKey: ['books-for-trade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('status', 'active');
      return data || [];
    },
  });

  // Fetch strategies
  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies-for-trade', bookId],
    queryFn: async () => {
      if (!bookId) return [];
      const { data } = await supabase
        .from('strategies')
        .select('*')
        .eq('book_id', bookId)
        .neq('status', 'off');
      return data || [];
    },
    enabled: !!bookId,
  });

  // Fetch venues
  const { data: venues = [] } = useQuery({
    queryKey: ['venues-for-trade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('is_enabled', true)
        .eq('status', 'healthy');
      return data || [];
    },
  });

  // Calculate notional
  const sizeNum = parseFloat(size) || 0;
  const priceNum = orderType === 'market' ? currentPrice : (parseFloat(price) || currentPrice);
  const notional = sizeNum * priceNum;

  // Risk calculation
  const selectedBook = books.find(b => b.id === bookId);
  const bookCapital = selectedBook?.capital_allocated || 100000;
  const maxRiskAmount = (bookCapital * riskPercent[0]) / 100;

  // Submit order mutation
  const submitOrder = useMutation({
    mutationFn: async () => {
      if (!bookId) throw new Error('Please select a book');
      
      const { data, error } = await supabase
        .from('orders')
        .insert({
          book_id: bookId,
          instrument,
          side,
          size: sizeNum,
          price: orderType === 'limit' ? priceNum : null,
          status: 'open',
          strategy_id: strategyId || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`${side.toUpperCase()} order submitted`, {
        description: `${sizeNum} ${instrument} @ ${orderType === 'market' ? 'Market' : priceNum}`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose?.();
    },
    onError: (error: Error) => {
      toast.error('Order failed', { description: error.message });
    },
  });

  const handleSubmit = () => {
    if (notional > maxRiskAmount) {
      toast.warning('Risk limit exceeded', {
        description: `Notional ${notional.toFixed(2)} exceeds max risk ${maxRiskAmount.toFixed(2)}`,
      });
      return;
    }
    submitOrder.mutate();
  };

  return (
    <Card className="glass-panel w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Trade Ticket
          </span>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className="gap-1 text-xs border-warning/50 text-warning"
            >
              <AlertTriangle className="h-3 w-3" />
              Paper Mode
            </Badge>
            <Badge 
              variant="outline" 
              className={cn(
                'gap-1 text-xs',
                isConnected ? 'border-success/50 text-success' : 'border-destructive/50 text-destructive'
              )}
            >
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isConnected ? 'Feed' : 'Off'}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {instrument}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Side Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={side === 'buy' ? 'default' : 'outline'}
            className={cn(
              'h-12 text-lg font-semibold transition-all',
              side === 'buy' && 'bg-success hover:bg-success/90 text-success-foreground shadow-glow-success'
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
              side === 'sell' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-glow-destructive'
            )}
            onClick={() => setSide('sell')}
          >
            <TrendingDown className="mr-2 h-5 w-5" />
            SELL
          </Button>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-4 gap-1">
          <Button
            type="button"
            variant={orderType === 'market' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setOrderType('market')}
            className="text-xs"
          >
            Market
          </Button>
          <Button
            type="button"
            variant={orderType === 'limit' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setOrderType('limit')}
            className="text-xs"
          >
            Limit
          </Button>
          <Button
            type="button"
            variant={orderType === 'stop_loss' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setOrderType('stop_loss')}
            className="text-xs"
          >
            Stop Loss
          </Button>
          <Button
            type="button"
            variant={orderType === 'take_profit' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setOrderType('take_profit')}
            className="text-xs"
          >
            Take Profit
          </Button>
        </div>

        <Separator />

        {/* Book Selection */}
        <div className="space-y-2">
          <Label>Trading Book</Label>
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger>
              <SelectValue placeholder="Select book" />
            </SelectTrigger>
            <SelectContent>
              {books.map((book) => (
                <SelectItem key={book.id} value={book.id}>
                  <span className="flex items-center gap-2">
                    {book.name}
                    <Badge variant="outline" className="text-xs">
                      {book.type}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Instrument */}
        <div className="space-y-2">
          <Label>Instrument</Label>
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INSTRUMENTS.map((inst) => (
                <SelectItem key={inst} value={inst}>
                  {inst}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label>Size</Label>
          <Input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="font-mono text-lg"
            step="0.01"
            min="0"
          />
        </div>

        {/* Price (for limit orders) */}
        {orderType === 'limit' && (
          <div className="space-y-2">
            <Label>Limit Price</Label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={currentPrice.toString()}
              className="font-mono"
              step="0.01"
            />
          </div>
        )}

        {/* Trigger Price (for SL/TP orders) */}
        {(orderType === 'stop_loss' || orderType === 'take_profit') && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {orderType === 'stop_loss' ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Stop Loss Trigger
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 text-success" />
                    Take Profit Trigger
                  </>
                )}
              </Label>
              <Input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder={currentPrice.toString()}
                className="font-mono"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                {orderType === 'stop_loss' 
                  ? `Order triggers when price ${side === 'sell' ? 'falls below' : 'rises above'} this level`
                  : `Order triggers when price ${side === 'buy' ? 'falls below' : 'rises above'} this level`
                }
              </p>
            </div>
            
            {/* Distance from current price */}
            {triggerPrice && currentPrice > 0 && (
              <div className="rounded-lg bg-muted/30 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Distance</span>
                  <span className={cn(
                    'font-mono',
                    orderType === 'stop_loss' ? 'text-destructive' : 'text-success'
                  )}>
                    {((Math.abs(parseFloat(triggerPrice) - currentPrice) / currentPrice) * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Risk Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Risk Limit
            </Label>
            <span className="text-sm font-mono text-muted-foreground">
              {riskPercent[0]}% (${maxRiskAmount.toLocaleString()})
            </span>
          </div>
          <Slider
            value={riskPercent}
            onValueChange={setRiskPercent}
            min={0.5}
            max={5}
            step={0.5}
            className="w-full"
          />
        </div>

        {/* Reduce Only Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="reduce-only">Reduce Only</Label>
          <Switch
            id="reduce-only"
            checked={reduceOnly}
            onCheckedChange={setReduceOnly}
          />
        </div>

        <Separator />

        {/* Order Summary */}
        <div className="rounded-lg bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current Price</span>
            <span className={cn(
              'font-mono',
              priceChange >= 0 ? 'text-success' : 'text-destructive'
            )}>
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="ml-1 text-xs">
                ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Est. Notional</span>
            <span className="font-mono font-semibold">${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          {notional > maxRiskAmount && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Exceeds risk limit
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          className={cn(
            'flex-1 font-semibold',
            side === 'buy' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'
          )}
          onClick={handleSubmit}
          disabled={submitOrder.isPending || !bookId || sizeNum <= 0}
        >
          {submitOrder.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            `${side.toUpperCase()} ${sizeNum} ${instrument.split('/')[0]}`
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
