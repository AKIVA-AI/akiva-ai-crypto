import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Filter, Search, Calendar, TrendingUp, TrendingDown, DollarSign, Clock, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BacktestDetail } from '@/hooks/useBacktestResults';

// Trade interface (would come from backend API)
export interface Trade {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  pnlPercent: number | null;
  duration: number | null; // in minutes
  fees: number;
  strategy: string;
  exitReason?: string;
}

interface TradeJournalProps {
  trades: Trade[];
  backtest?: BacktestDetail;
  className?: string;
  onExportCSV?: (trades: Trade[]) => void;
}

type SortField = 'timestamp' | 'symbol' | 'side' | 'entryPrice' | 'exitPrice' | 'pnl' | 'pnlPercent' | 'duration';
type SortDirection = 'asc' | 'desc';
type FilterSide = 'ALL' | 'BUY' | 'SELL';
type FilterResult = 'ALL' | 'PROFIT' | 'LOSS';

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalFees: number;
  avgDuration: number;
}

export function TradeJournal({
  trades,
  backtest,
  className,
  onExportCSV,
}: TradeJournalProps) {
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSide, setFilterSide] = useState<FilterSide>('ALL');
  const [filterResult, setFilterResult] = useState<FilterResult>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');

  // Get unique symbols for filter
  const symbols = useMemo(() => {
    const uniqueSymbols = Array.from(new Set(trades.map(trade => trade.symbol)));
    return uniqueSymbols.sort();
  }, [trades]);

  // Filter and sort trades
  const filteredAndSortedTrades = useMemo(() => {
    const filtered = trades.filter(trade => {
      // Search filter
      if (searchTerm && !trade.symbol.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Side filter
      if (filterSide !== 'ALL' && trade.side !== filterSide) {
        return false;
      }

      // Result filter
      if (filterResult !== 'ALL' && trade.pnl !== null) {
        if (filterResult === 'PROFIT' && trade.pnl <= 0) return false;
        if (filterResult === 'LOSS' && trade.pnl >= 0) return false;
      }

      // Symbol filter
      if (selectedSymbol !== 'ALL' && trade.symbol !== selectedSymbol) {
        return false;
      }

      return true;
    });

    // Sort trades
    return filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
        case 'timestamp':
          aValue = new Date(a.timestamp).getTime();
          bValue = new Date(b.timestamp).getTime();
          break;
        case 'symbol':
          aValue = a.symbol.localeCompare(b.symbol);
          bValue = 0;
          break;
        case 'side':
          aValue = a.side.localeCompare(b.side);
          bValue = 0;
          break;
        case 'entryPrice':
          aValue = a.entryPrice;
          bValue = b.entryPrice;
          break;
        case 'exitPrice':
          aValue = a.exitPrice || 0;
          bValue = b.exitPrice || 0;
          break;
        case 'pnl':
          aValue = a.pnl || 0;
          bValue = b.pnl || 0;
          break;
        case 'pnlPercent':
          aValue = a.pnlPercent || 0;
          bValue = b.pnlPercent || 0;
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        default:
          aValue = 0;
          bValue = 0;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [trades, searchTerm, filterSide, filterResult, selectedSymbol, sortField, sortDirection]);

  // Calculate statistics
  const stats = useMemo((): TradeStats => {
    const completedTrades = trades.filter(trade => trade.pnl !== null);
    const winningTrades = completedTrades.filter(trade => trade.pnl! > 0);
    const losingTrades = completedTrades.filter(trade => trade.pnl! < 0);

    const totalPnL = completedTrades.reduce((sum, trade) => sum + trade.pnl!, 0);
    const totalWins = winningTrades.reduce((sum, trade) => sum + trade.pnl!, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl!, 0));
    const totalFees = trades.reduce((sum, trade) => sum + trade.fees, 0);
    const totalDuration = completedTrades.reduce((sum, trade) => sum + (trade.duration || 0), 0);

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: completedTrades.length > 0 ? winningTrades.length / completedTrades.length : 0,
      totalPnL,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      totalFees,
      avgDuration: completedTrades.length > 0 ? totalDuration / completedTrades.length : 0,
    };
  }, [trades]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  const formatDuration = (minutes: number | null): string => {
    if (!minutes) return '-';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return '-';
    return price.toFixed(4);
  };

  const formatPnL = (pnl: number | null): string => {
    if (pnl === null) return '-';
    const formatted = pnl.toFixed(2);
    return pnl >= 0 ? `$${formatted}` : `-$${Math.abs(pnl).toFixed(2)}`;
  };

  const exportToCSV = () => {
    if (onExportCSV) {
      onExportCSV(filteredAndSortedTrades);
      return;
    }

    // Default CSV export
    const headers = ['Timestamp', 'Symbol', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'P&L', 'P&L %', 'Duration', 'Fees', 'Exit Reason'];
    const csvContent = [
      headers.join(','),
      ...filteredAndSortedTrades.map(trade => [
        trade.timestamp,
        trade.symbol,
        trade.side,
        trade.entryPrice,
        trade.exitPrice || '',
        trade.quantity,
        trade.pnl || '',
        trade.pnlPercent || '',
        trade.duration || '',
        trade.fees,
        trade.exitReason || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${backtest?.strategyName || 'export'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const renderTradeTable = () => {
    if (filteredAndSortedTrades.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="mb-2">No trades found</p>
          <p className="text-sm">
            Try adjusting your filters or search terms
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('timestamp')}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Time
                    {getSortIcon('timestamp')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('symbol')}>
                  <div className="flex items-center gap-2">
                    Symbol
                    {getSortIcon('symbol')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('side')}>
                  <div className="flex items-center gap-2">
                    Side
                    {getSortIcon('side')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('entryPrice')}>
                  <div className="flex items-center gap-2">
                    Entry
                    {getSortIcon('entryPrice')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('exitPrice')}>
                  <div className="flex items-center gap-2">
                    Exit
                    {getSortIcon('exitPrice')}
                  </div>
                </TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('pnl')}>
                  <div className="flex items-center gap-2">
                    P&L
                    {getSortIcon('pnl')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('pnlPercent')}>
                  <div className="flex items-center gap-2">
                    P&L %
                    {getSortIcon('pnlPercent')}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('duration')}>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Duration
                    {getSortIcon('duration')}
                  </div>
                </TableHead>
                <TableHead>Exit Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(trade.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell>
                    <Badge variant={trade.side === 'BUY' ? 'default' : 'secondary'}>
                      {trade.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{formatPrice(trade.entryPrice)}</TableCell>
                  <TableCell className="font-mono">{formatPrice(trade.exitPrice)}</TableCell>
                  <TableCell>{trade.quantity.toLocaleString()}</TableCell>
                  <TableCell className={cn(
                    'font-mono font-medium',
                    trade.pnl && trade.pnl > 0 ? 'text-green-600' : 
                    trade.pnl && trade.pnl < 0 ? 'text-red-600' : ''
                  )}>
                    {formatPnL(trade.pnl)}
                  </TableCell>
                  <TableCell className={cn(
                    'font-mono',
                    trade.pnlPercent && trade.pnlPercent > 0 ? 'text-green-600' : 
                    trade.pnlPercent && trade.pnlPercent < 0 ? 'text-red-600' : ''
                  )}>
                    {trade.pnlPercent ? `${trade.pnlPercent.toFixed(2)}%` : '-'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDuration(trade.duration)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {trade.exitReason || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderStats = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Total P&L</span>
        </div>
        <div className={cn(
          'text-2xl font-bold',
          stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {formatPnL(stats.totalPnL)}
        </div>
      </div>

      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Win Rate</span>
        </div>
        <div className="text-2xl font-bold">
          {(stats.winRate * 100).toFixed(1)}%
        </div>
        <div className="text-xs text-muted-foreground">
          {stats.winningTrades}/{stats.totalTrades} trades
        </div>
      </div>

      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Profit Factor</span>
        </div>
        <div className="text-2xl font-bold">
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
      </div>

      <div className="p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Avg Duration</span>
        </div>
        <div className="text-2xl font-bold">
          {formatDuration(stats.avgDuration)}
        </div>
      </div>
    </div>
  );

  return (
    <Card className={cn('glass-panel', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Trade Journal
          <div className="group relative">
            <Search className="h-4 w-4 text-muted-foreground" />
            <div className="absolute right-0 top-6 w-64 p-3 bg-popover border rounded-md shadow-md text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10">
              Detailed trade-by-trade analysis with filtering, sorting, and export capabilities.
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          Analyze individual trades and identify patterns in your strategy performance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trades" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trades">Trade List</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="trades" className="mt-6">
            {/* Filters */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search symbols..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select value={filterSide} onValueChange={(value) => setFilterSide(value as FilterSide)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Sides</SelectItem>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterResult} onValueChange={(value) => setFilterResult(value as FilterResult)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Results</SelectItem>
                      <SelectItem value="PROFIT">Profit</SelectItem>
                      <SelectItem value="LOSS">Loss</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Symbols</SelectItem>
                      {symbols.map(symbol => (
                        <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button onClick={exportToCSV} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Filter summary */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Showing {filteredAndSortedTrades.length} of {trades.length} trades</span>
                {filteredAndSortedTrades.length !== trades.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterSide('ALL');
                      setFilterResult('ALL');
                      setSelectedSymbol('ALL');
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {renderTradeTable()}
          </TabsContent>

          <TabsContent value="statistics" className="mt-6">
            {renderStats()}
            
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-3">Performance Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Winning Trades:</span>
                    <span className="font-medium text-green-600">{stats.winningTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Losing Trades:</span>
                    <span className="font-medium text-red-600">{stats.losingTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Win:</span>
                    <span className="font-medium text-green-600">{formatPnL(stats.avgWin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Loss:</span>
                    <span className="font-medium text-red-600">{formatPnL(-stats.avgLoss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Fees:</span>
                    <span className="font-medium">{formatPnL(stats.totalFees)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-3">Trade Distribution</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Completed Trades:</span>
                    <span className="font-medium">{trades.filter(t => t.pnl !== null).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Open Trades:</span>
                    <span className="font-medium">{trades.filter(t => t.pnl === null).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unique Symbols:</span>
                    <span className="font-medium">{symbols.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Strategy:</span>
                    <span className="font-medium">{backtest?.strategyName || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default TradeJournal;
