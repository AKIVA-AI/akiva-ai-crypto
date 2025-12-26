import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TradingShortcutsOptions {
  onOpenTradeTicket?: () => void;
  onCloseAllPositions?: () => void;
  onToggleKillSwitch?: () => void;
  enabled?: boolean;
}

export function useTradingShortcuts({
  onOpenTradeTicket,
  onCloseAllPositions,
  onToggleKillSwitch,
  enabled = true,
}: TradingShortcutsOptions = {}) {
  const queryClient = useQueryClient();

  const closeAllPositions = useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to close all positions? This will place market orders to flatten all open positions.');
    if (!confirmed) return;

    try {
      const { data: positions, error: fetchError } = await supabase
        .from('positions')
        .select('*')
        .eq('is_open', true);

      if (fetchError) throw fetchError;

      if (!positions?.length) {
        toast.info('No open positions to close');
        return;
      }

      // Create closing orders for each position
      const closingOrders = positions.map(pos => ({
        book_id: pos.book_id,
        instrument: pos.instrument,
        side: (pos.side === 'buy' ? 'sell' : 'buy') as 'buy' | 'sell',
        size: pos.size,
        status: 'open' as const,
        strategy_id: pos.strategy_id,
        venue_id: pos.venue_id,
      }));

      const { error: orderError } = await supabase
        .from('orders')
        .insert(closingOrders);

      if (orderError) throw orderError;

      toast.success(`Closing orders placed for ${positions.length} position(s)`);
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      console.error('Failed to close positions:', error);
      toast.error('Failed to close positions');
    }
  }, [queryClient]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if user is typing in an input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    // Ctrl/Cmd + Shift + T: Open trade ticket
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      onOpenTradeTicket?.();
      toast.info('Trade ticket opened', { duration: 1500 });
      return;
    }

    // Ctrl/Cmd + Shift + X: Close all positions
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      if (onCloseAllPositions) {
        onCloseAllPositions();
      } else {
        closeAllPositions();
      }
      return;
    }

    // Ctrl/Cmd + Shift + K: Toggle kill switch
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      onToggleKillSwitch?.();
      return;
    }

    // Shift + ?: Show shortcuts help
    if (event.key === '?' && event.shiftKey) {
      event.preventDefault();
      toast.info(
        'Keyboard Shortcuts: Ctrl+Shift+T (Trade), Ctrl+Shift+X (Close All), Ctrl+Shift+K (Kill Switch)',
        { duration: 5000 }
      );
      return;
    }
  }, [onOpenTradeTicket, onCloseAllPositions, onToggleKillSwitch, closeAllPositions]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  return { closeAllPositions };
}
