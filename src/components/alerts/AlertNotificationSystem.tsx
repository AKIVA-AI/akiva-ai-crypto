import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import type { AlertPayload, RiskBreachPayload, CircuitBreakerPayload } from '@/types';

interface AlertConfig {
  enableSound: boolean;
  enableDesktopNotifications: boolean;
  soundVolume: number;
  criticalOnly: boolean;
}

const DEFAULT_CONFIG: AlertConfig = {
  enableSound: true,
  enableDesktopNotifications: true,
  soundVolume: 0.5,
  criticalOnly: false,
};

// Sound URLs (using web audio for reliability)
const ALERT_SOUNDS = {
  critical: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJuhn5N8aX5+lpuYko2JhYKDgIJ+fHt7fYGDhYmKiomJh4SDgYGBgYGDhIaIiouKiIaCf31+fn+Bg4aIiYmIhoSBf3+AgIKEhYaIiYmIhoWCgH9/gICCg4SGiImJiIeFg4GAgICBgoSFh4iIiIeFg4GAf4CAgYOEhYeHiIeGhIOBgICAgoOFhoiIiIeGhIKAgICBgoOFhoeIh4eGhIKAgICBgoOEhoaHh4aFhIOBgICBgoOEhoaHhoaFhIOBgICBgoOEhYaGhoaFhIKBgICBgoOEhYaGhoWEg4GAgIGCg4WFhoaFhYSCgYCAgYKDhIWFhYWEg4KBgICBgoOEhYWFhYSEgoGAgYGCg4SEhYWFhIOCgYCAgYKDhISEhYSEg4KBgIGBgoOEhISEhISCgoGAgIGCg4SEhISEg4OCgYGAgYKDhISEhISEg4KBgYGBgoODhISEhIODgoGBgYGCg4OEhISDg4OCgYGBgYKDg4SEhIODgoKBgYGBgoODhISEg4OCgoGBgYGCg4OEhISDgoKBgYGBgYKDg4OEhIOCgoGBgYGCgoODg4SDgoKBgYGBgoKDg4ODg4KCgYGBgYKCg4ODg4OCgoGBgYGCgoODg4OCgoKBgYGBgoKDg4ODgoKCgYGBgYKCg4ODg4KCgoGBgYGCgoKDg4OCgoKBgYGBgoKDg4ODgoKBgYGBgYKCg4ODgoKCgYGBgYKCg4ODg4KCgYGBgYGCgoODg4KCgYGBgYGCgoODg4KCgYGBgYGCgoODg4KCgYGBgYGBgoODg4KCgYGBgYGCgoKDg4KCgYGBgYGCgoKDg4KCgYGBgYGCgoKDg4KCgYGBgYGCgoKDg4KCgYGBgYGCgoKCg4KCgYGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgYGCgoKCgoKCgYGBgYKCgoKCgoKBgYGBgoKCgoKCgoGBgQ==',
  warning: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJiVkYh7cXl+iI2Mi4mGhIKBgH9/f39/gIGCg4SEhISDgoGAgH9/gIGBgoODhISEg4KBgH9/f4CBgoKDg4SEhIOCgYB/f4CAgYKCg4OEhISDgoGAf4CAgIGCgoODhISDg4KBAH+AgIGBgoODg4SEg4OCgYB/gICBgYKCg4OEg4ODgoGAf4CAgYGCgoODg4ODg4KBgH+AgIGBgoKDg4ODg4OCgYB/gICBgYKCg4ODg4OCgoGAf4CAgYGCgoKDg4ODgoKBgH+AgIGBgoKCg4ODgoKBgYB/gICBgYKCgoODg4KCgYGAf4CAgYGCgoKDg4KCgoGBf4CAgIGBgoKCg4OCgoKBgH+AgICBgYKCgoKDgoKCgYB/gICBgYGCgoKDgoKCgYGAf4CAgYGBgoKCgoKCgoGBf4CAgIGBgoKCgoKCgoGBgH+AgIGBgYKCgoKCgoGBgH+AgICBgYKCgoKCgoGBgH+AgICBgYKCgoKCgoGBgH+AgICBgYKCgoKCgoGBgH+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBf3+AgICBgYKCgoKCgYGBfw==',
  info: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJCOi4d8dHV4foOFhYWEg4KBgH9/f3+AgIGBgoKDg4ODg4KCgYGAf3+AgIGBgoKCg4ODg4KCgYGAf4CAgIGBgoKCg4ODgoKCgYCAf4CAgYGBgoKCg4OCgoKBgYCAf4CAgYGBgoKCgoOCgoKBgYCAf4CAgYGBgoKCgoKCgoKBgYCAf4CAgIGBgoKCgoKCgoKBgYCAf4CAgIGBgoKCgoKCgoGBgYCAf4CAgIGBgoKCgoKCgoGBgYCAf4CAgIGBgoKCgoKCgYGBgIB/gICAgYGCgoKCgoKBgYGBgH+AgICBgYGCgoKCgoGBgYGAf4CAgIGBgYKCgoKCgYGBgYB/gICAgYGBgoKCgoKBgYGBgH+AgICAgYGCgoKCgoGBgYGAf4CAgIGBgYKCgoKCgYGBgYB/gICAgYGBgoKCgoKBgYGBgH+AgICBgYGCgoKCgoGBgYGAf4CAgICBgYKCgoKCgYGBgYB/gICAgYGBgoKCgoKBgYGBgH+AgICBgYGCgoKCgoGBgYGAf4CAgICBgYKCgoKCgYGBgYB/gICAgYGBgoKCgoKBgYGBgH+AgICBgYGCgoKCgoGBgYGAf4CAgICBgYKCgoKCgYGBgYB/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf3+AgICBgYGCgoKCgYGBgYF/f4CAgIGBgYKCgoKBgYGBgX9/gICAgYGBgoKCgoGBgYGBf39/',
};

