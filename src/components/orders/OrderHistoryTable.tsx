import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, subDays, isWithinInterval, parseISO } from 'date-fns';
import {
  Search,
  Filter,
  Download,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react';

type OrderStatus = 'open' | 'filled' | 'rejected' | 'cancelled' | 'all';
type DateRange = '1d' | '7d' | '30d' | 'all' | 'custom';

interface Filters {
  status: OrderStatus;
  instrument: string;
  dateRange: DateRange;
  customStartDate: Date | undefined;
  customEndDate: Date | undefined;
  search: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  open: <Clock className="h-3 w-3" />,
  filled: <CheckCircle className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
  cancelled: <AlertCircle className="h-3 w-3" />,
};

const statusColors: Record<string, string> = {
  open: 'bg-warning/20 text-warning border-warning/30',
  filled: 'bg-success/20 text-success border-success/30',
  rejected: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground border-muted',
};

export function OrderHistoryTable() {
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    instrument: 'all',
    dateRange: '7d',
    customStartDate: undefined,
    customEndDate: undefined,
    search: '',
  });
  const [isExporting, setIsExporting] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['order-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, venues(name), books(name), strategies(name)')
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      return data;
    },
  });

  // Get unique instruments
  const instruments = useMemo(() => {
    const unique = [...new Set(orders.map(o => o.instrument))];
    return unique.sort();
  }, [orders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(o => o.status === filters.status);
    }

    // Instrument filter
    if (filters.instrument !== 'all') {
      result = result.filter(o => o.instrument === filters.instrument);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate = now;

      if (filters.dateRange === 'custom') {
        if (filters.customStartDate && filters.customEndDate) {
          startDate = filters.customStartDate;
          endDate = filters.customEndDate;
        } else {
          startDate = subDays(now, 7);
        }
      } else {
        const days = parseInt(filters.dateRange);
        startDate = subDays(now, days);
      }

      result = result.filter(o => {
        const orderDate = parseISO(o.created_at);
        return isWithinInterval(orderDate, { start: startDate, end: endDate });
      });
    }

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(o => 
        o.instrument.toLowerCase().includes(search) ||
        o.id.toLowerCase().includes(search)
      );
    }

    return result;
  }, [orders, filters]);

  // Stats
  const stats = useMemo(() => {
    const filled = filteredOrders.filter(o => o.status === 'filled');
    const totalVolume = filled.reduce((sum, o) => sum + Number(o.filled_size) * Number(o.filled_price || 0), 0);
    const avgFillPrice = filled.length > 0 
      ? filled.reduce((sum, o) => sum + Number(o.filled_price || 0), 0) / filled.length 
      : 0;
    const fillRate = orders.length > 0 
      ? (filled.length / orders.filter(o => o.status !== 'open').length) * 100 
      : 0;

    return {
      total: filteredOrders.length,
      filled: filled.length,
      totalVolume,
      avgFillPrice,
      fillRate,
    };
  }, [filteredOrders, orders]);

  const handleExportCSV = async () => {
    setIsExporting(true);
    
    try {
      const headers = ['ID', 'Date', 'Instrument', 'Side', 'Size', 'Price', 'Filled', 'Status', 'Venue', 'Book'];
      const rows = filteredOrders.map(o => [
        o.id,
        format(parseISO(o.created_at), 'yyyy-MM-dd HH:mm:ss'),
        o.instrument,
        o.side,
        o.size,
        o.price || 'Market',
        o.filled_size,
        o.status,
        (o as unknown as { venues?: { name: string } | null }).venues?.name || '-',
        (o as unknown as { books?: { name: string } | null }).books?.name || '-',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      status: 'all',
      instrument: 'all',
      dateRange: '7d',
      customStartDate: undefined,
      customEndDate: undefined,
      search: '',
    });
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl p-6 flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Orders</p>
          <p className="text-2xl font-mono font-bold">{stats.total}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Filled</p>
          <p className="text-2xl font-mono font-bold text-success">{stats.filled}</p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Volume</p>
          <p className="text-2xl font-mono font-bold">
            ${stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Fill Rate</p>
          <p className="text-2xl font-mono font-bold">{stats.fillRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by instrument or ID..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>

          <Select 
            value={filters.status} 
            onValueChange={(v) => setFilters(f => ({ ...f, status: v as OrderStatus }))}
          >
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="filled">Filled</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filters.instrument} 
            onValueChange={(v) => setFilters(f => ({ ...f, instrument: v }))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Instrument" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Instruments</SelectItem>
              {instruments.map(inst => (
                <SelectItem key={inst} value={inst}>{inst}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={filters.dateRange} 
            onValueChange={(v) => setFilters(f => ({ ...f, dateRange: v as DateRange }))}
          >
            <SelectTrigger className="w-[140px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {filters.dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {filters.customStartDate ? format(filters.customStartDate, 'PP') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.customStartDate}
                    onSelect={(d) => setFilters(f => ({ ...f, customStartDate: d }))}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {filters.customEndDate ? format(filters.customEndDate, 'PP') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.customEndDate}
                    onSelect={(d) => setFilters(f => ({ ...f, customEndDate: d }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="flex-1" />

          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            disabled={isExporting}
            className="gap-1"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-muted-foreground text-left text-sm border-b border-border/50">
                <th className="p-4 font-medium">Time</th>
                <th className="p-4 font-medium">Instrument</th>
                <th className="p-4 font-medium">Side</th>
                <th className="p-4 font-medium text-right">Size</th>
                <th className="p-4 font-medium text-right">Price</th>
                <th className="p-4 font-medium text-right">Filled</th>
                <th className="p-4 font-medium text-right">Fill Price</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Venue</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    No orders found matching filters
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isLong = order.side === 'buy';
                  return (
                    <tr key={order.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="text-sm">
                          <p>{format(parseISO(order.created_at), 'MMM dd, HH:mm')}</p>
                          <p className="text-xs text-muted-foreground">{format(parseISO(order.created_at), 'yyyy')}</p>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{order.instrument}</td>
                      <td className="p-4">
                        <Badge className={cn(
                          'gap-1',
                          isLong 
                            ? 'bg-trading-long/20 text-trading-long' 
                            : 'bg-trading-short/20 text-trading-short'
                        )}>
                          {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isLong ? 'BUY' : 'SELL'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-mono">{Number(order.size).toFixed(4)}</td>
                      <td className="p-4 text-right font-mono">
                        {order.price ? `$${Number(order.price).toLocaleString()}` : 'Market'}
                      </td>
                      <td className="p-4 text-right font-mono">{Number(order.filled_size).toFixed(4)}</td>
                      <td className="p-4 text-right font-mono">
                        {order.filled_price ? `$${Number(order.filled_price).toLocaleString()}` : '-'}
                      </td>
                      <td className="p-4">
                        <Badge 
                          variant="outline" 
                          className={cn('gap-1 capitalize', statusColors[order.status])}
                        >
                          {statusIcons[order.status]}
                          {order.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {(order as unknown as { venues?: { name: string } | null }).venues?.name || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
