import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, BarChart3, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BacktestDetail, BacktestSummary } from '@/hooks/useBacktestResults';

interface BacktestComparisonProps {
  backtests: (BacktestDetail | BacktestSummary)[];
  className?: string;
  onRemoveBacktest?: (id: string) => void;
}

type SortField = 'strategyName' | 'totalReturn' | 'sharpeRatio' | 'maxDrawdown' | 'totalTrades' | 'winRate';
type SortDirection = 'asc' | 'desc';

interface ComparisonMetric {
  key: SortField;
  label: string;
  format: (value: number | string) => string;
  higherIsBetter: boolean;
}

const COMPARISON_METRICS: ComparisonMetric[] = [
  {
    key: 'strategyName',
    label: 'Strategy',
    format: (value) => String(value),
    higherIsBetter: false,
  },
  {
    key: 'totalReturn',
    label: 'Total Return',
    format: (value) => `${(Number(value) * 100).toFixed(2)}%`,
    higherIsBetter: true,
  },
  {
    key: 'sharpeRatio',
    label: 'Sharpe Ratio',
    format: (value) => Number(value).toFixed(2),
    higherIsBetter: true,
  },
  {
    key: 'maxDrawdown',
    label: 'Max Drawdown',
    format: (value) => `${(Number(value) * 100).toFixed(2)}%`,
    higherIsBetter: false,
  },
  {
    key: 'totalTrades',
    label: 'Total Trades',
    format: (value) => Number(value).toLocaleString(),
    higherIsBetter: false,
  },
  {
    key: 'winRate',
    label: 'Win Rate',
    format: (value) => `${(Number(value) * 100).toFixed(1)}%`,
    higherIsBetter: true,
  },
];