export function useAlertNotifications(config: Partial<AlertConfig> = {}) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const queryClient = useQueryClient();
  const { toast: uiToast } = useToast();
  
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const playSound = useCallback((severity: 'critical' | 'warning' | 'info') => {
    if (!mergedConfig.enableSound) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const audio = new Audio(ALERT_SOUNDS[severity]);
      audio.volume = mergedConfig.soundVolume;
      audio.play().catch(console.error);
    } catch (error) {
      console.error('Failed to play alert sound:', error);
    }
  }, [mergedConfig.enableSound, mergedConfig.soundVolume]);

  const showDesktopNotification = useCallback((title: string, body: string, severity: string) => {
    if (!mergedConfig.enableDesktopNotifications) return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️',
        tag: `alert-${Date.now()}`,
        requireInteraction: severity === 'critical',
      });
    }
  }, [mergedConfig.enableDesktopNotifications]);

  const handleAlert = useCallback((payload: { new: AlertPayload | null }) => {
    const alert = payload.new;
    if (!alert) return;

    const severity = alert.severity || 'info';
    const title = alert.title || 'New Alert';
    const message = alert.message || '';

    // Skip non-critical if configured
    if (mergedConfig.criticalOnly && severity !== 'critical') return;

    // Play sound
    playSound(severity);

    // Show toast with appropriate styling
    switch (severity) {
      case 'critical':
        toast.error(`🚨 ${title}`, {
          description: message,
          duration: 15000,
        });
        break;
      case 'warning':
        toast.warning(`⚠️ ${title}`, {
          description: message,
          duration: 8000,
        });
        break;
      default:
        toast.info(title, {
          description: message,
          duration: 5000,
        });
    }

    // Show desktop notification for critical alerts
    if (severity === 'critical' || severity === 'warning') {
      showDesktopNotification(title, message, severity);
    }

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  }, [mergedConfig.criticalOnly, playSound, showDesktopNotification, queryClient]);

  const handleRiskBreach = useCallback((payload: { new: RiskBreachPayload | null }) => {
    const breach = payload.new;
    if (!breach) return;

    const severity = breach.severity || 'warning';
    const description = breach.description || 'Risk limit exceeded';

    playSound(severity === 'critical' ? 'critical' : 'warning');

    toast.error(`🛡️ Risk Breach: ${breach.breach_type}`, {
      description,
      duration: 10000,
      action: {
        label: 'View',
        onClick: () => window.location.href = '/risk',
      },
    });

    showDesktopNotification('Risk Breach', description, 'critical');
    queryClient.invalidateQueries({ queryKey: ['risk-breaches'] });
  }, [playSound, showDesktopNotification, queryClient]);

  const handleCircuitBreaker = useCallback((payload: { new: CircuitBreakerPayload | null }) => {
    const event = payload.new;
    if (!event) return;

    playSound('critical');

    toast.error(`⚡ Circuit Breaker Triggered`, {
      description: `${event.trigger_type}: ${event.action_taken}`,
      duration: 20000,
    });

    showDesktopNotification(
      'Circuit Breaker Activated',
      `${event.trigger_type}: ${event.action_taken}`,
      'critical'
    );

    queryClient.invalidateQueries({ queryKey: ['circuit-breaker-events'] });
  }, [playSound, showDesktopNotification, queryClient]);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Subscribe to alerts
    const alertsChannel = supabase
      .channel('alerts-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts' },
        (payload) => handleAlert(payload as unknown as { new: AlertPayload | null })
      )
      .subscribe();

    // Subscribe to risk breaches
    const riskChannel = supabase
      .channel('risk-breach-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'risk_breaches' },
        (payload) => handleRiskBreach(payload as unknown as { new: RiskBreachPayload | null })
      )
      .subscribe();

    // Subscribe to circuit breaker events
    const circuitChannel = supabase
      .channel('circuit-breaker-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'circuit_breaker_events' },
        (payload) => handleCircuitBreaker(payload as unknown as { new: CircuitBreakerPayload | null })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(riskChannel);
      supabase.removeChannel(circuitChannel);
    };
  }, [handleAlert, handleRiskBreach, handleCircuitBreaker]);

  return {
    requestNotificationPermission: () => {
      if ('Notification' in window) {
        Notification.requestPermission();
      }
    },
  };
}

export function AlertNotificationProvider({ children }: { children: React.ReactNode }) {
  useAlertNotifications();
  return <>{children}</>;
}
