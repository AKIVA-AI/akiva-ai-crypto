import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target,
  Shield,
  Loader2,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLivePriceFeed } from '@/hooks/useLivePriceFeed';

interface BracketOrderTicketProps {
  onClose?: () => void;
  defaultInstrument?: string;
}

const INSTRUMENTS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ARB/USDT',
  'OP/USDT', 'AVAX/USDT', 'MATIC/USDT', 'LINK/USDT',
];

export function BracketOrderTicket({ onClose, defaultInstrument = 'BTC/USDT' }: BracketOrderTicketProps) {
  const queryClient = useQueryClient();
  
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [instrument, setInstrument] = useState(defaultInstrument);
  const [size, setSize] = useState('0.1');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [bookId, setBookId] = useState('');
  const [useMarketEntry, setUseMarketEntry] = useState(true);

  // Live price feed
  const feedSymbol = instrument.replace('/', '-');
  const { prices, isConnected, getPrice } = useLivePriceFeed({
    symbols: [feedSymbol],
    enabled: true,
  });

  const livePrice = getPrice(feedSymbol);
  const currentPrice = livePrice?.price || 0;

  // Fetch books
  const { data: books = [] } = useQuery({
    queryKey: ['books-bracket'],
    queryFn: async () => {
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('status', 'active');
      return data || [];
    },
  });

  // Calculate metrics
  const sizeNum = parseFloat(size) || 0;
  const entryNum = useMarketEntry ? currentPrice : (parseFloat(entryPrice) || currentPrice);
  const slNum = parseFloat(stopLoss) || 0;
  const tpNum = parseFloat(takeProfit) || 0;

  const riskReward = useMemo(() => {
    if (!slNum || !tpNum || !entryNum) return null;
    const riskAmount = Math.abs(entryNum - slNum);
    const rewardAmount = Math.abs(tpNum - entryNum);
    if (riskAmount === 0) return null;
    return rewardAmount / riskAmount;
  }, [entryNum, slNum, tpNum]);

  const potentialLoss = useMemo(() => {
    if (!slNum || !entryNum) return 0;
    return Math.abs(entryNum - slNum) * sizeNum;
  }, [entryNum, slNum, sizeNum]);

  const potentialProfit = useMemo(() => {
    if (!tpNum || !entryNum) return 0;
    return Math.abs(tpNum - entryNum) * sizeNum;
  }, [entryNum, tpNum, sizeNum]);

  // Visual price levels
  const priceLevels = useMemo(() => {
    const levels = [];
    if (tpNum) levels.push({ price: tpNum, type: 'tp', label: 'Take Profit' });
    levels.push({ price: entryNum, type: 'entry', label: 'Entry' });
    if (slNum) levels.push({ price: slNum, type: 'sl', label: 'Stop Loss' });
    
    // Sort based on side
    return levels.sort((a, b) => b.price - a.price);
  }, [entryNum, slNum, tpNum]);

  const minPrice = Math.min(...priceLevels.map(l => l.price).filter(p => p > 0));
  const maxPrice = Math.max(...priceLevels.map(l => l.price).filter(p => p > 0));
  const priceRange = maxPrice - minPrice || 1;

  // Submit bracket order
  const submitBracket = useMutation({
    mutationFn: async () => {
      if (!bookId) throw new Error('Please select a book');
      if (!slNum) throw new Error('Stop loss is required');
      if (!tpNum) throw new Error('Take profit is required');

      // Create entry order
      const { data: entryOrder, error: entryError } = await supabase
        .from('orders')
        .insert({
          book_id: bookId,
          instrument,
          side,
          size: sizeNum,
          price: useMarketEntry ? null : entryNum,
          status: 'open',
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Create stop loss order (opposite side)
      const slSide = side === 'buy' ? 'sell' : 'buy';
      await supabase.from('orders').insert({
        book_id: bookId,
        instrument,
        side: slSide,
        size: sizeNum,
        price: slNum,
        status: 'open',
      });

      // Create take profit order (opposite side)
      await supabase.from('orders').insert({
        book_id: bookId,
        instrument,
        side: slSide,
        size: sizeNum,
        price: tpNum,
        status: 'open',
      });

      return entryOrder;
    },
    onSuccess: () => {
      toast.success('Bracket order submitted', {
        description: `Entry + SL @ $${slNum.toLocaleString()} + TP @ $${tpNum.toLocaleString()}`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose?.();
    },
    onError: (error: Error) => {
      toast.error('Bracket order failed', { description: error.message });
    },
  });

  // Auto-calculate SL/TP based on percentage
  const setSlPercent = (percent: number) => {
    if (!currentPrice) return;
    const slPrice = side === 'buy' 
      ? currentPrice * (1 - percent / 100)
      : currentPrice * (1 + percent / 100);
    setStopLoss(slPrice.toFixed(2));
  };

  const setTpPercent = (percent: number) => {
    if (!currentPrice) return;
    const tpPrice = side === 'buy' 
      ? currentPrice * (1 + percent / 100)
      : currentPrice * (1 - percent / 100);
    setTakeProfit(tpPrice.toFixed(2));
  };

  return (
    <Card className="glass-panel w-full max-w-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Bracket Order
          </span>
          <Badge variant="outline" className="font-mono">
            {instrument}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Side Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={side === 'buy' ? 'default' : 'outline'}
            className={cn(
              'h-12 text-lg font-semibold',
              side === 'buy' && 'bg-success hover:bg-success/90'
            )}
            onClick={() => setSide('buy')}
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            LONG
          </Button>
          <Button
            type="button"
            variant={side === 'sell' ? 'default' : 'outline'}
            className={cn(
              'h-12 text-lg font-semibold',
              side === 'sell' && 'bg-destructive hover:bg-destructive/90'
            )}
            onClick={() => setSide('sell')}
          >
            <TrendingDown className="mr-2 h-5 w-5" />
            SHORT
          </Button>
        </div>

        {/* Book & Instrument */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Book</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Instrument</Label>
            <Select value={instrument} onValueChange={setInstrument}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSTRUMENTS.map((inst) => (
                  <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          />
        </div>

        <Separator />

        {/* Entry */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Entry Price
            </Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="market-entry" className="text-xs">Market</Label>
              <Switch
                id="market-entry"
                checked={useMarketEntry}
                onCheckedChange={setUseMarketEntry}
              />
            </div>
          </div>
          {useMarketEntry ? (
            <div className="p-3 rounded-lg bg-muted/30 font-mono text-lg">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span className="text-xs text-muted-foreground ml-2">Market</span>
            </div>
          ) : (
            <Input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder={currentPrice.toString()}
              className="font-mono"
            />
          )}
        </div>

        {/* Stop Loss */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Stop Loss
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              className="font-mono flex-1"
              placeholder="Price"
            />
            <div className="flex gap-1">
              {[1, 2, 3, 5].map(pct => (
                <Button
                  key={pct}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSlPercent(pct)}
                  className="text-xs px-2"
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Take Profit */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            Take Profit
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              className="font-mono flex-1"
              placeholder="Price"
            />
            <div className="flex gap-1">
              {[2, 3, 5, 10].map(pct => (
                <Button
                  key={pct}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTpPercent(pct)}
                  className="text-xs px-2"
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Visual Price Levels */}
        {(slNum > 0 || tpNum > 0) && (
          <div className="rounded-lg bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Price Levels</p>
            <div className="relative h-24 bg-muted/30 rounded-lg overflow-hidden">
              {priceLevels.filter(l => l.price > 0).map((level) => {
                const position = maxPrice === minPrice 
                  ? 50 
                  : ((maxPrice - level.price) / priceRange) * 100;
                return (
                  <div
                    key={level.type}
                    className={cn(
                      'absolute left-0 right-0 h-0.5 flex items-center',
                      level.type === 'tp' && 'bg-success',
                      level.type === 'entry' && 'bg-primary',
                      level.type === 'sl' && 'bg-destructive'
                    )}
                    style={{ top: `${Math.min(Math.max(position, 5), 95)}%` }}
                  >
                    <span className={cn(
                      'absolute left-2 text-xs font-medium px-1.5 py-0.5 rounded',
                      level.type === 'tp' && 'bg-success/20 text-success',
                      level.type === 'entry' && 'bg-primary/20 text-primary',
                      level.type === 'sl' && 'bg-destructive/20 text-destructive'
                    )}>
                      {level.label}
                    </span>
                    <span className="absolute right-2 text-xs font-mono">
                      ${level.price.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Separator />

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-destructive/10 p-2 text-center">
            <p className="text-xs text-muted-foreground">Risk</p>
            <p className="font-mono font-semibold text-destructive">
              -${potentialLoss.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-success/10 p-2 text-center">
            <p className="text-xs text-muted-foreground">Reward</p>
            <p className="font-mono font-semibold text-success">
              +${potentialProfit.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-center">
            <p className="text-xs text-muted-foreground">R:R</p>
            <p className={cn(
              'font-mono font-semibold',
              riskReward && riskReward >= 2 ? 'text-success' : 'text-warning'
            )}>
              {riskReward ? `1:${riskReward.toFixed(1)}` : '--'}
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className={cn(
            'flex-1 font-semibold',
            side === 'buy' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'
          )}
          onClick={() => submitBracket.mutate()}
          disabled={submitBracket.isPending || !bookId || sizeNum <= 0 || !slNum || !tpNum}
        >
          {submitBracket.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            `Submit Bracket`
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
