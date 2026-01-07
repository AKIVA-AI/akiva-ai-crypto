import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Activity, Compass, Layers } from 'lucide-react';
import { useAllocatorDecisions } from '@/hooks/useAllocatorDecisions';
import { useMarketRegimes } from '@/hooks/useMarketRegimes';
import { useStrategyAllocations } from '@/hooks/useStrategyAllocations';
import { StrategyPositionsPanel } from '@/components/allocator/StrategyPositionsPanel';
import { useStrategies } from '@/hooks/useStrategies';

export function CapitalAllocatorPanel() {
  const { data: regimes, isLoading: regimesLoading } = useMarketRegimes();
  const { data: allocations, isLoading: allocationsLoading } = useStrategyAllocations();
  const { data: decisions, isLoading: decisionsLoading } = useAllocatorDecisions();
  const { data: strategies } = useStrategies();

  const latestRegime = regimes?.[0];

  interface Strategy {
    id: string;
    name: string;
  }

  const strategyNameById = useMemo(() => {
    const map = new Map<string, string>();
    (strategies ?? []).forEach((strategy: Strategy) => {
      map.set(strategy.id, strategy.name);
    });
    return map;
  }, [strategies]);

  const allocationRows = (allocations ?? []).slice(0, 10).map((allocation) => ({
    id: allocation.id,
    name: strategyNameById.get(allocation.strategy_id) ?? allocation.strategy_id,
    allocationPct: allocation.allocation_pct,
    allocatedCapital: allocation.allocated_capital,
    leverageCap: allocation.leverage_cap,
    riskMultiplier: allocation.risk_multiplier,
    updatedAt: allocation.updated_at,
  }));

  return (
    <div className="space-y-4">
      <Card className="glass-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Compass className="h-4 w-4" />
            Current Market Regime
          </CardTitle>
        </CardHeader>
        <CardContent>
          {regimesLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : latestRegime ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Direction', value: latestRegime.direction },
                { label: 'Volatility', value: latestRegime.volatility },
                { label: 'Liquidity', value: latestRegime.liquidity },
                { label: 'Risk Bias', value: latestRegime.risk_bias },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold capitalize">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No regime data yet.</div>
          )}
        </CardContent>
      </Card>

      <StrategyPositionsPanel />

      <Card className="glass-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Strategy Allocations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allocationsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((idx) => (
                <Skeleton key={idx} className="h-10 w-full" />
              ))}
            </div>
          ) : allocationRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No allocations recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {allocationRows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">Updated {new Date(row.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline">{(row.allocationPct * 100).toFixed(2)}%</Badge>
                    <Badge variant="secondary">${row.allocatedCapital.toFixed(0)}</Badge>
                    <Badge variant="outline">Lev {row.leverageCap.toFixed(2)}x</Badge>
                    <Badge variant="outline">Risk {row.riskMultiplier.toFixed(2)}x</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Allocator Decisions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {decisionsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : (decisions ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No allocator decisions recorded yet.</div>
          ) : (
            <ScrollArea className="h-48">
              <div className="space-y-3 pr-3">
                {(decisions ?? []).slice(0, 10).map((decision) => (
                  <div key={decision.id} className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(decision.ts).toLocaleString()}
                      </span>
                      <Badge variant="outline">{decision.decision_id.slice(0, 8)}</Badge>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries(decision.regime_state || {}).slice(0, 3).map(([key, value]) => (
                        <Badge key={key} variant="secondary" className="capitalize">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                      {(decision.regime_state && Object.keys(decision.regime_state).length === 0) && (
                        <span className="text-muted-foreground">No regime metadata</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
