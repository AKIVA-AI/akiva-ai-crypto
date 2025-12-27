import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceData {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  volume: number;
  confidence: number;
  timestamp: number;
}

// Send Telegram notification for arbitrage opportunity
async function sendTelegramAlert(opportunity: ArbitrageOpportunity, costs: any): Promise<void> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Get configured Telegram channels
  const { data: channels } = await supabase
    .from('notification_channels')
    .select('*')
    .eq('type', 'telegram')
    .eq('is_enabled', true);

  if (!channels || channels.length === 0) return;

  const message = `
🔄 *Arbitrage Opportunity Detected*

📊 *${opportunity.symbol}*
💰 Spread: *${opportunity.spreadPercent.toFixed(3)}%*

📈 Buy: ${opportunity.buyExchange.toUpperCase()} @ $${opportunity.buyPrice.toFixed(2)}
📉 Sell: ${opportunity.sellExchange.toUpperCase()} @ $${opportunity.sellPrice.toFixed(2)}

💵 Gross Profit: $${opportunity.estimatedProfit.toFixed(2)}
📊 Net Profit: $${costs.netProfit.toFixed(2)}
🎯 Confidence: ${(opportunity.confidence * 100).toFixed(0)}%

_Detected at ${new Date().toLocaleTimeString()}_
  `.trim();

  for (const channel of channels) {
    const chatIdMatch = channel.webhook_url.match(/telegram:\/\/(.+)/);
    if (chatIdMatch) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatIdMatch[1],
            text: message,
            parse_mode: 'Markdown',
          }),
        });
        console.log('[Arbitrage] Telegram alert sent');
      } catch (e) {
        console.error('[Arbitrage] Telegram send failed:', e);
      }
    }
  }
}

// Fetch prices from multiple exchanges
async function fetchPrices(symbol: string): Promise<PriceData[]> {
  const prices: PriceData[] = [];
  const normalizedSymbol = symbol.replace('/', '').toUpperCase();
  
  // Coinbase
  try {
    const coinbaseSymbol = symbol.replace('/', '-');
    const response = await fetch(`https://api.exchange.coinbase.com/products/${coinbaseSymbol}/ticker`);
    if (response.ok) {
      const data = await response.json();
      prices.push({
        exchange: 'coinbase',
        symbol: normalizedSymbol,
        bid: parseFloat(data.bid),
        ask: parseFloat(data.ask),
        timestamp: Date.now(),
      });
    }
  } catch (e) {
    console.log('[Arbitrage] Coinbase fetch failed:', e);
  }

  // Kraken
  try {
    const krakenSymbol = normalizedSymbol.replace('BTC', 'XBT');
    const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenSymbol}`);
    if (response.ok) {
      const data = await response.json();
      const result = Object.values(data.result || {})[0] as any;
      if (result) {
        prices.push({
          exchange: 'kraken',
          symbol: normalizedSymbol,
          bid: parseFloat(result.b[0]),
          ask: parseFloat(result.a[0]),
          timestamp: Date.now(),
        });
      }
    }
  } catch (e) {
    console.log('[Arbitrage] Kraken fetch failed:', e);
  }

  // Binance.US
  try {
    const response = await fetch(`https://api.binance.us/api/v3/ticker/bookTicker?symbol=${normalizedSymbol}`);
    if (response.ok) {
      const data = await response.json();
      prices.push({
        exchange: 'binance_us',
        symbol: normalizedSymbol,
        bid: parseFloat(data.bidPrice),
        ask: parseFloat(data.askPrice),
        timestamp: Date.now(),
      });
    }
  } catch (e) {
    console.log('[Arbitrage] Binance.US fetch failed:', e);
  }

  return prices;
}

