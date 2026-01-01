/**
 * User Mode Selector Component
 * 
 * Allows users to switch between progressive trading modes
 * with clear explanations of each mode's capabilities and limits.
 */

import { useState } from 'react';
import { useUserMode } from '@/contexts/UserModeContext';
import { USER_MODES, UserMode } from '@/lib/userModes';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown,
  Eye,
  FileEdit,
  Lock,
  Zap,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODE_ICONS: Record<UserMode, React.ReactNode> = {
  observer: <Eye className="h-4 w-4" />,
  paper: <FileEdit className="h-4 w-4" />,
  guarded: <Shield className="h-4 w-4" />,
  advanced: <Zap className="h-4 w-4" />,
};

export function UserModeSelector() {
  const { mode, modeConfig, setMode, isLoading } = useUserMode();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <span className="w-4 h-4 animate-pulse bg-muted rounded" />
        Loading...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 min-w-[140px] justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="text-base">{modeConfig.icon}</span>
            <span className="font-medium">{modeConfig.name}</span>
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[400px] p-0" align="end">
        <div className="p-4 border-b">
          <h4 className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Choose Your Trading Mode
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            Start safe, grow gradually. Each mode has appropriate protections.
          </p>
        </div>
        
        <div className="p-2 space-y-1">
          {(Object.keys(USER_MODES) as UserMode[]).map((modeKey) => {
            const config = USER_MODES[modeKey];
            const isSelected = mode === modeKey;
            const canLive = config.features.canLiveTrade;
            
            return (
              <button
                key={modeKey}
                onClick={() => {
                  setMode(modeKey);
                  setOpen(false);
                }}
                className={cn(
                  "w-full p-3 rounded-lg text-left transition-colors",
                  "hover:bg-muted/50",
                  isSelected && "bg-primary/10 border border-primary/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{config.icon}</span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.name}</span>
                      {isSelected && (
                        <Badge variant="secondary" className="text-[10px]">
                          Current
                        </Badge>
                      )}
                      {canLive ? (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] text-success border-success/30"
                        >
                          Live Trading
                        </Badge>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className="text-[10px] text-muted-foreground"
                        >
                          View Only
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {config.tagline}
                    </p>
                    
                    {/* Risk limits preview */}
                    {canLive && (
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>
                          Max position: {config.riskLimits.maxPositionSizePercent}%
                        </span>
                        <span>
                          Max exposure: {config.riskLimits.maxTotalExposurePercent}%
                        </span>
                        <span>
                          Daily limit: {config.riskLimits.maxDailyLossPercent}%
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {isSelected && (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              <strong>Safety first:</strong> Core risk controls (kill switch, daily limits) 
              are always active in all modes. You cannot disable fundamental protections.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
