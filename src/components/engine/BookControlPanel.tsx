import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBooks } from '@/hooks/useBooks';
import { useEngineControl } from '@/hooks/useEngineControl';
import { Book, Pause, Play, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const bookTypeColors = {
  HEDGE: 'border-l-primary',
  PROP: 'border-l-warning',
  MEME: 'border-l-destructive',
};

export function BookControlPanel() {
  const { data: books, isLoading } = useBooks();
  const { engineStatus, pauseBook, resumeBook, isConnected } = useEngineControl();
  
  const pausedBookIds = engineStatus?.paused_books || [];

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Book className="h-5 w-5" />
          Book Controls
        </CardTitle>
        <CardDescription>
          Manage trading book states and capital
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading books...</div>
        ) : books && books.length > 0 ? (
          books.map((book) => {
            const isPaused = pausedBookIds.includes(book.id) || book.status === 'frozen';
            const utilization = book.capital_allocated > 0 
              ? (book.current_exposure / book.capital_allocated) * 100 
              : 0;
            
            return (
              <div
                key={book.id}
                className={cn(
                  'p-4 rounded-lg border-l-4 bg-muted/30',
                  bookTypeColors[book.type as keyof typeof bookTypeColors] || 'border-l-muted'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{book.name}</span>
                    <Badge variant="outline" className="text-xs">{book.type}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isPaused ? 'destructive' : 'success'}>
                      {isPaused ? 'Paused' : 'Active'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => isPaused ? resumeBook(book.id) : pauseBook(book.id)}
                      disabled={!isConnected}
                    >
                      {isPaused ? (
                        <Play className="h-4 w-4 text-success" />
                      ) : (
                        <Pause className="h-4 w-4 text-warning" />
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Capital</p>
                    <p className="font-mono">{formatCurrency(book.capital_allocated)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Exposure</p>
                    <p className="font-mono">{formatCurrency(book.current_exposure)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Utilization</p>
                    <p className={cn(
                      'font-mono',
                      utilization > 80 ? 'text-destructive' :
                      utilization > 60 ? 'text-warning' : 'text-success'
                    )}>
                      {utilization.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Utilization bar */}
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      utilization > 80 ? 'bg-destructive' :
                      utilization > 60 ? 'bg-warning' : 'bg-success'
                    )}
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>

                {utilization > 90 && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    High utilization - consider reducing exposure
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            No books configured
          </div>
        )}
      </CardContent>
    </Card>
  );
}
