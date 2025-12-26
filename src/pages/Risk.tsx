import { MainLayout } from '@/components/layout/MainLayout';
import { BookManagement } from '@/components/books/BookManagement';
import { KillSwitchPanel } from '@/components/risk/KillSwitchPanel';
import { useBooks } from '@/hooks/useBooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, Settings, Power, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Risk() {
  const { data: books = [], isLoading } = useBooks();
  
  // Calculate summary metrics from books
  const totalExposure = books.reduce((sum, b) => sum + Number(b.current_exposure || 0), 0);
  const totalCapital = books.reduce((sum, b) => sum + Number(b.capital_allocated || 0), 0);
  
  // Generate circuit breakers from books data
  const circuitBreakers = books.map(book => ({
    name: `${book.name} - Max Drawdown`,
    threshold: Number(book.max_drawdown_limit),
    current: Math.random() * Number(book.max_drawdown_limit) * 0.6, // Simulated current DD
    unit: '%',
    status: Math.random() > 0.8 ? 'warning' : 'ok' as 'ok' | 'warning' | 'critical',
    bookId: book.id,
  }));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              Risk Management
            </h1>
            <p className="text-muted-foreground">Exposure monitoring, book management, and circuit breakers</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" />
            Risk Settings
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Total Capital</p>
            <p className="text-2xl font-mono font-semibold">${totalCapital.toLocaleString()}</p>
          </div>
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Total Exposure</p>
            <p className="text-2xl font-mono font-semibold">${totalExposure.toLocaleString()}</p>
          </div>
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Utilization</p>
            <p className="text-2xl font-mono font-semibold text-warning">
              {totalCapital > 0 ? ((totalExposure / totalCapital) * 100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="metric-card">
            <p className="text-sm text-muted-foreground">Active Books</p>
            <p className="text-2xl font-mono font-semibold">{books.filter(b => b.status === 'active').length}</p>
          </div>
        </div>

        <Tabs defaultValue="killswitch" className="space-y-4">
          <TabsList>
            <TabsTrigger value="killswitch" className="gap-2">
              <Power className="h-4 w-4" />
              Kill Switch
            </TabsTrigger>
            <TabsTrigger value="books">Trading Books</TabsTrigger>
            <TabsTrigger value="breakers">Circuit Breakers</TabsTrigger>
            <TabsTrigger value="exposure">Exposure Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="killswitch">
            <KillSwitchPanel />
          </TabsContent>

          <TabsContent value="books">
            <BookManagement />
          </TabsContent>

          <TabsContent value="breakers">
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Circuit Breakers
                </h3>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : circuitBreakers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No circuit breakers configured</p>
                  <p className="text-sm">Create trading books to set up risk limits</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {circuitBreakers.map((breaker) => {
                    const usage = (breaker.current / breaker.threshold) * 100;
                    return (
                      <div key={breaker.name} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{breaker.name}</span>
                          <Badge variant={breaker.status === 'ok' ? 'success' : breaker.status === 'warning' ? 'warning' : 'destructive'}>
                            {breaker.status}
                          </Badge>
                        </div>
                        <Progress 
                          value={usage} 
                          className={cn(
                            'h-2 mb-2',
                            usage > 80 ? '[&>div]:bg-destructive' : usage > 60 ? '[&>div]:bg-warning' : ''
                          )} 
                        />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Current: {breaker.current.toFixed(1)}{breaker.unit}
                          </span>
                          <span className="text-muted-foreground">
                            Limit: {breaker.threshold}{breaker.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="exposure">
            <div className="glass-panel rounded-xl p-4">
              <h3 className="font-semibold mb-4">Book Exposure Matrix</h3>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : books.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No trading books</p>
                  <p className="text-sm">Create trading books to view exposure data</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full data-grid">
                    <thead>
                      <tr className="text-muted-foreground text-left">
                        <th className="pb-3 font-medium">Book</th>
                        <th className="pb-3 font-medium">Type</th>
                        <th className="pb-3 font-medium text-right">Capital</th>
                        <th className="pb-3 font-medium text-right">Exposure</th>
                        <th className="pb-3 font-medium text-right">Utilization</th>
                        <th className="pb-3 font-medium text-right">Max DD Limit</th>
                        <th className="pb-3 font-medium text-right">Risk Tier</th>
                        <th className="pb-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {books.map((book) => {
                        const utilization = Number(book.capital_allocated) > 0 
                          ? (Number(book.current_exposure) / Number(book.capital_allocated)) * 100 
                          : 0;
                        return (
                          <tr key={book.id} className="border-t border-border/50 hover:bg-muted/30">
                            <td className="py-3 font-medium">{book.name}</td>
                            <td className="py-3 text-muted-foreground">{book.type}</td>
                            <td className="py-3 text-right font-mono">${Number(book.capital_allocated).toLocaleString()}</td>
                            <td className="py-3 text-right font-mono">${Number(book.current_exposure).toLocaleString()}</td>
                            <td className={cn(
                              'py-3 text-right font-mono',
                              utilization > 80 ? 'text-destructive' : utilization > 60 ? 'text-warning' : 'text-success'
                            )}>
                              {utilization.toFixed(1)}%
                            </td>
                            <td className="py-3 text-right font-mono text-destructive">
                              -{Number(book.max_drawdown_limit)}%
                            </td>
                            <td className="py-3 text-right font-mono">{book.risk_tier}</td>
                            <td className="py-3 text-right">
                              <Badge variant={book.status === 'active' ? 'success' : 'destructive'}>
                                {book.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
