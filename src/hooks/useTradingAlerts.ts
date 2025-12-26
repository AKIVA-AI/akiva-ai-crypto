import { useState, useEffect, useCallback } from 'react';
import { useLivePriceFeed } from './useLivePriceFeed';
import { usePositions } from './usePositions';
import { toast } from 'sonner';

export interface TradingAlert {
  id: string;
  type: 'price_target' | 'pnl_threshold' | 'risk_breach' | 'position_change';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  instrument?: string;
  triggeredAt: Date;
  acknowledged: boolean;
}

export interface PriceAlert {
  id: string;
  instrument: string;
  targetPrice: number;
  direction: 'above' | 'below';
  enabled: boolean;
}

export interface PnlAlert {
  id: string;
  positionId: string;
  instrument: string;
  threshold: number;
  type: 'profit' | 'loss';
  enabled: boolean;
}

interface UseTradingAlertsOptions {
  priceAlerts: PriceAlert[];
  pnlAlerts: PnlAlert[];
  onAlert?: (alert: TradingAlert) => void;
}

export function useTradingAlerts({ priceAlerts, pnlAlerts, onAlert }: UseTradingAlertsOptions) {
  const [alerts, setAlerts] = useState<TradingAlert[]>([]);
  const [triggeredPriceAlerts, setTriggeredPriceAlerts] = useState<Set<string>>(new Set());
  const [triggeredPnlAlerts, setTriggeredPnlAlerts] = useState<Set<string>>(new Set());

  // Get instruments to monitor from price alerts
  const instruments = [...new Set(priceAlerts.filter(a => a.enabled).map(a => a.instrument))];
  
  const { prices, isConnected } = useLivePriceFeed({
    symbols: instruments.map(i => i.replace('/', '-')),
    enabled: instruments.length > 0,
  });

  const { data: positions = [] } = usePositions();

  const createAlert = useCallback((alert: Omit<TradingAlert, 'id' | 'triggeredAt' | 'acknowledged'>) => {
    const newAlert: TradingAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      triggeredAt: new Date(),
      acknowledged: false,
    };

    setAlerts(prev => [newAlert, ...prev].slice(0, 100)); // Keep last 100 alerts
    onAlert?.(newAlert);

    // Show toast notification
    const toastFn = alert.severity === 'critical' ? toast.error 
      : alert.severity === 'warning' ? toast.warning 
      : toast.info;
    
    toastFn(alert.title, { description: alert.message });

    return newAlert;
  }, [onAlert]);

  // Check price alerts
  useEffect(() => {
    if (!isConnected) return;

    priceAlerts.filter(a => a.enabled).forEach(alert => {
      const feedSymbol = alert.instrument.replace('/', '-');
      const livePrice = prices.get(feedSymbol)?.price;

      if (!livePrice || triggeredPriceAlerts.has(alert.id)) return;

      const triggered = alert.direction === 'above' 
        ? livePrice >= alert.targetPrice
        : livePrice <= alert.targetPrice;

      if (triggered) {
        setTriggeredPriceAlerts(prev => new Set(prev).add(alert.id));
        createAlert({
          type: 'price_target',
          severity: 'warning',
          title: `Price Alert: ${alert.instrument}`,
          message: `${alert.instrument} is now ${alert.direction} $${alert.targetPrice.toLocaleString()} (Current: $${livePrice.toLocaleString()})`,
          instrument: alert.instrument,
        });
      }
    });
  }, [prices, priceAlerts, isConnected, triggeredPriceAlerts, createAlert]);

  // Check P&L alerts
  useEffect(() => {
    if (positions.length === 0) return;

    pnlAlerts.filter(a => a.enabled).forEach(alert => {
      if (triggeredPnlAlerts.has(alert.id)) return;

      const position = positions.find(p => p.id === alert.positionId);
      if (!position) return;

      const pnl = Number(position.unrealized_pnl || 0);
      const triggered = alert.type === 'profit' 
        ? pnl >= alert.threshold
        : pnl <= -alert.threshold;

      if (triggered) {
        setTriggeredPnlAlerts(prev => new Set(prev).add(alert.id));
        createAlert({
          type: 'pnl_threshold',
          severity: alert.type === 'loss' ? 'critical' : 'info',
          title: `P&L Alert: ${position.instrument}`,
          message: `${position.instrument} position ${alert.type === 'profit' ? 'profit' : 'loss'} threshold reached: $${Math.abs(pnl).toFixed(2)}`,
          instrument: position.instrument,
        });
      }
    });
  }, [positions, pnlAlerts, triggeredPnlAlerts, createAlert]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a => 
      a.id === alertId ? { ...a, acknowledged: true } : a
    ));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const resetPriceAlert = useCallback((alertId: string) => {
    setTriggeredPriceAlerts(prev => {
      const next = new Set(prev);
      next.delete(alertId);
      return next;
    });
  }, []);

  const resetPnlAlert = useCallback((alertId: string) => {
    setTriggeredPnlAlerts(prev => {
      const next = new Set(prev);
      next.delete(alertId);
      return next;
    });
  }, []);

  return {
    alerts,
    unacknowledgedCount: alerts.filter(a => !a.acknowledged).length,
    acknowledgeAlert,
    clearAlerts,
    resetPriceAlert,
    resetPnlAlert,
    createAlert,
    isConnected,
  };
}
