/**
 * User Mode Context
 * 
 * Manages progressive user modes (Observer → Paper → Guarded → Advanced)
 * and provides mode-aware permissions throughout the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { 
  UserMode, 
  UserModeConfig, 
  USER_MODES, 
  getModeConfig,
  validateTradeAgainstMode,
  getRecommendedMode 
} from '@/lib/userModes';

interface UserModeContextValue {
  // Current mode
  mode: UserMode;
  modeConfig: UserModeConfig;
  
  // Mode management
  setMode: (mode: UserMode) => void;
  upgradeMode: () => void;
  downgradeMode: () => void;
  
  // Permissions
  canTrade: boolean;
  canPaperTrade: boolean;
  canModifyRiskLimits: boolean;
  
  // Limits
  riskLimits: UserModeConfig['riskLimits'];
  safetyRails: UserModeConfig['safetyRails'];
  educationalSettings: UserModeConfig['educational'];
  
  // Validation
  validateTrade: (params: {
    positionSizePercent: number;
    currentExposurePercent: number;
    dailyLossPercent: number;
  }) => { allowed: boolean; reason?: string };
  
  // UI helpers
  requiresConfirmation: boolean;
  showEducation: boolean;
  
  // Loading state
  isLoading: boolean;
}

const UserModeContext = createContext<UserModeContextValue | undefined>(undefined);

const MODE_ORDER: UserMode[] = ['observer', 'paper', 'guarded', 'advanced'];
const STORAGE_KEY = 'crypto-ops-user-mode';

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UserMode>('observer');
  const [isLoading, setIsLoading] = useState(true);
  
  // Load saved mode on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && MODE_ORDER.includes(saved as UserMode)) {
      setModeState(saved as UserMode);
    }
    setIsLoading(false);
  }, []);
  
  // Save mode changes
  const setMode = useCallback((newMode: UserMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);
  
  // Progressive mode changes
  const upgradeMode = useCallback(() => {
    const currentIndex = MODE_ORDER.indexOf(mode);
    if (currentIndex < MODE_ORDER.length - 1) {
      setMode(MODE_ORDER[currentIndex + 1]);
    }
  }, [mode, setMode]);
  
  const downgradeMode = useCallback(() => {
    const currentIndex = MODE_ORDER.indexOf(mode);
    if (currentIndex > 0) {
      setMode(MODE_ORDER[currentIndex - 1]);
    }
  }, [mode, setMode]);
  
  // Derived values
  const modeConfig = useMemo(() => getModeConfig(mode), [mode]);
  
  const validateTrade = useCallback((params: {
    positionSizePercent: number;
    currentExposurePercent: number;
    dailyLossPercent: number;
  }) => {
    return validateTradeAgainstMode(mode, params);
  }, [mode]);
  
  const value: UserModeContextValue = useMemo(() => ({
    mode,
    modeConfig,
    setMode,
    upgradeMode,
    downgradeMode,
    canTrade: modeConfig.features.canLiveTrade,
    canPaperTrade: modeConfig.features.canPaperTrade,
    canModifyRiskLimits: modeConfig.features.canModifyRiskLimits,
    riskLimits: modeConfig.riskLimits,
    safetyRails: modeConfig.safetyRails,
    educationalSettings: modeConfig.educational,
    validateTrade,
    requiresConfirmation: modeConfig.riskLimits.requireConfirmation,
    showEducation: modeConfig.educational.showExplanations,
    isLoading,
  }), [mode, modeConfig, setMode, upgradeMode, downgradeMode, validateTrade, isLoading]);
  
  return (
    <UserModeContext.Provider value={value}>
      {children}
    </UserModeContext.Provider>
  );
}

export function useUserMode() {
  const context = useContext(UserModeContext);
  if (context === undefined) {
    throw new Error('useUserMode must be used within a UserModeProvider');
  }
  return context;
}
