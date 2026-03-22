import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — Archetype 7 financial requirement
const WARNING_BEFORE_MS = 2 * 60 * 1000; // 2-minute warning before timeout
const ACTIVITY_THROTTLE_MS = 30 * 1000; // Throttle activity tracking to every 30s
const LS_KEY = 'ec_last_activity';

/**
 * Session timeout hook for financial compliance (Archetype 7).
 *
 * - 15-minute inactivity timeout
 * - 2-minute warning toast before auto-signout
 * - Cross-tab sync via localStorage
 * - Activity tracking: mousedown, keydown, scroll, touchstart
 */
export function useSessionTimeout() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningToastId = useRef<string | number | undefined>(undefined);
  const lastActivityRef = useRef(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    clearTimers();
    // Dismiss warning toast if visible
    if (warningToastId.current !== undefined) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = undefined;
    }
    toast.error('Session expired due to inactivity', {
      description: 'You have been signed out for security. Please sign in again.',
      duration: 10000,
    });
    await supabase.auth.signOut();
  }, [clearTimers]);

  const showWarning = useCallback(() => {
    warningToastId.current = toast.warning('Session expiring soon', {
      description: 'Your session will expire in 2 minutes due to inactivity. Move your mouse or press a key to stay signed in.',
      duration: WARNING_BEFORE_MS,
      id: 'session-timeout-warning',
    });
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();

    // Dismiss any active warning toast
    if (warningToastId.current !== undefined) {
      toast.dismiss(warningToastId.current);
      warningToastId.current = undefined;
    }

    // Set warning timer (fires 2 min before timeout)
    warningRef.current = setTimeout(showWarning, SESSION_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set signout timer
    timeoutRef.current = setTimeout(handleSignOut, SESSION_TIMEOUT_MS);
  }, [clearTimers, showWarning, handleSignOut]);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    // Throttle: only update if enough time has passed
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;

    lastActivityRef.current = now;
    try {
      localStorage.setItem(LS_KEY, String(now));
    } catch {
      // localStorage may be unavailable in some contexts
    }
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    // Initialize
    try {
      localStorage.setItem(LS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    resetTimers();

    // Track user activity
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const event of events) {
      window.addEventListener(event, recordActivity, { passive: true });
    }

    // Cross-tab sync: listen for storage changes from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        const otherTabActivity = parseInt(e.newValue, 10);
        if (!isNaN(otherTabActivity) && otherTabActivity > lastActivityRef.current) {
          lastActivityRef.current = otherTabActivity;
          resetTimers();
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimers();
      for (const event of events) {
        window.removeEventListener(event, recordActivity);
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [resetTimers, recordActivity, clearTimers]);
}
