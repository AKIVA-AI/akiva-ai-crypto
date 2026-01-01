/**
 * Progressive User Modes System
 * 
 * Designed to help users grow from observers to advanced traders
 * with appropriate safety rails at every level.
 * 
 * Philosophy: Safety before profit, education embedded, no false promises
 */

export type UserMode = 'observer' | 'paper' | 'guarded' | 'advanced';

export interface UserModeConfig {
  id: UserMode;
  name: string;
  icon: string;
  description: string;
  tagline: string;
  features: {
    canViewDashboard: boolean;
    canViewStrategies: boolean;
    canViewAgents: boolean;
    canPaperTrade: boolean;
    canLiveTrade: boolean;
    canModifyRiskLimits: boolean;
    canDisableSafetyRails: boolean;
  };
  riskLimits: {
    maxPositionSizePercent: number;    // % of capital per position
    maxTotalExposurePercent: number;   // % of capital at risk
    maxDailyLossPercent: number;       // Daily stop loss
    forceReduceOnly: boolean;          // Only allow position-reducing trades
    requireConfirmation: boolean;      // Require confirmation for trades
  };
  safetyRails: {
    killSwitchVisible: boolean;
    killSwitchEnabled: boolean;
    reduceOnlyToggle: boolean;
    autoStopLoss: boolean;
    executionCostWarnings: boolean;
    regimeWarnings: boolean;
  };
  educational: {
    showExplanations: boolean;
    showRiskEducation: boolean;
    showMarketRegime: boolean;
    showDecisionReasons: boolean;
    showCostBreakdown: boolean;
  };
}

export const USER_MODES: Record<UserMode, UserModeConfig> = {
  observer: {
    id: 'observer',
    name: 'Observer',
    icon: '👁️',
    description: 'Watch and learn without any capital at risk',
    tagline: 'Perfect for learning how markets and strategies work',
    features: {
      canViewDashboard: true,
      canViewStrategies: true,
      canViewAgents: true,
      canPaperTrade: false,
      canLiveTrade: false,
      canModifyRiskLimits: false,
      canDisableSafetyRails: false,
    },
    riskLimits: {
      maxPositionSizePercent: 0,
      maxTotalExposurePercent: 0,
      maxDailyLossPercent: 0,
      forceReduceOnly: true,
      requireConfirmation: true,
    },
    safetyRails: {
      killSwitchVisible: true,
      killSwitchEnabled: true,
      reduceOnlyToggle: false,
      autoStopLoss: true,
      executionCostWarnings: true,
      regimeWarnings: true,
    },
    educational: {
      showExplanations: true,
      showRiskEducation: true,
      showMarketRegime: true,
      showDecisionReasons: true,
      showCostBreakdown: true,
    },
  },
  
  paper: {
    id: 'paper',
    name: 'Paper Trading',
    icon: '📝',
    description: 'Practice with real market data, zero capital risk',
    tagline: 'Build confidence before risking real money',
    features: {
      canViewDashboard: true,
      canViewStrategies: true,
      canViewAgents: true,
      canPaperTrade: true,
      canLiveTrade: false,
      canModifyRiskLimits: true,
      canDisableSafetyRails: false,
    },
    riskLimits: {
      maxPositionSizePercent: 100, // No limit in paper mode
      maxTotalExposurePercent: 100,
      maxDailyLossPercent: 100,
      forceReduceOnly: false,
      requireConfirmation: false,
    },
    safetyRails: {
      killSwitchVisible: true,
      killSwitchEnabled: true,
      reduceOnlyToggle: true,
      autoStopLoss: true,
      executionCostWarnings: true,
      regimeWarnings: true,
    },
    educational: {
      showExplanations: true,
      showRiskEducation: true,
      showMarketRegime: true,
      showDecisionReasons: true,
      showCostBreakdown: true,
    },
  },
  
  guarded: {
    id: 'guarded',
    name: 'Guarded Live',
    icon: '🛡️',
    description: 'Live trading with aggressive safety protections',
    tagline: 'Real trading with training wheels - recommended for beginners',
    features: {
      canViewDashboard: true,
      canViewStrategies: true,
      canViewAgents: true,
      canPaperTrade: true,
      canLiveTrade: true,
      canModifyRiskLimits: false, // Cannot increase limits
      canDisableSafetyRails: false,
    },
    riskLimits: {
      maxPositionSizePercent: 2,     // Max 2% of capital per trade
      maxTotalExposurePercent: 10,   // Max 10% total exposure
      maxDailyLossPercent: 2,        // Stop trading after 2% daily loss
      forceReduceOnly: false,
      requireConfirmation: true,     // Must confirm each trade
    },
    safetyRails: {
      killSwitchVisible: true,
      killSwitchEnabled: true,       // Always enabled, always visible
      reduceOnlyToggle: true,
      autoStopLoss: true,            // Automatic stop losses
      executionCostWarnings: true,   // Warn about high costs
      regimeWarnings: true,          // Warn about unfavorable conditions
    },
    educational: {
      showExplanations: true,
      showRiskEducation: true,
      showMarketRegime: true,
      showDecisionReasons: true,
      showCostBreakdown: true,
    },
  },
  
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    icon: '⚡',
    description: 'Full control with hard limits still enforced',
    tagline: 'For experienced traders who understand the risks',
    features: {
      canViewDashboard: true,
      canViewStrategies: true,
      canViewAgents: true,
      canPaperTrade: true,
      canLiveTrade: true,
      canModifyRiskLimits: true,
      canDisableSafetyRails: false, // NEVER can disable core safety
    },
    riskLimits: {
      maxPositionSizePercent: 10,    // Max 10% per trade
      maxTotalExposurePercent: 50,   // Max 50% exposure
      maxDailyLossPercent: 5,        // 5% daily limit
      forceReduceOnly: false,
      requireConfirmation: false,
    },
    safetyRails: {
      killSwitchVisible: true,
      killSwitchEnabled: true,       // Always enabled
      reduceOnlyToggle: true,
      autoStopLoss: true,
      executionCostWarnings: true,
      regimeWarnings: true,
    },
    educational: {
      showExplanations: false,       // Can toggle off
      showRiskEducation: false,
      showMarketRegime: true,
      showDecisionReasons: true,
      showCostBreakdown: true,
    },
  },
};

