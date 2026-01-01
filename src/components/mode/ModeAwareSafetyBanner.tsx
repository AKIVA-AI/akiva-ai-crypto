/**
 * Mode-Aware Safety Banner
 * 
 * Shows current trading mode and active safety protections.
 * Always visible to reinforce trust and transparency.
 */

import { useUserMode } from '@/contexts/UserModeContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  Eye, 
  FileEdit, 
  Zap,
  Lock,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserModeSelector } from './UserModeSelector';

export function ModeAwareSafetyBanner() {
  const { mode, modeConfig, canTrade, safetyRails } = useUserMode();
  
  const bannerColors = {
    observer: 'bg-muted/50 border-muted',
    paper: 'bg-blue-500/10 border-blue-500/30',
    guarded: 'bg-success/10 border-success/30',
    advanced: 'bg-primary/10 border-primary/30',
  };
  
  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-2 rounded-lg border',
      bannerColors[mode]
    )}>
      <div className="flex items-center gap-4">
        {/* Mode selector */}
        <UserModeSelector />
        
        {/* Active protections */}
        <div className="flex items-center gap-2">
          {safetyRails.killSwitchEnabled && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Shield className="h-3 w-3" />
              Kill Switch Active
            </Badge>
          )}
          
          {modeConfig.riskLimits.requireConfirmation && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              Trade Confirmation Required
            </Badge>
          )}
          
          {!canTrade && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Eye className="h-3 w-3" />
              View Only
            </Badge>
          )}
        </div>
      </div>
      
      {/* Risk limits summary */}
      {canTrade && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Position limit: <strong>{modeConfig.riskLimits.maxPositionSizePercent}%</strong>
          </span>
          <span>
            Exposure limit: <strong>{modeConfig.riskLimits.maxTotalExposurePercent}%</strong>
          </span>
          <span>
            Daily stop: <strong>{modeConfig.riskLimits.maxDailyLossPercent}%</strong>
          </span>
        </div>
      )}
    </div>
  );
}
