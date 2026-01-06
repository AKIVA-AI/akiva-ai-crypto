/**
 * Multi-Exchange Market Data Display
 * 
 * Shows live prices from multiple exchanges with source attribution.
 * Includes best price finder and exchange comparison.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExchangeBadge, ExchangeType } from '@/components/ui/exchange-badge';
import { useMultiExchangeMarketData } from '@/contexts/MultiExchangeMarketData';
import { Search, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MultiExchangeMarketData() {
  const [searchQuery, setSearchQuery] = useState('');
  const { prices, getAllPrices, exchanges } = useMultiExchangeMarketData();

  const allPrices = getAllPrices();
  const filteredPrices = allPrices.filter(price =>
    price.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedExchanges = exchanges.filter(e => e.isConnected);

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Live Market Data
            </CardTitle>
            <div className="flex items-center gap-1">
              {connectedExchanges.map(exchange => (
                <ExchangeBadge
                  key={exchange.exchange}
                  exchange={exchange.exchange as ExchangeType}
                  size="sm"
                  showName={false}
                />
              ))}
            </div>
          </div>
          <Badge variant={connectedExchanges.length > 0 ? 'default' : 'destructive'} className="gap-1">
            {connectedExchanges.length > 0 ? '🟢 Connected' : '🔴 Disconnected'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Market Data Grid */}
        {filteredPrices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {allPrices.length === 0 ? (
              <p>No market data available. Connecting to exchanges...</p>
            ) : (
              <p>No markets found matching "{searchQuery}"</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPrices.map((price) => (
              <div
                key={`${price.exchange}-${price.symbol}`}
                className={cn(
                  'p-3 rounded-lg border transition-colors',
                  price.change24h >= 0
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-red-500/5 border-red-500/20'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-bold text-lg">{price.symbol}</div>
                      <ExchangeBadge
                        exchange={price.exchange as ExchangeType}
                        size="sm"
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-mono font-bold">
                      ${price.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          price.change24h >= 0 ? 'text-green-500' : 'text-red-500'
                        )}
                      >
                        {price.change24h >= 0 ? '+' : ''}
                        {price.change24h.toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          price.change24h >= 0 ? 'text-green-500' : 'text-red-500'
                        )}
                      >
                        ({price.change24h >= 0 ? '+' : ''}
                        {((price.change24h / (price.price - price.change24h)) * 100).toFixed(2)}%)
                      </span>
                      {price.change24h >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium">Vol:</span>{' '}
                    {(price.volume24h / 1e6).toFixed(2)}M
                  </div>
                  <div>
                    <span className="font-medium">High:</span> ${price.high24h.toFixed(2)}
                  </div>
                  <div>
                    <span className="font-medium">Low:</span> ${price.low24h.toFixed(2)}
                  </div>
                  <div>
                    <span className="font-medium">Bid/Ask:</span> ${price.bid.toFixed(2)} / $
                    {price.ask.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {allPrices.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Total Markets</div>
                <div className="text-lg font-bold">{allPrices.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Exchanges</div>
                <div className="text-lg font-bold">{connectedExchanges.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Data Quality</div>
                <div className="text-lg font-bold text-green-500">Real-time</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

