import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  Zap,
  Target,
  Percent,
  ArrowRightLeft
} from 'lucide-react';
import { 
  useFundingOpportunities, 
  useActiveFundingPositions, 
  useExecuteFundingArb,
  useCloseFundingPosition,
  FundingOpportunity,
  FundingPosition
} from '@/hooks/useFundingArbitrage';
import { formatDistanceToNow } from 'date-fns';

interface FundingArbitragePanelProps {
  compact?: boolean;
}

export function FundingArbitragePanel({ compact = false }: FundingArbitragePanelProps) {
  const [paperMode, setPaperMode] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<FundingOpportunity | null>(null);
  const [tradeSize, setTradeSize] = useState('1000');
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);

  const { data: oppData, isLoading: loadingOpps, refetch: refetchOpps } = useFundingOpportunities();
  const { data: positions, isLoading: loadingPositions } = useActiveFundingPositions();
  const executeMutation = useExecuteFundingArb();
  const closeMutation = useCloseFundingPosition();

  const handleExecute = () => {
    if (!selectedOpp) return;

    executeMutation.mutate({
      opportunityId: `funding_${selectedOpp.symbol}_${Date.now()}`,
      symbol: selectedOpp.symbol,
      direction: selectedOpp.direction,
      spotVenue: selectedOpp.spotVenue,
      perpVenue: selectedOpp.perpVenue,
      spotSize: parseFloat(tradeSize),
      perpSize: parseFloat(tradeSize),
      paperMode
    });

    setShowExecuteDialog(false);
    setSelectedOpp(null);
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'low': return <Badge className="bg-green-500/20 text-green-500">Low Risk</Badge>;
      case 'medium': return <Badge className="bg-yellow-500/20 text-yellow-500">Medium</Badge>;
      case 'high': return <Badge className="bg-red-500/20 text-red-500">High Risk</Badge>;
      default: return null;
    }
  };

  const renderOpportunityCard = (opp: FundingOpportunity) => (
    <div 
      key={opp.symbol} 
      className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={() => {
        setSelectedOpp(opp);
        setShowExecuteDialog(true);
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">{opp.symbol}</span>
          {getRiskBadge(opp.riskLevel)}
        </div>
        <div className="flex items-center gap-2">
          {opp.fundingRate > 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className={`font-mono font-bold ${opp.fundingRate > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {(opp.fundingRate * 100).toFixed(4)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Est. APY</p>
          <p className={`font-bold ${opp.estimatedApy > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {opp.estimatedApy.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Next Funding</p>
          <p className="text-sm font-medium">
            {formatDistanceToNow(new Date(opp.nextFundingTime), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <ArrowRightLeft className="h-3 w-3" />
          <span>{opp.spotVenue} ↔ {opp.perpVenue}</span>
        </div>
        <span className="capitalize">{opp.direction.replace(/_/g, ' ')}</span>
      </div>

      {opp.isActionable && (
        <Button 
          size="sm" 
          className="w-full mt-3 gap-2"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedOpp(opp);
            setShowExecuteDialog(true);
          }}
        >
          <Zap className="h-3 w-3" />
          Execute
        </Button>
      )}
    </div>
  );

  const renderPositionCard = (pos: FundingPosition) => (
    <div key={pos.id} className="p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold">{pos.symbol}</span>
        <Badge variant={pos.status === 'simulated' ? 'secondary' : 'default'}>
          {pos.status}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Size</p>
          <p className="font-mono">${pos.quantity.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Spread</p>
          <p className="font-mono">{pos.spread_percent.toFixed(3)}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Net P&L</p>
          <p className={`font-mono ${pos.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            ${pos.net_profit.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span>{pos.buy_exchange} → {pos.sell_exchange}</span>
        <span>{formatDistanceToNow(new Date(pos.created_at), { addSuffix: true })}</span>
      </div>

      <Button 
        size="sm" 
        variant="outline" 
        className="w-full"
        onClick={() => closeMutation.mutate({ executionId: pos.id, paperMode })}
        disabled={closeMutation.isPending}
      >
        Close Position
      </Button>
    </div>
  );

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              Funding Arbitrage
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={paperMode ? 'secondary' : 'destructive'} className="text-xs">
                {paperMode ? 'Paper' : 'Live'}
              </Badge>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => refetchOpps()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingOpps ? (
            <Skeleton className="h-24 w-full" />
          ) : oppData?.opportunities?.filter(o => o.isActionable).slice(0, 2).map(opp => (
            <div key={opp.symbol} className="flex items-center justify-between p-2 border rounded mb-2">
              <div>
                <span className="font-medium">{opp.symbol}</span>
                <span className={`ml-2 text-sm ${opp.estimatedApy > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {opp.estimatedApy.toFixed(1)}% APY
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                setSelectedOpp(opp);
                setShowExecuteDialog(true);
              }}>
                <Zap className="h-3 w-3" />
              </Button>
            </div>
          )) || (
            <p className="text-sm text-muted-foreground text-center py-4">
              No actionable opportunities
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              Funding Rate Arbitrage
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="paper-mode" className="text-sm">Paper Mode</Label>
                <Switch
                  id="paper-mode"
                  checked={paperMode}
                  onCheckedChange={setPaperMode}
                />
              </div>
              <Button 
                variant="outline"
                onClick={() => refetchOpps()}
                disabled={loadingOpps}
              >
                {loadingOpps ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {!paperMode && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg mt-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">Live trading enabled - real funds at risk</span>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="opportunities">
            <TabsList className="mb-4">
              <TabsTrigger value="opportunities" className="gap-2">
                <Target className="h-4 w-4" />
                Opportunities ({oppData?.actionable || 0})
              </TabsTrigger>
              <TabsTrigger value="positions" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Positions ({positions?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="opportunities">
              <ScrollArea className="h-[500px]">
                {loadingOpps ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
                  </div>
                ) : oppData?.opportunities?.length ? (
                  <div className="space-y-4 pr-4">
                    {oppData.opportunities.map(renderOpportunityCard)}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Percent className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No funding opportunities found</p>
                    <Button variant="outline" onClick={() => refetchOpps()} className="mt-4">
                      Scan Again
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="positions">
              <ScrollArea className="h-[500px]">
                {loadingPositions ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
                  </div>
                ) : positions?.length ? (
                  <div className="space-y-4 pr-4">
                    {positions.map(renderPositionCard)}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No active positions</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Execute Dialog */}
      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Execute Funding Arbitrage</DialogTitle>
            <DialogDescription>
              {selectedOpp?.symbol} - {selectedOpp?.direction.replace(/_/g, ' ')}
            </DialogDescription>
          </DialogHeader>

          {selectedOpp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Funding Rate</p>
                  <p className={`font-bold ${selectedOpp.fundingRate > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(selectedOpp.fundingRate * 100).toFixed(4)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Est. APY</p>
                  <p className="font-bold text-green-500">{selectedOpp.estimatedApy.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Spot Venue</p>
                  <p className="font-medium capitalize">{selectedOpp.spotVenue}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Perp Venue</p>
                  <p className="font-medium capitalize">{selectedOpp.perpVenue}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trade-size">Position Size (USD)</Label>
                <Input
                  id="trade-size"
                  type="number"
                  value={tradeSize}
                  onChange={(e) => setTradeSize(e.target.value)}
                  placeholder="1000"
                />
              </div>

              {!paperMode && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">This will execute real trades with real funds!</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExecuteDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="gap-2"
            >
              {executeMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {paperMode ? 'Paper Trade' : 'Execute Live'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
