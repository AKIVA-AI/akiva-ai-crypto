import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStrategySignals } from '@/hooks/useEngineControl';
import { formatDistanceToNow } from 'date-fns';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SignalsTableProps {
  strategyId?: string;
  limit?: number;
}

export function SignalsTable({ strategyId, limit = 20 }: SignalsTableProps) {
  const { data: signals, isLoading } = useStrategySignals(strategyId, limit);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Signals
        </CardTitle>
        <CardDescription>
          Strategy-generated trade signals and intents
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signals && signals.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Strength</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => (
                  <TableRow key={signal.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {(signal.strategies as { name: string } | null)?.name || 'Unknown'}
                    </TableCell>
                    <TableCell className="font-mono">{signal.instrument}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {signal.direction === 'buy' ? (
                          <TrendingUp className="h-4 w-4 text-success" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        )}
                        <Badge
                          variant={signal.direction === 'buy' ? 'success' : 'destructive'}
                          className="uppercase"
                        >
                          {signal.direction}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{signal.signal_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              signal.strength > 0.7 ? 'bg-success' :
                              signal.strength > 0.4 ? 'bg-warning' : 'bg-muted-foreground'
                            )}
                            style={{ width: `${signal.strength * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-sm w-12 text-right">
                          {(signal.strength * 100).toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No signals generated yet</p>
            <p className="text-sm">Run an engine cycle to generate signals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
