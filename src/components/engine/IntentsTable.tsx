import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTradeIntents } from '@/hooks/useEngineControl';
import { formatDistanceToNow } from 'date-fns';
import { Target, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface IntentsTableProps {
  bookId?: string;
  limit?: number;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-muted-foreground', variant: 'secondary' as const },
  approved: { icon: CheckCircle, color: 'text-success', variant: 'success' as const },
  rejected: { icon: XCircle, color: 'text-destructive', variant: 'destructive' as const },
  modified: { icon: Target, color: 'text-warning', variant: 'warning' as const },
};

export function IntentsTable({ bookId, limit = 20 }: IntentsTableProps) {
  const { data: intents, isLoading } = useTradeIntents(bookId, limit);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Trade Intents
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
          <Target className="h-5 w-5" />
          Trade Intents
        </CardTitle>
        <CardDescription>
          Risk-gated trade proposals from strategies
        </CardDescription>
      </CardHeader>
      <CardContent>
        {intents && intents.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Exposure</TableHead>
                  <TableHead className="text-right">Max Loss</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intents.map((intent) => {
                  const status = intent.status as keyof typeof statusConfig;
                  const StatusIcon = statusConfig[status]?.icon || Clock;
                  
                  return (
                    <TableRow key={intent.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(intent.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {(intent.books as { name: string } | null)?.name || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{intent.instrument}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {intent.direction === 'buy' ? (
                            <TrendingUp className="h-4 w-4 text-success" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-destructive" />
                          )}
                          <span className={cn(
                            'uppercase font-medium text-sm',
                            intent.direction === 'buy' ? 'text-success' : 'text-destructive'
                          )}>
                            {intent.direction}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(intent.target_exposure_usd)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {formatCurrency(intent.max_loss_usd)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                intent.confidence > 0.7 ? 'bg-success' :
                                intent.confidence > 0.4 ? 'bg-warning' : 'bg-muted-foreground'
                              )}
                              style={{ width: `${intent.confidence * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm">
                            {(intent.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <StatusIcon className={cn('h-4 w-4', statusConfig[status]?.color)} />
                          <Badge variant={statusConfig[status]?.variant || 'secondary'}>
                            {intent.status}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No trade intents yet</p>
            <p className="text-sm">Intents appear when strategies generate signals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
