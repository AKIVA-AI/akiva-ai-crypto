import { useState } from 'react';
import { useTradingMode } from '@/hooks/useTradingMode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { 
  Globe, 
  Flag, 
  RefreshCw, 
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
} from 'lucide-react';

export function TradingModeSelector() {
  const {
    mode,
    modeConfig,
    detectedRegion,
    isAutoDetected,
    setMode,
    toggleMode,
    resetToAutoDetect,
    availableVenues,
    canTrade,
    isLoading,
  } = useTradingMode();

  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1 animate-pulse">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Detecting...
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={cn(
            "gap-2 h-8",
            mode === 'us' 
              ? "border-blue-500/50 text-blue-500" 
              : "border-amber-500/50 text-amber-500"
          )}
        >
          {mode === 'us' ? (
            <Flag className="h-3 w-3" />
          ) : (
            <Globe className="h-3 w-3" />
          )}
          {modeConfig.label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              Trading Mode
              {isAutoDetected && (
                <Badge variant="outline" className="text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  Auto-detected
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              {detectedRegion 
                ? `Detected: ${detectedRegion.country}` 
                : 'Select your trading region'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Flag className={cn(
                  "h-4 w-4",
                  mode === 'us' ? "text-blue-500" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  mode === 'us' ? "text-foreground" : "text-muted-foreground"
                )}>
                  US Mode
                </span>
              </div>
              <Switch 
                checked={mode === 'international'}
                onCheckedChange={() => toggleMode()}
              />
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  mode === 'international' ? "text-foreground" : "text-muted-foreground"
                )}>
                  International
                </span>
                <Globe className={cn(
                  "h-4 w-4",
                  mode === 'international' ? "text-amber-500" : "text-muted-foreground"
                )} />
              </div>
            </div>

            {!isAutoDetected && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => {
                  resetToAutoDetect();
                  setOpen(false);
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reset to auto-detect
              </Button>
            )}

            <Separator />

            {/* Feature Availability */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Available Features</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <FeatureCheck label="Spot" available={canTrade('spot')} />
                <FeatureCheck label="Futures" available={canTrade('futures')} />
                <FeatureCheck label="Perpetuals" available={canTrade('perpetuals')} />
                <FeatureCheck label="Margin" available={canTrade('margin')} />
                <FeatureCheck label="Staking" available={canTrade('staking')} />
                <FeatureCheck label="Options" available={canTrade('options')} />
              </div>
            </div>

            <Separator />

            {/* Available Venues */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Available Exchanges</p>
              <div className="flex flex-wrap gap-1">
                {availableVenues.map((venue) => (
                  <Badge 
                    key={venue.id} 
                    variant="outline" 
                    className={cn(
                      "text-xs gap-1",
                      venue.apiIntegrated 
                        ? "border-success/50 text-success" 
                        : "border-muted"
                    )}
                  >
                    <span>{venue.icon}</span>
                    {venue.name}
                    {venue.apiIntegrated && (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                  </Badge>
                ))}
              </div>
            </div>

            {mode === 'international' && (
              <div className="p-2 rounded bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <p className="text-xs text-warning">
                    International mode includes non-US compliant venues. Ensure you are eligible to use these services.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

function FeatureCheck({ label, available }: { label: string; available: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5",
      available ? "text-foreground" : "text-muted-foreground"
    )}>
      {available ? (
        <CheckCircle2 className="h-3 w-3 text-success" />
      ) : (
        <XCircle className="h-3 w-3 text-muted-foreground" />
      )}
      {label}
    </div>
  );
}
