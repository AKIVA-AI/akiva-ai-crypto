/**
 * Exchange Badge Component
 * 
 * Displays color-coded badges for different cryptocurrency exchanges.
 * Used throughout the UI to show data sources and exchange status.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ExchangeType = 
  | 'coinbase' 
  | 'kraken' 
  | 'binance' 
  | 'bybit' 
  | 'okx' 
  | 'hyperliquid' 
  | 'mexc';

interface ExchangeConfig {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  usCompliant: boolean;
}

const EXCHANGE_CONFIGS: Record<ExchangeType, ExchangeConfig> = {
  coinbase: {
    name: 'Coinbase',
    icon: '🔵',
    color: '#0052FF',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    usCompliant: true,
  },
  kraken: {
    name: 'Kraken',
    icon: '🟣',
    color: '#5741D9',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    usCompliant: true,
  },
  binance: {
    name: 'Binance',
    icon: '🟡',
    color: '#F3BA2F',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    usCompliant: false,
  },
  bybit: {
    name: 'Bybit',
    icon: '🟠',
    color: '#F7A600',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    usCompliant: false,
  },
  okx: {
    name: 'OKX',
    icon: '⚫',
    color: '#000000',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
    usCompliant: false,
  },
  hyperliquid: {
    name: 'Hyperliquid',
    icon: '🔷',
    color: '#00D4FF',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    usCompliant: true,
  },
  mexc: {
    name: 'MEXC',
    icon: '🟢',
    color: '#00C087',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    usCompliant: false,
  },
};

interface ExchangeBadgeProps {
  exchange: ExchangeType;
  showIcon?: boolean;
  showName?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ExchangeBadge({
  exchange,
  showIcon = true,
  showName = true,
  size = 'md',
  className,
}: ExchangeBadgeProps) {
  const config = EXCHANGE_CONFIGS[exchange];

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        config.bgColor,
        config.borderColor,
        sizeClasses[size],
        'font-medium',
        className
      )}
      style={{ color: config.color }}
    >
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {showName && config.name}
    </Badge>
  );
}

interface ExchangeStatusBadgeProps {
  exchange: ExchangeType;
  isConnected: boolean;
  latencyMs?: number | null;
  className?: string;
}

export function ExchangeStatusBadge({
  exchange,
  isConnected,
  latencyMs,
  className,
}: ExchangeStatusBadgeProps) {
  const config = EXCHANGE_CONFIGS[exchange];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ExchangeBadge exchange={exchange} size="sm" />
      <Badge
        variant={isConnected ? 'default' : 'destructive'}
        className="text-xs"
      >
        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
      </Badge>
      {isConnected && latencyMs !== null && (
        <span className="text-xs text-muted-foreground">
          {latencyMs}ms
        </span>
      )}
    </div>
  );
}

interface RegulatoryWarningBadgeProps {
  exchange: ExchangeType;
  className?: string;
}

export function RegulatoryWarningBadge({
  exchange,
  className,
}: RegulatoryWarningBadgeProps) {
  const config = EXCHANGE_CONFIGS[exchange];

  if (config.usCompliant) {
    return (
      <Badge
        variant="outline"
        className={cn('bg-green-500/10 text-green-600 border-green-500/30', className)}
      >
        ✅ US Compliant
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn('bg-yellow-500/10 text-yellow-600 border-yellow-500/30', className)}
    >
      ⚠️ Not available in US
    </Badge>
  );
}

export { EXCHANGE_CONFIGS };

