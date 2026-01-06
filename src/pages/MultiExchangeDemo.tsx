/**
 * Multi-Exchange Demo Page
 * 
 * Demonstrates the multi-exchange market data system with:
 * - Exchange configuration
 * - Live market data from multiple exchanges
 * - WebSocket health monitoring
 * - Regulatory warnings
 */

import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MultiExchangeMarketDataProvider } from '@/contexts/MultiExchangeMarketData';
import { MultiExchangeMarketData } from '@/components/trading/MultiExchangeMarketData';
import { MultiExchangeHealthMonitor } from '@/components/trading/MultiExchangeHealthMonitor';
import { ExchangeAPIManager } from '@/components/intelligence/ExchangeAPIManager';
import { RegulatoryWarning, ComplianceStatus } from '@/components/intelligence/RegulatoryWarning';
import { useExchangeKeys } from '@/hooks/useExchangeKeys';
import { ExchangeType } from '@/components/ui/exchange-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Settings, Shield, BarChart2 } from 'lucide-react';

export default function MultiExchangeDemo() {
  const { keys: exchangeKeys } = useExchangeKeys();

  const configuredExchanges = (exchangeKeys || [])
    .filter(key => key.is_active)
    .map(key => key.exchange as ExchangeType);

  return (
    <MultiExchangeMarketDataProvider>
      <MainLayout>
        <div className="container mx-auto p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-2">Multi-Exchange Market Data</h1>
            <p className="text-muted-foreground">
              Real-time market data from multiple exchanges with regulatory compliance
            </p>
          </div>

          {/* Regulatory Warnings */}
          {configuredExchanges.length > 0 && (
            <div className="space-y-4">
              <RegulatoryWarning
                userLocation="US"
                configuredExchanges={configuredExchanges}
              />
              <ComplianceStatus
                exchanges={configuredExchanges}
                userLocation="US"
              />
            </div>
          )}

          {/* Main Content */}
          <Tabs defaultValue="market-data" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="market-data" className="gap-2">
                <BarChart2 className="h-4 w-4" />
                Market Data
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-2">
                <Activity className="h-4 w-4" />
                Health Monitor
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Exchange Settings
              </TabsTrigger>
              <TabsTrigger value="compliance" className="gap-2">
                <Shield className="h-4 w-4" />
                Compliance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="market-data" className="space-y-4">
              <MultiExchangeMarketData />
            </TabsContent>

            <TabsContent value="health" className="space-y-4">
              <MultiExchangeHealthMonitor />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <ExchangeAPIManager />
            </TabsContent>

            <TabsContent value="compliance" className="space-y-4">
              <div className="grid gap-4">
                <RegulatoryWarning
                  userLocation="US"
                  configuredExchanges={configuredExchanges}
                />
                <ComplianceStatus
                  exchanges={configuredExchanges}
                  userLocation="US"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Configured Exchanges</div>
              <div className="text-2xl font-bold">{configuredExchanges.length}</div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="text-sm text-muted-foreground mb-1">US Compliant</div>
              <div className="text-2xl font-bold text-green-500">
                {configuredExchanges.filter(e => 
                  ['coinbase', 'kraken', 'hyperliquid'].includes(e)
                ).length}
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="text-sm text-muted-foreground mb-1">International</div>
              <div className="text-2xl font-bold text-yellow-500">
                {configuredExchanges.filter(e => 
                  !['coinbase', 'kraken', 'hyperliquid'].includes(e)
                ).length}
              </div>
            </div>
          </div>

          {/* Documentation */}
          <div className="p-6 rounded-lg border border-border bg-muted/50">
            <h3 className="text-lg font-semibold mb-3">How It Works</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>1. Configure Exchanges:</strong> Add your exchange API keys in the Settings tab. 
                Keys are encrypted client-side before storage.
              </p>
              <p>
                <strong>2. Automatic Detection:</strong> The system automatically detects which exchanges 
                you've configured and creates WebSocket connections for each.
              </p>
              <p>
                <strong>3. Real-time Data:</strong> Market data streams from all your exchanges in real-time, 
                with each price showing its source exchange.
              </p>
              <p>
                <strong>4. Regulatory Compliance:</strong> The system shows warnings for exchanges that 
                aren't available in your jurisdiction.
              </p>
              <p>
                <strong>5. Best Price Finder:</strong> When trading, the system automatically finds the 
                best price across all your configured exchanges.
              </p>
            </div>
          </div>
        </div>
      </MainLayout>
    </MultiExchangeMarketDataProvider>
  );
}

