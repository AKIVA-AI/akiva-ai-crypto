import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenues } from '@/hooks/useVenues';
import { useUnreadAlertsCount } from '@/hooks/useAlerts';
import { useBooks } from '@/hooks/useBooks';
import { useGlobalSettings } from '@/hooks/useControlPlane';

interface GlobalStatus {
  // Kill switch state
  globalKillSwitch: boolean;
  reduceOnlyMode: boolean;
  paperTradingMode: boolean;
  demoMode: boolean;
  
  // Venue health
  venuesDegraded: number;
  venuesOffline: number;
  totalVenues: number;
  
  // Alerts
  unreadAlertsCount: number;
  criticalAlerts: number;
  
  // Active book
  activeBookId: string | null;
  setActiveBookId: (id: string | null) => void;
  
  // Backend connectivity
  backendBaseUrl: string;
  backendConnected: boolean;
  
  // Loading states
  isLoading: boolean;
}

const GlobalStatusContext = createContext<GlobalStatus | null>(null);

export function GlobalStatusProvider({ children }: { children: ReactNode }) {
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  
  const queryClient = useQueryClient();
  
  // Fetch global settings
  const { data: globalSettings, isLoading: settingsLoading } = useGlobalSettings();
  
  // Fetch venues for health status
  const { data: venues = [], isLoading: venuesLoading } = useVenues();
  
  // Fetch unread alerts count
  const { data: unreadAlertsCount = 0, isLoading: alertsLoading } = useUnreadAlertsCount();
  
  // Fetch critical alerts count
  const { data: criticalAlerts = 0 } = useQuery({
    queryKey: ['alerts', 'critical-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('severity', 'critical')
        .eq('is_resolved', false);
      
      if (error) throw error;
      return count || 0;
    },
  });
  
  // Fetch books and set default active book
  const { data: books = [] } = useBooks();
  
  useEffect(() => {
    if (books.length > 0 && !activeBookId) {
      setActiveBookId(books[0].id);
    }
  }, [books, activeBookId]);
  
  // Calculate venue health stats
  const venuesDegraded = venues.filter(v => v.status === 'degraded').length;
  const venuesOffline = venues.filter(v => v.status === 'offline').length;
  
  // Check backend connectivity
  useEffect(() => {
    const checkBackendHealth = async () => {
      if (!globalSettings?.api_base_url) {
        setBackendConnected(false);
        return;
      }
      
      try {
        const response = await fetch(`${globalSettings.api_base_url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        setBackendConnected(response.ok);
      } catch {
        setBackendConnected(false);
      }
    };
    
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(interval);
  }, [globalSettings?.api_base_url]);
  
  // Real-time subscription for global settings
  useEffect(() => {
    const channel = supabase
      .channel('global-settings-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'global_settings',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['global-settings'] });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
  
  const value: GlobalStatus = {
    globalKillSwitch: globalSettings?.global_kill_switch ?? false,
    reduceOnlyMode: globalSettings?.reduce_only_mode ?? false,
    paperTradingMode: globalSettings?.paper_trading_mode ?? false,
    demoMode: false, // Will be added to DB
    
    venuesDegraded,
    venuesOffline,
    totalVenues: venues.length,
    
    unreadAlertsCount,
    criticalAlerts,
    
    activeBookId,
    setActiveBookId,
    
    backendBaseUrl: globalSettings?.api_base_url ?? '',
    backendConnected,
    
    isLoading: settingsLoading || venuesLoading || alertsLoading,
  };
  
  return (
    <GlobalStatusContext.Provider value={value}>
      {children}
    </GlobalStatusContext.Provider>
  );
}

export function useGlobalStatus() {
  const context = useContext(GlobalStatusContext);
  if (!context) {
    throw new Error('useGlobalStatus must be used within GlobalStatusProvider');
  }
  return context;
}