export function BacktestComparison({
  backtests,
  className,
  onRemoveBacktest,
}: BacktestComparisonProps) {
  const [sortField, setSortField] = useState<SortField>('totalReturn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedMetric, setSelectedMetric] = useState<SortField>('totalReturn');

  // Sort backtests
  const sortedBacktests = useMemo(() => {
    return [...backtests].sort((a, b) => {
      if (sortField === 'strategyName') {
        const comparison = a.strategyName.localeCompare(b.strategyName);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        const aValue = getMetricValue(a, sortField);
        const bValue = getMetricValue(b, sortField);
        
        if (sortDirection === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      }
    });
  }, [backtests, sortField, sortDirection]);

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

  const getComparisonIcon = (value: number, metric: ComparisonMetric, bestValue: number) => {
    if (value === bestValue) {
      return <Target className="h-4 w-4 text-green-500" />;
    }
    if (metric.higherIsBetter) {
      return value > bestValue * 0.8 ? (
        <TrendingUp className="h-4 w-4 text-green-500" />
      ) : (
        <TrendingDown className="h-4 w-4 text-red-500" />
      );
    } else {
      return value < bestValue * 1.2 ? (
        <TrendingUp className="h-4 w-4 text-green-500" />
      ) : (
        <TrendingDown className="h-4 w-4 text-red-500" />
      );
    }
  };

  const getBestValue = (field: SortField) => {
    const metric = COMPARISON_METRICS.find(m => m.key === field);
    if (!metric || field === 'strategyName') return null;

    const values = backtests.map(bt => getMetricValue(bt, field));
    return metric.higherIsBetter ? Math.max(...values) : Math.min(...values);
  };

  const getMetricValue = (backtest: BacktestDetail | BacktestSummary, field: SortField): number => {
    if (field === 'strategyName') return 0;
    
    // For BacktestDetail, metrics are nested under 'metrics'
    if ('metrics' in backtest) {
      const detail = backtest as BacktestDetail;
      switch (field) {
        case 'totalReturn': return detail.metrics.totalReturn || 0;
        case 'sharpeRatio': return detail.metrics.sharpeRatio || 0;
        case 'maxDrawdown': return detail.metrics.maxDrawdown || 0;
        case 'totalTrades': return detail.metrics.totalTrades || 0;
        case 'winRate': return detail.metrics.winRate || 0;
        default: return 0;
      }
    }
    
    // For BacktestSummary, metrics are top-level
    const summary = backtest as BacktestSummary;
    switch (field) {
      case 'totalReturn': return summary.totalReturn || 0;
      case 'sharpeRatio': return summary.sharpeRatio || 0;
      case 'maxDrawdown': return summary.maxDrawdown || 0;
      case 'totalTrades': return summary.totalTrades || 0;
      case 'winRate': return summary.winRate || 0;
      default: return 0;
    }
  };

  const getCellValue = (backtest: BacktestDetail | BacktestSummary, field: SortField) => {
    const metric = COMPARISON_METRICS.find(m => m.key === field);
    if (!metric) return '';

    const value = getMetricValue(backtest, field);
    return metric.format(value);
  };

  const getCellClassName = (backtest: BacktestDetail | BacktestSummary, field: SortField) => {
    const metric = COMPARISON_METRICS.find(m => m.key === field);
    if (!metric || field === 'strategyName') return '';

    const value = getMetricValue(backtest, field);
    const bestValue = getBestValue(field);

    if (value === bestValue) {
      return 'font-bold text-green-600 dark:text-green-400';
    }

    if (metric.higherIsBetter) {
      const avgValue = backtests.reduce((sum, bt) => sum + getMetricValue(bt, field), 0) / backtests.length;
      return value > avgValue ? 'text-green-600' : 'text-red-600';
    } else {
      const avgValue = backtests.reduce((sum, bt) => sum + getMetricValue(bt, field), 0) / backtests.length;
      return value < avgValue ? 'text-green-600' : 'text-red-600';
    }
  };

  const renderComparisonTable = () => {
    if (backtests.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="mb-2">No backtests to compare</p>
          <p className="text-sm">
            Run multiple backtests to see comparison analysis
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {COMPARISON_METRICS.map((metric) => (
                <TableHead key={metric.key} className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort(metric.key)}>
                  <div className="flex items-center gap-2">
                    {metric.label}
                    {getSortIcon(metric.key)}
                  </div>
                </TableHead>
              ))}
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBacktests.map((backtest) => (
              <TableRow key={backtest.id}>
                {COMPARISON_METRICS.map((metric) => {
                  const bestValue = getBestValue(metric.key);
                  return (
                    <TableCell key={metric.key} className={cn(getCellClassName(backtest, metric.key))}>
                      <div className="flex items-center gap-2">
                        {bestValue !== null && metric.key !== 'strategyName' && (
                          getComparisonIcon(getMetricValue(backtest, metric.key) || 0, metric, bestValue)
                        )}
                        {getCellValue(backtest, metric.key)}
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell>
                  {onRemoveBacktest && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveBacktest(backtest.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderMetricComparison = () => {
    if (backtests.length === 0) return null;

    const metric = COMPARISON_METRICS.find(m => m.key === selectedMetric);
    if (!metric || selectedMetric === 'strategyName') return null;

    const bestValue = getBestValue(selectedMetric);
    const values = backtests.map(bt => {
      const value = getMetricValue(bt, selectedMetric);
      return {
        name: bt.strategyName,
        value,
        isBest: value === bestValue,
      };
    });

    const maxValue = Math.max(...values.map(v => v.value));
    const minValue = Math.min(...values.map(v => v.value));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{metric.label} Comparison</h3>
          <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as SortField)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPARISON_METRICS.filter(m => m.key !== 'strategyName').map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {values.map((item) => {
            const percentage = maxValue > minValue ? ((item.value - minValue) / (maxValue - minValue)) * 100 : 50;
            const isPositive = metric.higherIsBetter ? item.value > 0 : item.value < 0;

            return (
              <div key={item.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {item.isBest && <Badge variant="secondary">Best</Badge>}
                  </div>
                  <span className={cn(
                    'font-mono text-sm',
                    item.isBest && 'text-green-600',
                    isPositive ? 'text-green-600' : 'text-red-600'
                  )}>
                    {metric.format(item.value)}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all duration-300',
                      item.isBest ? 'bg-green-500' : isPositive ? 'bg-blue-500' : 'bg-red-500'
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn('glass-panel', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Backtest Comparison
          <div className="group relative">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <div className="absolute right-0 top-6 w-64 p-3 bg-popover border rounded-md shadow-md text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10">
              Compare multiple backtest results side-by-side. Sort by different metrics and identify the best performing strategies.
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          Analyze and compare performance metrics across multiple backtest runs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="table" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table">Comparison Table</TabsTrigger>
            <TabsTrigger value="metrics">Metric Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-6">
            {renderComparisonTable()}
          </TabsContent>

          <TabsContent value="metrics" className="mt-6">
            {renderMetricComparison()}
          </TabsContent>
        </Tabs>

        {backtests.length > 0 && (
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <h4 className="font-medium mb-2">Comparison Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Backtests:</span>
                <div className="font-medium">{backtests.length}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Best Return:</span>
                <div className="font-medium text-green-600">
                  {(Math.max(...backtests.map(bt => getMetricValue(bt, 'totalReturn'))) * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Best Sharpe:</span>
                <div className="font-medium text-green-600">
                  {Math.max(...backtests.map(bt => getMetricValue(bt, 'sharpeRatio'))).toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Lowest Drawdown:</span>
                <div className="font-medium text-green-600">
                  {(Math.min(...backtests.map(bt => getMetricValue(bt, 'maxDrawdown'))) * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BacktestComparison;
