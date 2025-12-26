import { useState } from 'react';
import { useStrategies } from '@/hooks/useStrategies';
import { useBooks } from '@/hooks/useBooks';
import { useVenues } from '@/hooks/useVenues';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Rocket, 
  Check, 
  ChevronRight, 
  AlertTriangle, 
  BarChart3,
  Settings2,
  Shield,
  Play,
  Loader2,
  Zap,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface StrategyDeploymentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategyId?: string;
}

type WizardStep = 'select' | 'configure' | 'risk' | 'review';

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select Strategy', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'configure', label: 'Configure', icon: <Settings2 className="h-4 w-4" /> },
  { id: 'risk', label: 'Risk Validation', icon: <Shield className="h-4 w-4" /> },
  { id: 'review', label: 'Deploy', icon: <Rocket className="h-4 w-4" /> },
];

export function StrategyDeploymentWizard({ open, onOpenChange, strategyId }: StrategyDeploymentWizardProps) {
  const { data: strategies = [] } = useStrategies();
  const { data: books = [] } = useBooks();
  const { data: venues = [] } = useVenues();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [isDeploying, setIsDeploying] = useState(false);
  
  // Form state
  const [selectedStrategyId, setSelectedStrategyId] = useState(strategyId || '');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [deploymentMode, setDeploymentMode] = useState<'paper' | 'live'>('paper');
  
  // Config state
  const [maxPositionSize, setMaxPositionSize] = useState(10000);
  const [maxLeverage, setMaxLeverage] = useState(3);
  const [maxDrawdown, setMaxDrawdown] = useState(5);
  const [enableAutoStop, setEnableAutoStop] = useState(true);

  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId);
  const selectedBook = books.find(b => b.id === selectedBookId);

  // Risk validation checks
  const riskChecks = [
    {
      name: 'Book Capital Available',
      passed: selectedBook ? Number(selectedBook.capital_allocated) >= maxPositionSize : false,
      message: selectedBook 
        ? `${((maxPositionSize / Number(selectedBook.capital_allocated)) * 100).toFixed(1)}% of book capital`
        : 'Select a book',
    },
    {
      name: 'Leverage Within Limits',
      passed: maxLeverage <= 10,
      message: maxLeverage <= 5 ? 'Conservative' : maxLeverage <= 10 ? 'Moderate' : 'High risk',
    },
    {
      name: 'Drawdown Protection',
      passed: enableAutoStop && maxDrawdown <= 10,
      message: enableAutoStop ? `Auto-stop at ${maxDrawdown}%` : 'No protection',
    },
    {
      name: 'Venue Connectivity',
      passed: selectedVenueIds.length > 0,
      message: `${selectedVenueIds.length} venue(s) selected`,
    },
    {
      name: 'Strategy Validation',
      passed: selectedStrategy?.status !== 'live',
      message: selectedStrategy?.status === 'live' ? 'Already deployed' : 'Ready for deployment',
    },
  ];

  const allChecksPassed = riskChecks.every(c => c.passed);

  const handleNext = () => {
    const stepOrder: WizardStep[] = ['select', 'configure', 'risk', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const stepOrder: WizardStep[] = ['select', 'configure', 'risk', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleDeploy = async () => {
    if (!selectedStrategyId || !selectedBookId) return;

    setIsDeploying(true);
    try {
      // Create deployment record
      const { error: deployError } = await supabase
        .from('deployments')
        .insert({
          strategy_id: selectedStrategyId,
          book_id: selectedBookId,
          venue_id: selectedVenueIds[0] || null,
          status: 'pending',
          config: {
            max_position_size: maxPositionSize,
            max_leverage: maxLeverage,
            max_drawdown: maxDrawdown,
            auto_stop_enabled: enableAutoStop,
            venues: selectedVenueIds,
          },
        });

      if (deployError) throw deployError;

      // Update strategy status
      const { error: strategyError } = await supabase
        .from('strategies')
        .update({ 
          status: deploymentMode === 'live' ? 'live' : 'paper',
          max_drawdown: maxDrawdown,
        })
        .eq('id', selectedStrategyId);

      if (strategyError) throw strategyError;

      toast.success(`Strategy deployed in ${deploymentMode} mode`);
      queryClient.invalidateQueries({ queryKey: ['strategies'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      onOpenChange(false);
    } catch (error) {
      toast.error('Deployment failed');
      console.error(error);
    } finally {
      setIsDeploying(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'select':
        return !!selectedStrategyId && !!selectedBookId;
      case 'configure':
        return selectedVenueIds.length > 0;
      case 'risk':
        return allChecksPassed;
      default:
        return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Deploy Strategy
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((step, index) => {
            const stepIndex = STEPS.findIndex(s => s.id === currentStep);
            const isCompleted = index < stepIndex;
            const isCurrent = step.id === currentStep;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  isCompleted && 'bg-primary/20 text-primary',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                )}>
                  {isCompleted ? <Check className="h-4 w-4" /> : step.icon}
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {currentStep === 'select' && (
            <div className="space-y-4">
              <div>
                <Label>Strategy</Label>
                <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select a strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id}>
                        <div className="flex items-center gap-2">
                          <span>{strategy.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {strategy.asset_class}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Book</Label>
                <Select value={selectedBookId} onValueChange={setSelectedBookId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select a book" />
                  </SelectTrigger>
                  <SelectContent>
                    {books.filter(b => b.status === 'active').map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        <div className="flex items-center gap-2">
                          <span>{book.name}</span>
                          <Badge variant="outline" className="text-xs">
                            ${Number(book.capital_allocated).toLocaleString()}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Deployment Mode</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <button
                    onClick={() => setDeploymentMode('paper')}
                    className={cn(
                      'p-4 rounded-lg border-2 text-left transition-all',
                      deploymentMode === 'paper'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="font-medium">Paper Trading</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Simulate with real market data
                    </p>
                  </button>
                  <button
                    onClick={() => setDeploymentMode('live')}
                    className={cn(
                      'p-4 rounded-lg border-2 text-left transition-all',
                      deploymentMode === 'live'
                        ? 'border-trading-long bg-trading-long/5'
                        : 'border-border hover:border-trading-long/50'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-trading-long" />
                      <span className="font-medium">Live Trading</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Execute real trades
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'configure' && (
            <div className="space-y-6">
              <div>
                <Label>Trading Venues</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {venues.filter(v => v.is_enabled).map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => {
                        setSelectedVenueIds(prev => 
                          prev.includes(venue.id)
                            ? prev.filter(id => id !== venue.id)
                            : [...prev, venue.id]
                        );
                      }}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all',
                        selectedVenueIds.includes(venue.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{venue.name}</span>
                        <Badge variant={venue.status === 'healthy' ? 'success' : 'warning'}>
                          {venue.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {venue.latency_ms}ms latency
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Max Position Size</Label>
                  <span className="text-sm font-mono">${maxPositionSize.toLocaleString()}</span>
                </div>
                <Slider
                  value={[maxPositionSize]}
                  onValueChange={(v) => setMaxPositionSize(v[0])}
                  min={1000}
                  max={100000}
                  step={1000}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Max Leverage</Label>
                  <span className="text-sm font-mono">{maxLeverage}x</span>
                </div>
                <Slider
                  value={[maxLeverage]}
                  onValueChange={(v) => setMaxLeverage(v[0])}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
            </div>
          )}

          {currentStep === 'risk' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Max Drawdown Limit</Label>
                  <span className="text-sm font-mono">{maxDrawdown}%</span>
                </div>
                <Slider
                  value={[maxDrawdown]}
                  onValueChange={(v) => setMaxDrawdown(v[0])}
                  min={1}
                  max={25}
                  step={0.5}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label>Auto-Stop on Drawdown</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically halt strategy when drawdown limit is reached
                  </p>
                </div>
                <Switch checked={enableAutoStop} onCheckedChange={setEnableAutoStop} />
              </div>

              <div className="space-y-2 mt-6">
                <Label className="text-sm">Risk Validation</Label>
                {riskChecks.map((check) => (
                  <div
                    key={check.name}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      check.passed ? 'border-trading-long/30 bg-trading-long/5' : 'border-trading-short/30 bg-trading-short/5'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {check.passed ? (
                        <Check className="h-4 w-4 text-trading-long" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-trading-short" />
                      )}
                      <span className="text-sm font-medium">{check.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{check.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Strategy</span>
                  <span className="font-medium">{selectedStrategy?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Book</span>
                  <span className="font-medium">{selectedBook?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <Badge className={deploymentMode === 'live' ? 'bg-trading-long/20 text-trading-long' : ''}>
                    {deploymentMode === 'live' ? 'LIVE' : 'PAPER'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Position</span>
                  <span className="font-mono">${maxPositionSize.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Leverage</span>
                  <span className="font-mono">{maxLeverage}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Drawdown Limit</span>
                  <span className="font-mono">{maxDrawdown}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venues</span>
                  <span className="font-medium">{selectedVenueIds.length} selected</span>
                </div>
              </div>

              {deploymentMode === 'live' && (
                <div className="p-4 rounded-lg border border-warning/50 bg-warning/10">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-warning">Live Trading Warning</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        This will execute real trades with real capital. Ensure all risk parameters are correct before proceeding.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 'select'}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {currentStep === 'review' ? (
              <Button 
                onClick={handleDeploy} 
                disabled={isDeploying}
                className={deploymentMode === 'live' ? 'bg-trading-long hover:bg-trading-long/90' : ''}
              >
                {isDeploying ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Deploy {deploymentMode === 'live' ? 'Live' : 'Paper'}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
