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

// In-memory state for kill switch and daily P&L tracking
let killSwitchActive = false;
let killSwitchReason = '';
let killSwitchActivatedAt: number | null = null;
let dailyPnL = 0;
let dailyPnLDate = new Date().toDateString();
let dailyPnLLimit = -500; // Default -$500 daily loss limit
let warningAlertsSent = { at70: false, at90: false }; // Track warning alerts

// P&L history for analytics
interface PnLHistoryEntry {
  timestamp: number;
  pnl: number;
  tradeId: string;
  symbol: string;
}
let pnlHistory: PnLHistoryEntry[] = [];
let dailyStats = {
  tradesExecuted: 0,
  totalProfit: 0,
  totalLoss: 0,
  winCount: 0,
  lossCount: 0,
  maxDrawdown: 0,
  peakPnL: 0,
};

// Position sizing rules
interface PositionSizingRules {
  baseSize: number;
  minSize: number;
  maxSize: number;
  scaleDownAt70Percent: boolean;
  scaleDownAt90Percent: boolean;
}
let positionSizingRules: PositionSizingRules = {
  baseSize: 0.1,
  minSize: 0.01,
  maxSize: 0.5,
  scaleDownAt70Percent: true,
  scaleDownAt90Percent: true,
};

// Calculate dynamic position size based on P&L performance
function calculateDynamicPositionSize(baseSize: number): number {
  const percentUsed = dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0;
  
  // Scale down as we approach limits
  if (percentUsed >= 90 && positionSizingRules.scaleDownAt90Percent) {
    return Math.max(positionSizingRules.minSize, baseSize * 0.25); // 25% of base
  } else if (percentUsed >= 70 && positionSizingRules.scaleDownAt70Percent) {
    return Math.max(positionSizingRules.minSize, baseSize * 0.5); // 50% of base
  }
  
  // Scale up if we're in profit (max 50% increase)
  if (dailyPnL > 0) {
    const profitBonus = Math.min(0.5, dailyPnL / 500); // Up to 50% bonus for $500 profit
    return Math.min(positionSizingRules.maxSize, baseSize * (1 + profitBonus));
  }
  
  return Math.min(positionSizingRules.maxSize, baseSize);
}