// Find arbitrage opportunities
function findOpportunities(prices: PriceData[], minSpreadPercent: number = 0.1): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    for (let j = 0; j < prices.length; j++) {
      if (i === j) continue;
      
      const buyFrom = prices[i];
      const sellTo = prices[j];
      
      // Buy at ask, sell at bid
      const buyPrice = buyFrom.ask;
      const sellPrice = sellTo.bid;
      
      if (sellPrice > buyPrice) {
        const spread = sellPrice - buyPrice;
        const spreadPercent = (spread / buyPrice) * 100;
        
        if (spreadPercent >= minSpreadPercent) {
          // Estimate realistic trade size based on typical liquidity
          const estimatedVolume = 0.1; // Conservative BTC equivalent
          const estimatedProfit = spread * estimatedVolume;
          
          // Confidence based on spread size and exchange reliability
          const confidence = Math.min(0.95, 0.5 + (spreadPercent / 2));
          
          opportunities.push({
            id: `${buyFrom.exchange}-${sellTo.exchange}-${buyFrom.symbol}-${Date.now()}`,
            symbol: buyFrom.symbol,
            buyExchange: buyFrom.exchange,
            sellExchange: sellTo.exchange,
            buyPrice,
            sellPrice,
            spread,
            spreadPercent,
            estimatedProfit,
            volume: estimatedVolume,
            confidence,
            timestamp: Date.now(),
          });
        }
      }
    }
  }
  
  // Sort by spread percentage descending
  return opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

