import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HeatMapCell {
  instrument: string;
  venue: string;
  venueId: string;
  exposure: number;
  pnl: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  positionCount: number;
}

export function PositionHeatMap() {
  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ['positions-heatmap'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select('*, venue:venues(name)')
        .eq('is_open', true);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['venues-heatmap'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name')
        .eq('is_enabled', true);
      
      if (error) throw error;
      return data;
    },
  });

  const { heatMapData, instruments, venueList, totalExposure } = useMemo(() => {
    if (!positions?.length) {
      // Return empty state when no positions
      return {
        heatMapData: [],
        instruments: [],
        venueList: [],
        totalExposure: 0,
      };
    }

    // Group positions by instrument and venue
    const grouped: Record<string, HeatMapCell> = {};
    const instrumentSet = new Set<string>();
    const venueSet = new Set<string>();

    positions.forEach(pos => {
      const venueName = (pos.venue as { name: string } | null)?.name || 'Unknown';
      const key = `${pos.instrument}-${venueName}`;
      
      instrumentSet.add(pos.instrument);
      venueSet.add(venueName);

      const exposure = pos.size * pos.mark_price;
      const pnl = pos.unrealized_pnl + pos.realized_pnl;

      if (grouped[key]) {
        grouped[key].exposure += exposure;
        grouped[key].pnl += pnl;
        grouped[key].positionCount += 1;
      } else {
        grouped[key] = {
          instrument: pos.instrument,
          venue: venueName,
          venueId: pos.venue_id || '',
          exposure,
          pnl,
          riskLevel: 'low',
          positionCount: 1,
        };
      }
    });

    // Calculate risk levels
    const cells = Object.values(grouped);
    const maxExposure = Math.max(...cells.map(c => c.exposure), 1);
    
    cells.forEach(cell => {
      const ratio = cell.exposure / maxExposure;
      cell.riskLevel = ratio > 0.8 ? 'critical' : ratio > 0.5 ? 'high' : ratio > 0.25 ? 'medium' : 'low';
    });

    return {
      heatMapData: cells,
      instruments: Array.from(instrumentSet),
      venueList: Array.from(venueSet),
      totalExposure: cells.reduce((sum, cell) => sum + cell.exposure, 0),
    };
  }, [positions, venues]);

  const getCell = (instrument: string, venue: string) => {
    return heatMapData.find(c => c.instrument === instrument && c.venue === venue);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-destructive/80';
      case 'high': return 'bg-orange-500/70';
      case 'medium': return 'bg-yellow-500/50';
      case 'low': return 'bg-success/40';
      default: return 'bg-muted/30';
    }
  };

  if (positionsLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Position Heat Map</h3>
          <p className="text-xs text-muted-foreground">Exposure by instrument & venue</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-success/40" />
            <span className="text-xs text-muted-foreground">Low</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-yellow-500/50" />
            <span className="text-xs text-muted-foreground">Med</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-500/70" />
            <span className="text-xs text-muted-foreground">High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-destructive/80" />
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <TooltipProvider>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground p-2">Instrument</th>
                {venueList.map(venue => (
                  <th key={venue} className="text-center text-xs font-medium text-muted-foreground p-2">
                    {venue}
                  </th>
                ))}
                <th className="text-right text-xs font-medium text-muted-foreground p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map(instrument => {
                const rowTotal = heatMapData
                  .filter(c => c.instrument === instrument)
                  .reduce((sum, c) => sum + c.exposure, 0);
                const rowPnl = heatMapData
                  .filter(c => c.instrument === instrument)
                  .reduce((sum, c) => sum + c.pnl, 0);

                return (
                  <tr key={instrument} className="border-t border-border/50">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{instrument}</span>
                        {rowPnl !== 0 && (
                          rowPnl > 0 ? (
                            <TrendingUp className="h-3 w-3 text-success" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )
                        )}
                      </div>
                    </td>
                    {venueList.map(venue => {
                      const cell = getCell(instrument, venue);
                      
                      if (!cell || cell.exposure === 0) {
                        return (
                          <td key={venue} className="p-2">
                            <div className="w-full h-12 rounded bg-muted/20 flex items-center justify-center">
                              <Minus className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={venue} className="p-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                'w-full h-12 rounded flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-105',
                                getRiskColor(cell.riskLevel)
                              )}>
                                <span className="text-xs font-mono font-medium">
                                  ${(cell.exposure / 1000).toFixed(1)}k
                                </span>
                                <span className={cn(
                                  'text-[10px]',
                                  cell.pnl >= 0 ? 'text-success' : 'text-destructive'
                                )}>
                                  {cell.pnl >= 0 ? '+' : ''}{cell.pnl.toFixed(0)}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1 text-xs">
                                <p className="font-medium">{instrument} @ {venue}</p>
                                <p>Exposure: ${cell.exposure.toLocaleString()}</p>
                                <p>P&L: ${cell.pnl.toLocaleString()}</p>
                                <p>Positions: {cell.positionCount}</p>
                                <Badge variant="outline" className="mt-1">
                                  {cell.riskLevel.toUpperCase()} RISK
                                </Badge>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                    <td className="p-2 text-right">
                      <div className="text-sm font-mono font-medium">
                        ${(rowTotal / 1000).toFixed(1)}k
                      </div>
                      <div className={cn(
                        'text-xs',
                        rowPnl >= 0 ? 'text-success' : 'text-destructive'
                      )}>
                        {rowPnl >= 0 ? '+' : ''}${rowPnl.toFixed(0)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="p-2 font-medium text-sm">Total Exposure</td>
                <td colSpan={venueList.length} />
                <td className="p-2 text-right">
                  <span className="text-lg font-mono font-bold">
                    ${(totalExposure / 1000).toFixed(1)}k
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </TooltipProvider>
      </div>
    </Card>
  );
}