// Helper functions
export function getModeConfig(mode: UserMode): UserModeConfig {
  return USER_MODES[mode];
}

export function canTrade(mode: UserMode): boolean {
  return USER_MODES[mode].features.canLiveTrade;
}

export function canPaperTrade(mode: UserMode): boolean {
  return USER_MODES[mode].features.canPaperTrade;
}

export function getRiskLimits(mode: UserMode) {
  return USER_MODES[mode].riskLimits;
}

export function getSafetyRails(mode: UserMode) {
  return USER_MODES[mode].safetyRails;
}

export function getEducationalSettings(mode: UserMode) {
  return USER_MODES[mode].educational;
}

/**
 * Check if a trade is allowed under the current mode's limits
 */
export function validateTradeAgainstMode(
  mode: UserMode,
  tradeParams: {
    positionSizePercent: number;
    currentExposurePercent: number;
    dailyLossPercent: number;
  }
): { allowed: boolean; reason?: string } {
  const limits = getRiskLimits(mode);
  
  if (!canTrade(mode) && !canPaperTrade(mode)) {
    return { allowed: false, reason: 'Trading not enabled in Observer mode' };
  }
  
  if (tradeParams.positionSizePercent > limits.maxPositionSizePercent) {
    return { 
      allowed: false, 
      reason: `Position size ${tradeParams.positionSizePercent.toFixed(1)}% exceeds ${mode} mode limit of ${limits.maxPositionSizePercent}%` 
    };
  }
  
  if (tradeParams.currentExposurePercent + tradeParams.positionSizePercent > limits.maxTotalExposurePercent) {
    return { 
      allowed: false, 
      reason: `Would exceed total exposure limit of ${limits.maxTotalExposurePercent}%` 
    };
  }
  
  if (tradeParams.dailyLossPercent >= limits.maxDailyLossPercent) {
    return { 
      allowed: false, 
      reason: `Daily loss limit of ${limits.maxDailyLossPercent}% reached - trading paused for safety` 
    };
  }
  
  return { allowed: true };
}

/**
 * Get recommended mode based on user's experience
 */
export function getRecommendedMode(params: {
  hasCompletedTutorial: boolean;
  paperTradingDays: number;
  totalTrades: number;
  winRate: number;
}): UserMode {
  const { hasCompletedTutorial, paperTradingDays, totalTrades, winRate } = params;
  
  if (!hasCompletedTutorial) {
    return 'observer';
  }
  
  if (paperTradingDays < 7 || totalTrades < 20) {
    return 'paper';
  }
  
  if (paperTradingDays < 30 || totalTrades < 100 || winRate < 0.4) {
    return 'guarded';
  }
  
  return 'advanced';
}