// Send P&L warning alert via Telegram
async function sendPnLWarningAlert(percentUsed: number, threshold: number): Promise<void> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: channels } = await supabase
    .from('notification_channels')
    .select('*')
    .eq('type', 'telegram')
    .eq('is_enabled', true);

  if (!channels || channels.length === 0) return;

  const emoji = threshold >= 90 ? '🚨' : '⚠️';
  const urgency = threshold >= 90 ? 'CRITICAL' : 'WARNING';
  const message = `
${emoji} *P&L ${urgency} ALERT* ${emoji}

📊 Daily P&L Limit Usage: *${percentUsed.toFixed(1)}%*

💰 Current P&L: *$${dailyPnL.toFixed(2)}*
🎯 Daily Limit: *$${dailyPnLLimit}*
📉 Remaining: *$${(dailyPnLLimit - dailyPnL).toFixed(2)}*

${threshold >= 90 ? '⚡ Position sizes reduced to 25%' : '📉 Position sizes reduced to 50%'}

_Trading will halt automatically at 100%_
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
        console.log(`[Arbitrage] P&L warning alert sent (${threshold}%)`);
      } catch (e) {
        console.error('[Arbitrage] P&L warning alert failed:', e);
      }
    }
  }
}

// Check and send P&L warning alerts
async function checkPnLWarnings() {
  const percentUsed = dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0;
  
  if (percentUsed >= 90 && !warningAlertsSent.at90) {
    await sendPnLWarningAlert(percentUsed, 90);
    warningAlertsSent.at90 = true;
  } else if (percentUsed >= 70 && !warningAlertsSent.at70) {
    await sendPnLWarningAlert(percentUsed, 70);
    warningAlertsSent.at70 = true;
  }
}

// Update P&L history and stats
function recordTradeResult(tradeId: string, symbol: string, profit: number) {
  pnlHistory.push({
    timestamp: Date.now(),
    pnl: profit,
    tradeId,
    symbol,
  });
  
  // Keep only last 100 entries
  if (pnlHistory.length > 100) {
    pnlHistory = pnlHistory.slice(-100);
  }
  
  // Update stats
  dailyStats.tradesExecuted++;
  if (profit >= 0) {
    dailyStats.totalProfit += profit;
    dailyStats.winCount++;
  } else {
    dailyStats.totalLoss += Math.abs(profit);
    dailyStats.lossCount++;
  }
  
  // Track peak and drawdown
  if (dailyPnL > dailyStats.peakPnL) {
    dailyStats.peakPnL = dailyPnL;
  }
  const currentDrawdown = dailyStats.peakPnL - dailyPnL;
  if (currentDrawdown > dailyStats.maxDrawdown) {
    dailyStats.maxDrawdown = currentDrawdown;
  }
}

// Reset daily P&L at midnight
function checkDailyReset() {
  const today = new Date().toDateString();
  if (today !== dailyPnLDate) {
    dailyPnL = 0;
    dailyPnLDate = today;
    warningAlertsSent = { at70: false, at90: false };
    pnlHistory = [];
    dailyStats = {
      tradesExecuted: 0,
      totalProfit: 0,
      totalLoss: 0,
      winCount: 0,
      lossCount: 0,
      maxDrawdown: 0,
      peakPnL: 0,
    };
    // Auto-reset kill switch if it was triggered by P&L
    if (killSwitchActive && killSwitchReason.includes('P&L limit')) {
      killSwitchActive = false;
      killSwitchReason = '';
      killSwitchActivatedAt = null;
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params = {} } = await req.json();
    console.log(`[Arbitrage] Action: ${action}`, params);

    // Check for daily reset
    checkDailyReset();

    let result;

    switch (action) {
      case 'kill-switch':
        // Manage kill switch
        if (params.action === 'activate') {
          killSwitchActive = true;
          killSwitchReason = params.reason || 'Manual activation';
          killSwitchActivatedAt = Date.now();
          console.log('[Arbitrage] Kill switch ACTIVATED:', killSwitchReason);
          
          // Send Telegram alert
          const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
          if (botToken) {
            const supabase = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            const { data: channels } = await supabase
              .from('notification_channels')
              .select('*')
              .eq('type', 'telegram')
              .eq('is_enabled', true);

            if (channels) {
              for (const channel of channels) {
                const chatIdMatch = channel.webhook_url.match(/telegram:\/\/(.+)/);
                if (chatIdMatch) {
                  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: chatIdMatch[1],
                      text: `🛑 *KILL SWITCH ACTIVATED*\n\nReason: ${killSwitchReason}\nTime: ${new Date().toLocaleTimeString()}\n\n_All arbitrage trading halted_`,
                      parse_mode: 'Markdown',
                    }),
                  });
                }
              }
            }
          }
          
          result = { active: true, reason: killSwitchReason, activatedAt: killSwitchActivatedAt };
        } else if (params.action === 'deactivate') {
          killSwitchActive = false;
          killSwitchReason = '';
          killSwitchActivatedAt = null;
          console.log('[Arbitrage] Kill switch DEACTIVATED');
          result = { active: false };
        } else {
          result = { 
            active: killSwitchActive, 
            reason: killSwitchReason, 
            activatedAt: killSwitchActivatedAt 
          };
        }
        break;

      case 'pnl-limits':
        // Manage daily P&L limits
        if (params.setLimit !== undefined) {
          dailyPnLLimit = params.setLimit;
          console.log('[Arbitrage] Daily P&L limit set to:', dailyPnLLimit);
        }
        if (params.updatePnL !== undefined) {
          dailyPnL += params.updatePnL;
          console.log('[Arbitrage] Daily P&L updated to:', dailyPnL);
          
          // Check if limit breached
          if (dailyPnL <= dailyPnLLimit) {
            killSwitchActive = true;
            killSwitchReason = `Daily P&L limit breached: $${dailyPnL.toFixed(2)} (limit: $${dailyPnLLimit})`;
            killSwitchActivatedAt = Date.now();
            console.log('[Arbitrage] Kill switch auto-activated due to P&L limit');
          }
        }
        if (params.reset) {
          dailyPnL = 0;
          console.log('[Arbitrage] Daily P&L reset');
        }
        result = { 
          dailyPnL, 
          dailyPnLLimit, 
          dailyPnLDate,
          limitBreached: dailyPnL <= dailyPnLLimit,
          percentUsed: dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0,
        };
        break;

      case 'scan':
        // Check kill switch before scanning
        if (killSwitchActive) {
          result = {
            opportunities: [],
            scanned: 0,
            found: 0,
            alerted: 0,
            blocked: true,
            reason: `Kill switch active: ${killSwitchReason}`,
            timestamp: Date.now(),
          };
          break;
        }
        
        // Scan for arbitrage opportunities - now includes 5 pairs
        const symbols = params.symbols || ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'];
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
          killSwitchActive,
          dailyPnL,
          dailyPnLLimit,
          timestamp: Date.now(),
        };
        break;

      case 'auto-execute':
        // Check kill switch before auto-executing
        if (killSwitchActive) {
          result = {
            scanned: 0,
            found: 0,
            qualified: 0,
            executed: 0,
            trades: [],
            blocked: true,
            reason: `Kill switch active: ${killSwitchReason}`,
            timestamp: Date.now(),
          };
          break;
        }
        
        // Auto-execute with safety controls
        const autoSymbols = params.symbols || ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD', 'LINK/USD'];
        const autoMinSpread = params.minSpreadPercent || 0.1;
        const minProfitThreshold = params.minProfitThreshold || 25; // $25 minimum
        const basePositionSize = params.maxPositionSize || 0.1; // Base position
        const cooldownMs = params.cooldownMs || 60000; // 1 minute cooldown
        
        // Calculate dynamic position size based on P&L
        const dynamicPositionSize = calculateDynamicPositionSize(basePositionSize);
        
        console.log('[Arbitrage] Auto-execute scan with params:', {
          minProfitThreshold,
          basePositionSize,
          dynamicPositionSize,
          cooldownMs,
        });
        
        // Check P&L warnings
        await checkPnLWarnings();
        
        // Scan for opportunities
        const autoAllOpps: ArbitrageOpportunity[] = [];
        for (const symbol of autoSymbols) {
          const prices = await fetchPrices(symbol);
          const opportunities = findOpportunities(prices, autoMinSpread);
          autoAllOpps.push(...opportunities);
        }
        
        // Analyze costs with dynamic position size
        const autoAnalyzed = autoAllOpps.map(opp => ({
          ...opp,
          volume: Math.min(opp.volume, dynamicPositionSize),
          costs: calculateCosts({ ...opp, volume: Math.min(opp.volume, dynamicPositionSize) }),
        }));
        
        // Filter for profitable opportunities above threshold
        const executableOpps = autoAnalyzed.filter(
          opp => opp.costs.netProfit >= minProfitThreshold
        );
        
        let executedTrades = [];
        
        if (executableOpps.length > 0) {
          // Sort by profit and take best opportunity
          const bestOpp = executableOpps.sort((a, b) => b.costs.netProfit - a.costs.netProfit)[0];
          
          console.log('[Arbitrage] Auto-executing best opportunity:', bestOpp);
          
          // Send alert
          await sendTelegramAlert(bestOpp, bestOpp.costs);
          
          // Execute (simulation mode for now)
          const tradeId = `auto_${Date.now()}`;
          const execResult = {
            status: 'SIMULATED',
            opportunity: bestOpp,
            buyOrder: {
              exchange: bestOpp.buyExchange,
              orderId: `${tradeId}_buy`,
              status: 'FILLED',
              price: bestOpp.buyPrice,
              quantity: bestOpp.volume,
            },
            sellOrder: {
              exchange: bestOpp.sellExchange,
              orderId: `${tradeId}_sell`,
              status: 'FILLED',
              price: bestOpp.sellPrice,
              quantity: bestOpp.volume,
            },
            netProfit: bestOpp.costs.netProfit,
            positionSize: dynamicPositionSize,
            executedAt: Date.now(),
          };
          
          executedTrades.push(execResult);
          
          // Update daily P&L and record trade
          dailyPnL += bestOpp.costs.netProfit;
          recordTradeResult(tradeId, bestOpp.symbol, bestOpp.costs.netProfit);
          
          // Check P&L warnings and limits
          await checkPnLWarnings();
          if (dailyPnL <= dailyPnLLimit) {
            killSwitchActive = true;
            killSwitchReason = `Daily P&L limit breached: $${dailyPnL.toFixed(2)}`;
            killSwitchActivatedAt = Date.now();
          }
        }
        
        result = {
          scanned: autoSymbols.length,
          found: autoAnalyzed.filter(o => o.costs.netProfit > 0).length,
          qualified: executableOpps.length,
          executed: executedTrades.length,
          trades: executedTrades,
          nextScanAfter: Date.now() + cooldownMs,
          settings: { minProfitThreshold, basePositionSize, dynamicPositionSize, cooldownMs },
          dailyPnL,
          dailyPnLLimit,
          positionSizingRules,
          killSwitchActive,
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
        // Check kill switch before executing
        if (killSwitchActive) {
          throw new Error(`Execution blocked: ${killSwitchReason}`);
        }
        
        // Execute arbitrage trade (simulation for now)
        if (!params.opportunity) throw new Error('Opportunity required');
        
        // Calculate dynamic position size
        const execDynamicSize = calculateDynamicPositionSize(params.opportunity.volume);
        const adjustedOpportunity = { ...params.opportunity, volume: execDynamicSize };
        
        console.log('[Arbitrage] Executing trade:', adjustedOpportunity);
        
        const execCosts = calculateCosts(adjustedOpportunity);
        const execTradeId = `exec_${Date.now()}`;
        
        // Update daily P&L and record trade
        dailyPnL += execCosts.netProfit;
        recordTradeResult(execTradeId, adjustedOpportunity.symbol, execCosts.netProfit);
        
        // Check P&L warnings
        await checkPnLWarnings();
        
        // Check P&L limit after trade
        if (dailyPnL <= dailyPnLLimit) {
          killSwitchActive = true;
          killSwitchReason = `Daily P&L limit breached: $${dailyPnL.toFixed(2)}`;
          killSwitchActivatedAt = Date.now();
        }
        
        result = {
          status: 'SIMULATED',
          opportunity: adjustedOpportunity,
          buyOrder: {
            exchange: adjustedOpportunity.buyExchange,
            orderId: `${execTradeId}_buy`,
            status: 'FILLED',
            price: adjustedOpportunity.buyPrice,
            quantity: adjustedOpportunity.volume,
          },
          sellOrder: {
            exchange: adjustedOpportunity.sellExchange,
            orderId: `${execTradeId}_sell`,
            status: 'FILLED',
            price: adjustedOpportunity.sellPrice,
            quantity: adjustedOpportunity.volume,
          },
          realizedProfit: execCosts.netProfit,
          originalSize: params.opportunity.volume,
          adjustedSize: execDynamicSize,
          dailyPnL,
          dailyPnLLimit,
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
          killSwitch: {
            active: killSwitchActive,
            reason: killSwitchReason,
            activatedAt: killSwitchActivatedAt,
          },
          dailyPnL: {
            current: dailyPnL,
            limit: dailyPnLLimit,
            date: dailyPnLDate,
            percentUsed: dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0,
          },
          positionSizing: positionSizingRules,
          warningAlertsSent,
        };
        break;

      case 'analytics':
        // Get P&L analytics and history
        const winRate = dailyStats.tradesExecuted > 0 
          ? (dailyStats.winCount / dailyStats.tradesExecuted) * 100 
          : 0;
        const avgWin = dailyStats.winCount > 0 
          ? dailyStats.totalProfit / dailyStats.winCount 
          : 0;
        const avgLoss = dailyStats.lossCount > 0 
          ? dailyStats.totalLoss / dailyStats.lossCount 
          : 0;
        const profitFactor = dailyStats.totalLoss > 0 
          ? dailyStats.totalProfit / dailyStats.totalLoss 
          : dailyStats.totalProfit > 0 ? Infinity : 0;
        
        result = {
          dailyPnL,
          dailyPnLLimit,
          percentUsed: dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0,
          stats: {
            ...dailyStats,
            winRate,
            avgWin,
            avgLoss,
            profitFactor,
          },
          history: pnlHistory,
          positionSizing: {
            ...positionSizingRules,
            currentSize: calculateDynamicPositionSize(positionSizingRules.baseSize),
          },
          warningAlertsSent,
        };
        break;

      case 'position-sizing':
        // Update position sizing rules
        if (params.baseSize !== undefined) positionSizingRules.baseSize = params.baseSize;
        if (params.minSize !== undefined) positionSizingRules.minSize = params.minSize;
        if (params.maxSize !== undefined) positionSizingRules.maxSize = params.maxSize;
        if (params.scaleDownAt70Percent !== undefined) positionSizingRules.scaleDownAt70Percent = params.scaleDownAt70Percent;
        if (params.scaleDownAt90Percent !== undefined) positionSizingRules.scaleDownAt90Percent = params.scaleDownAt90Percent;
        
        result = {
          positionSizingRules,
          currentSize: calculateDynamicPositionSize(positionSizingRules.baseSize),
          pnlPercentUsed: dailyPnLLimit < 0 ? (dailyPnL / dailyPnLLimit) * 100 : 0,
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
          killSwitchActive,
          dailyPnL,
          dailyPnLLimit,
          steps: [
            { step: 1, action: 'Scan exchanges', status: 'completed' },
            { step: 2, action: 'Identify spread', status: 'completed', data: { spread: '0.158%' } },
            { step: 3, action: 'Calculate costs', status: 'completed', data: testCosts },
            { step: 4, action: 'Check kill switch', status: killSwitchActive ? 'blocked' : 'passed' },
            { step: 5, action: 'Send Telegram alert', status: Deno.env.get('TELEGRAM_BOT_TOKEN') ? 'completed' : 'skipped' },
            { step: 6, action: 'Execute trades', status: 'simulated' },
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
