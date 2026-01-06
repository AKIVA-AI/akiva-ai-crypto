/**
 * Multi-Exchange WebSocket Health Monitor
 * 
 * Displays real-time connection status for all configured exchanges.
 * Shows latency, message count, and connection health.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExchangeBadge, ExchangeType } from '@/components/ui/exchange-badge';
import { useMultiExchangeMarketData } from '@/contexts/MultiExchangeMarketData';
import { RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MultiExchangeHealthMonitor() {
  const { exchanges, reconnectExchange, reconnectAll } = useMultiExchangeMarketData();

  if (exchanges.length === 0) {
    return (
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Exchange Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No exchanges configured. Add exchanges in Settings to see market data.
          </p>
        </CardContent>
      </Card>
    );
  }

  const allConnected = exchanges.every(e => e.isConnected);
  const anyConnecting = exchanges.some(e => e.isConnecting);

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Exchange Connections
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={allConnected ? 'default' : anyConnecting ? 'outline' : 'destructive'}
              className="gap-1"
            >
              {allConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  All Connected
                </>
              ) : anyConnecting ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Disconnected
                </>
              )}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={reconnectAll}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Reconnect All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {exchanges.map((exchange) => (
            <div
              key={exchange.exchange}
              className={cn(
                'p-3 rounded-lg border transition-colors',
                exchange.isConnected
                  ? 'bg-green-500/5 border-green-500/20'
                  : exchange.isConnecting
                  ? 'bg-yellow-500/5 border-yellow-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <ExchangeBadge
                  exchange={exchange.exchange as ExchangeType}
                  size="sm"
                />
                <div className="flex items-center gap-2">
                  <Badge
                    variant={exchange.isConnected ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {exchange.isConnected ? '🟢 Connected' : exchange.isConnecting ? '🟡 Connecting' : '🔴 Disconnected'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reconnectExchange(exchange.exchange)}
                    className="h-6 px-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Latency:</span>{' '}
                  {exchange.latencyMs !== null ? `${exchange.latencyMs}ms` : 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Messages:</span>{' '}
                  {exchange.messageCount.toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Last update:</span>{' '}
                  {exchange.lastUpdate
                    ? `${Math.round((Date.now() - exchange.lastUpdate) / 1000)}s ago`
                    : 'Never'}
                </div>
              </div>

              {exchange.error && (
                <div className="mt-2 text-xs text-red-500">
                  Error: {exchange.error}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Total Exchanges</div>
              <div className="text-lg font-bold">{exchanges.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Connected</div>
              <div className="text-lg font-bold text-green-500">
                {exchanges.filter(e => e.isConnected).length}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Avg Latency</div>
              <div className="text-lg font-bold">
                {exchanges.length > 0
                  ? Math.round(
                      exchanges
                        .filter(e => e.latencyMs !== null)
                        .reduce((sum, e) => sum + (e.latencyMs || 0), 0) /
                        exchanges.filter(e => e.latencyMs !== null).length
                    )
                  : 0}
                ms
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

