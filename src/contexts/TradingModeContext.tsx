import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  TradingMode, 
  TradingModeConfig, 
  TRADING_MODES, 
  VenueConfig,
  ArbitrageStrategy,
  getVenuesForMode,
  getIntegratedVenuesForMode,
  getArbitrageStrategiesForMode,
  detectRegion,
} from '@/lib/tradingModes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TradingModeContextValue {
  // Current mode
  mode: TradingMode;
  modeConfig: TradingModeConfig;
  
  // Detection
  detectedRegion: { country: string; isUS: boolean } | null;
  isAutoDetected: boolean;
  
  // Mode management
  setMode: (mode: TradingMode) => void;
  toggleMode: () => void;
  resetToAutoDetect: () => void;
  
  // Venue helpers
  availableVenues: VenueConfig[];
  integratedVenues: VenueConfig[];
  defaultVenue: string;
  
  // Feature checks
  canTrade: (feature: 'spot' | 'futures' | 'perpetuals' | 'margin' | 'staking' | 'options') => boolean;
  availableArbitrageStrategies: ArbitrageStrategy[];
  
  // Loading state
  isLoading: boolean;
}

const TradingModeContext = createContext<TradingModeContextValue | null>(null);

const MODE_STORAGE_KEY = 'trading_mode_preference';
const AUTO_DETECT_KEY = 'trading_mode_auto_detect';

export function TradingModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<TradingMode>('us');
  const [detectedRegion, setDetectedRegion] = useState<{ country: string; isUS: boolean } | null>(null);
  const [isAutoDetected, setIsAutoDetected] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load saved preference or detect region
  useEffect(() => {
    async function initializeMode() {
      setIsLoading(true);
      
      try {
        // Check for saved preference
        const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as TradingMode | null;
        const savedAutoDetect = localStorage.getItem(AUTO_DETECT_KEY);
        
        if (savedMode && savedAutoDetect === 'false') {
          setModeState(savedMode);
          setIsAutoDetected(false);
        } else {
          // Auto-detect region
          const region = await detectRegion();
          setDetectedRegion(region);
          setModeState(region.isUS ? 'us' : 'international');
          setIsAutoDetected(true);
        }
        
        // Also try to load from user profile if logged in
        if (user?.id) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          // Check if user has trading_mode in their profile metadata
          // For now, we just use localStorage as profiles table doesn't have this field
        }
      } catch (error) {
        console.error('Failed to initialize trading mode:', error);
        // Default to US mode for safety
        setModeState('us');
      } finally {
        setIsLoading(false);
      }
    }
    
    initializeMode();
  }, [user?.id]);

  const setMode = useCallback((newMode: TradingMode) => {
    setModeState(newMode);
    setIsAutoDetected(false);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
    localStorage.setItem(AUTO_DETECT_KEY, 'false');
  }, []);

  const toggleMode = useCallback(() => {
    const newMode = mode === 'us' ? 'international' : 'us';
    setMode(newMode);
  }, [mode, setMode]);

  const resetToAutoDetect = useCallback(async () => {
    localStorage.removeItem(MODE_STORAGE_KEY);
    localStorage.setItem(AUTO_DETECT_KEY, 'true');
    
    const region = await detectRegion();
    setDetectedRegion(region);
    setModeState(region.isUS ? 'us' : 'international');
    setIsAutoDetected(true);
  }, []);

  const modeConfig = TRADING_MODES[mode];
  const availableVenues = getVenuesForMode(mode);
  const integratedVenues = getIntegratedVenuesForMode(mode);
  const availableArbitrageStrategies = getArbitrageStrategiesForMode(mode);
  const defaultVenue = mode === 'us' ? 'coinbase' : 'binance';

  const canTrade = useCallback((feature: 'spot' | 'futures' | 'perpetuals' | 'margin' | 'staking' | 'options') => {
    return modeConfig.features[feature];
  }, [modeConfig]);

  const value: TradingModeContextValue = {
    mode,
    modeConfig,
    detectedRegion,
    isAutoDetected,
    setMode,
    toggleMode,
    resetToAutoDetect,
    availableVenues,
    integratedVenues,
    defaultVenue,
    canTrade,
    availableArbitrageStrategies,
    isLoading,
  };

  return (
    <TradingModeContext.Provider value={value}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  const context = useContext(TradingModeContext);
  if (!context) {
    throw new Error('useTradingMode must be used within a TradingModeProvider');
  }
  return context;
}
