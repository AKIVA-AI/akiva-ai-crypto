import { usePositions } from '@/hooks/usePositions';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

export function PositionsTable() {
  const { data: positions = [], isLoading } = usePositions();

  const totalPnl = positions.reduce((sum, p) => sum + Number(p.unrealized_pnl || 0), 0);

  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl p-4 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Open Positions</h3>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>No open positions</p>
          <p className="text-sm">Positions will appear here when created</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Open Positions</h3>
        <div className={cn(
          'flex items-center gap-1 text-sm font-mono font-medium',
          totalPnl >= 0 ? 'text-success' : 'text-destructive'
        )}>
          {totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          ${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full data-grid">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="pb-3 font-medium">Instrument</th>
              <th className="pb-3 font-medium">Side</th>
              <th className="pb-3 font-medium text-right">Size</th>
              <th className="pb-3 font-medium text-right">Entry</th>
              <th className="pb-3 font-medium text-right">Mark</th>
              <th className="pb-3 font-medium text-right">uPnL</th>
              <th className="pb-3 font-medium text-right">Leverage</th>
              <th className="pb-3 font-medium text-right">Venue</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const unrealizedPnl = Number(pos.unrealized_pnl || 0);
              const entryPrice = Number(pos.entry_price || 0);
              const size = Number(pos.size || 0);
              const pnlPercent = entryPrice * size > 0 ? (unrealizedPnl / (entryPrice * size)) * 100 : 0;
              
              return (
                <tr key={pos.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="py-3 font-medium">{pos.instrument}</td>
                  <td className="py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      pos.side === 'buy' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                    )}>
                      {pos.side === 'buy' ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="py-3 text-right">{size.toLocaleString()}</td>
                  <td className="py-3 text-right">${entryPrice.toLocaleString()}</td>
                  <td className="py-3 text-right">${Number(pos.mark_price || 0).toLocaleString()}</td>
                  <td className={cn(
                    'py-3 text-right font-medium',
                    unrealizedPnl >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs ml-1">({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)</span>
                  </td>
                  <td className="py-3 text-right">{Number(pos.leverage || 1)}x</td>
                  <td className="py-3 text-right text-muted-foreground">
                    {(pos as unknown as { venues?: { name: string } | null }).venues?.name || 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