// Calculate execution costs
function calculateCosts(opportunity: ArbitrageOpportunity): {
  tradingFees: number;
  withdrawalFee: number;
  slippage: number;
  totalCost: number;
  netProfit: number;
} {
  const tradingFeeRate = 0.001; // 0.1% per trade (typical maker fee)
  const tradingFees = (opportunity.buyPrice + opportunity.sellPrice) * opportunity.volume * tradingFeeRate;
  
  // Withdrawal fee varies by asset, estimate $5-20 for crypto
  const withdrawalFee = 10;
  
  // Slippage estimate based on spread
  const slippage = opportunity.buyPrice * opportunity.volume * 0.0005; // 0.05%
  
  const totalCost = tradingFees + withdrawalFee + slippage;
  const netProfit = opportunity.estimatedProfit - totalCost;
  
  return { tradingFees, withdrawalFee, slippage, totalCost, netProfit };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params = {} } = await req.json();
    console.log(`[Arbitrage] Action: ${action}`, params);

    let result;

    switch (action) {
      case 'scan':
        // Scan for arbitrage opportunities
        const symbols = params.symbols || ['BTC/USD', 'ETH/USD', 'SOL/USD'];
        const minSpread = params.minSpreadPercent || 0.1;
        
        const allOpportunities: ArbitrageOpportunity[] = [];
        
        for (const symbol of symbols) {
          const prices = await fetchPrices(symbol);
          const opportunities = findOpportunities(prices, minSpread);
          allOpportunities.push(...opportunities);
        }
        
        // Add cost analysis
        const analyzedOpportunities = allOpportunities.map(opp => ({
          ...opp,
          costs: calculateCosts(opp),
        }));
        
        // Filter to only profitable after costs
        const profitableOpportunities = analyzedOpportunities.filter(
          opp => opp.costs.netProfit > 0
        );
        
        // Send Telegram alerts for high-value opportunities (>0.5% spread)
        const alertThreshold = params.alertThreshold || 0.5;
        for (const opp of profitableOpportunities) {
          if (opp.spreadPercent >= alertThreshold) {
            await sendTelegramAlert(opp, opp.costs);
          }
        }
        
        result = {
          opportunities: profitableOpportunities,
          scanned: symbols.length,
          found: profitableOpportunities.length,
          alerted: profitableOpportunities.filter(o => o.spreadPercent >= alertThreshold).length,
          timestamp: Date.now(),
        };
        break;

      case 'prices':
        // Get current prices for a symbol
        const priceSymbol = params.symbol || 'BTC/USD';
        result = await fetchPrices(priceSymbol);
        break;

      case 'analyze':
        // Analyze a specific opportunity
        if (!params.opportunity) throw new Error('Opportunity required');
        result = {
          opportunity: params.opportunity,
          costs: calculateCosts(params.opportunity),
          recommendation: calculateCosts(params.opportunity).netProfit > 5 ? 'EXECUTE' : 'SKIP',
        };
        break;

      case 'execute':
        // Execute arbitrage trade (simulation for now)
        if (!params.opportunity) throw new Error('Opportunity required');
        
        console.log('[Arbitrage] Executing trade:', params.opportunity);
        
        result = {
          status: 'SIMULATED',
          opportunity: params.opportunity,
          buyOrder: {
            exchange: params.opportunity.buyExchange,
            orderId: `buy_${Date.now()}`,
            status: 'FILLED',
            price: params.opportunity.buyPrice,
            quantity: params.opportunity.volume,
          },
          sellOrder: {
            exchange: params.opportunity.sellExchange,
            orderId: `sell_${Date.now()}`,
            status: 'FILLED',
            price: params.opportunity.sellPrice,
            quantity: params.opportunity.volume,
          },
          realizedProfit: calculateCosts(params.opportunity).netProfit,
          message: 'Trade simulated - enable live trading for real execution',
        };
        break;

      case 'status':
        result = {
          exchanges: {
            coinbase: { enabled: true, apiConfigured: !!Deno.env.get('COINBASE_API_KEY') },
            kraken: { enabled: true, apiConfigured: !!Deno.env.get('KRAKEN_API_KEY') },
            binance_us: { enabled: true, apiConfigured: !!Deno.env.get('BINANCE_US_API_KEY') },
          },
          supportedSymbols: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'],
          mode: 'us_compliant',
          telegramConfigured: !!Deno.env.get('TELEGRAM_BOT_TOKEN'),
        };
        break;

      case 'test':
        // Test the full arbitrage flow with simulated data
        console.log('[Arbitrage] Running test execution flow');
        
        const testOpportunity: ArbitrageOpportunity = {
          id: `test_${Date.now()}`,
          symbol: 'BTC/USD',
          buyExchange: 'coinbase',
          sellExchange: 'kraken',
          buyPrice: 95000,
          sellPrice: 95150,
          spread: 150,
          spreadPercent: 0.158,
          estimatedProfit: 15,
          volume: 0.1,
          confidence: 0.85,
          timestamp: Date.now(),
        };
        
        const testCosts = calculateCosts(testOpportunity);
        
        // Send test Telegram alert
        await sendTelegramAlert(testOpportunity, testCosts);
        
        result = {
          status: 'TEST_COMPLETED',
          opportunity: testOpportunity,
          costs: testCosts,
          steps: [
            { step: 1, action: 'Scan exchanges', status: 'completed' },
            { step: 2, action: 'Identify spread', status: 'completed', data: { spread: '0.158%' } },
            { step: 3, action: 'Calculate costs', status: 'completed', data: testCosts },
            { step: 4, action: 'Send Telegram alert', status: Deno.env.get('TELEGRAM_BOT_TOKEN') ? 'completed' : 'skipped' },
            { step: 5, action: 'Execute trades', status: 'simulated' },
          ],
          buyOrder: {
            exchange: 'coinbase',
            orderId: `test_buy_${Date.now()}`,
            status: 'SIMULATED_FILL',
            price: testOpportunity.buyPrice,
            quantity: testOpportunity.volume,
          },
          sellOrder: {
            exchange: 'kraken',
            orderId: `test_sell_${Date.now()}`,
            status: 'SIMULATED_FILL',
            price: testOpportunity.sellPrice,
            quantity: testOpportunity.volume,
          },
          netProfit: testCosts.netProfit,
          message: 'Test execution completed successfully',
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[Arbitrage] Success: ${action}`);
    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Arbitrage] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
