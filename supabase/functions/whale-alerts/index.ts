import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhaleAlertRequest {
  action: 'track_wallet' | 'untrack_wallet' | 'get_transactions' | 'get_wallets' | 'simulate_whale_activity' | 'fetch_real_alerts' | 'generate_signals' | 'health_check';
  wallet_address?: string;
  label?: string;
  network?: string;
  category?: string;
  instrument?: string;
  instruments?: string[];
  limit?: number;
}

// Known whale wallet categories
const WHALE_CATEGORIES = {
  exchange: ['binance', 'coinbase', 'kraken', 'ftx', 'okx', 'bybit'],
  defi: ['aave', 'compound', 'uniswap', 'curve', 'lido'],
  institution: ['grayscale', 'microstrategy', 'tesla', '3ac'],
  unknown: ['whale', 'smart_money'],
};

// Pre-defined whale wallets for tracking
const KNOWN_WHALE_WALLETS = [
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', label: 'Binance Hot Wallet', category: 'exchange', network: 'ethereum' },
  { address: '0x21a31ee1afc51d94c2efccaa2092ad1028285549', label: 'Binance Cold Wallet', category: 'exchange', network: 'ethereum' },
  { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', label: 'Binance Treasury', category: 'exchange', network: 'ethereum' },
  { address: '0x8103683202aa8da10536036edef04cdd865c225e', label: 'Unknown Whale 1', category: 'unknown', network: 'ethereum' },
  { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', label: 'Lido Finance', category: 'defi', network: 'ethereum' },
  { address: '0xd7d069493685a581d27824fc46e8c3b7a53c5b4f', label: 'Smart Money Wallet', category: 'unknown', network: 'ethereum' },
  { address: 'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h', label: 'Coinbase Cold', category: 'exchange', network: 'bitcoin' },
  { address: 'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5', label: 'Solana Whale', category: 'unknown', network: 'solana' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      action, 
      wallet_address, 
      label, 
      network = 'ethereum', 
      category,
      instrument = 'BTC-USDT',
      instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'],
      limit = 50
    } = await req.json() as WhaleAlertRequest;

    console.log(`[whale-alerts] Action: ${action}, instrument: ${instrument}`);

    switch (action) {
      case 'track_wallet': {
        if (!wallet_address) throw new Error('Wallet address required');
        
        const { data, error } = await supabase
          .from('whale_wallets')
          .upsert({
            address: wallet_address.toLowerCase(),
            label: label || 'Unknown Whale',
            network,
            category: category || 'unknown',
            is_tracked: true,
            balance: 0,
          }, { onConflict: 'address' })
          .select()
          .single();

        if (error) throw error;

        console.log(`[whale-alerts] Now tracking wallet: ${wallet_address}`);
        return new Response(
          JSON.stringify({ success: true, wallet: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'untrack_wallet': {
        if (!wallet_address) throw new Error('Wallet address required');
        
        const { error } = await supabase
          .from('whale_wallets')
          .update({ is_tracked: false })
          .eq('address', wallet_address.toLowerCase());

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_wallets': {
        const { data, error } = await supabase
          .from('whale_wallets')
          .select('*')
          .eq('is_tracked', true)
          .order('last_activity_at', { ascending: false });

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, wallets: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_transactions': {
        let query = supabase
          .from('whale_transactions')
          .select('*, whale_wallets(*)')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (wallet_address) {
          query = query.or(`from_address.eq.${wallet_address.toLowerCase()},to_address.eq.${wallet_address.toLowerCase()}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Calculate summary stats
        const summary = {
          total_inflow: 0,
          total_outflow: 0,
          total_transfers: 0,
          largest_transaction: 0,
        };

        for (const tx of data || []) {
          const value = tx.usd_value || 0;
          summary.largest_transaction = Math.max(summary.largest_transaction, value);
          
          switch (tx.direction) {
            case 'inflow': summary.total_inflow += value; break;
            case 'outflow': summary.total_outflow += value; break;
            default: summary.total_transfers += value;
          }
        }

        return new Response(
          JSON.stringify({ success: true, transactions: data || [], summary }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'simulate_whale_activity': {
        // Ensure known whale wallets are tracked
        await initializeWhaleWallets(supabase);
        
        // Generate realistic whale transactions
        const transactions = await generateWhaleTransactions(supabase, instruments);
        
        // Generate intelligence signals from whale activity
        const signals = await generateWhaleSignals(supabase, transactions, instruments);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            transactions,
            signals,
            message: `Generated ${transactions.length} transactions and ${signals.length} signals`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'generate_signals': {
        // Generate signals from existing whale transaction data
        const { data: recentTransactions } = await supabase
          .from('whale_transactions')
          .select('*')
          .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(200);

        const signals = await generateWhaleSignals(supabase, recentTransactions || [], instruments);
        
        return new Response(
          JSON.stringify({ success: true, signals }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'health_check': {
        const { count } = await supabase
          .from('whale_wallets')
          .select('*', { count: 'exact', head: true })
          .eq('is_tracked', true);
        return new Response(
          JSON.stringify({ success: true, status: 'healthy', tracked_wallets: count || 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[whale-alerts] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function initializeWhaleWallets(supabase: any) {
  for (const wallet of KNOWN_WHALE_WALLETS) {
    await supabase.from('whale_wallets').upsert({
      ...wallet,
      address: wallet.address.toLowerCase(),
      is_tracked: true,
      balance: Math.random() * 100000 + 10000,
    }, { onConflict: 'address' });
  }
}

async function generateWhaleTransactions(supabase: any, instruments: string[]) {
  const directions = ['inflow', 'outflow', 'transfer'];
  const transactions = [];

  // Get existing whale wallets
  const { data: wallets } = await supabase
    .from('whale_wallets')
    .select('*')
    .eq('is_tracked', true);

  if (!wallets || wallets.length < 2) {
    await initializeWhaleWallets(supabase);
    const { data: newWallets } = await supabase
      .from('whale_wallets')
      .select('*')
      .eq('is_tracked', true);
    if (newWallets) wallets?.push(...newWallets);
  }

  const activeWallets = wallets || KNOWN_WHALE_WALLETS;

  // Generate 5-10 transactions
  const txCount = 5 + Math.floor(Math.random() * 6);
  
  for (let i = 0; i < txCount; i++) {
    const instrument = instruments[Math.floor(Math.random() * instruments.length)];
    const baseSymbol = instrument.split('-')[0];
    
    // Determine direction with bias based on time of day (more activity during trading hours)
    const hourOfDay = new Date().getHours();
    const isActiveHours = hourOfDay >= 8 && hourOfDay <= 22;
    const directionIndex = isActiveHours 
      ? Math.floor(Math.random() * 3) 
      : Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 2; // More transfers during quiet hours
    const direction = directions[directionIndex];
    
    // Select from/to wallets based on direction
    const fromWallet = activeWallets[Math.floor(Math.random() * activeWallets.length)];
    let toWallet = activeWallets[Math.floor(Math.random() * activeWallets.length)];
    while (toWallet.address === fromWallet.address && activeWallets.length > 1) {
      toWallet = activeWallets[Math.floor(Math.random() * activeWallets.length)];
    }
    
    // Calculate realistic amount based on asset
    let baseAmount = 100 + Math.random() * 2000;
    let priceMultiplier = 1;
    
    switch (baseSymbol) {
      case 'BTC': priceMultiplier = 45000 + Math.random() * 5000; break;
      case 'ETH': priceMultiplier = 2500 + Math.random() * 300; break;
      case 'SOL': priceMultiplier = 100 + Math.random() * 50; break;
      case 'BNB': priceMultiplier = 300 + Math.random() * 50; break;
      default: priceMultiplier = 50 + Math.random() * 50;
    }
    
    // Occasionally generate large whale transactions
    if (Math.random() > 0.8) {
      baseAmount *= 5 + Math.random() * 10;
    }
    
    const usdValue = baseAmount * priceMultiplier;

    const tx = {
      instrument,
      network: fromWallet.network || 'ethereum',
      direction,
      tx_hash: `0x${crypto.randomUUID().replace(/-/g, '')}`,
      from_address: fromWallet.address?.toLowerCase(),
      to_address: toWallet.address?.toLowerCase(),
      amount: baseAmount,
      usd_value: usdValue,
      block_number: Math.floor(Math.random() * 1000000) + 19000000,
      gas_price: Math.random() * 100,
      wallet_id: fromWallet.id,
    };

    const { error } = await supabase.from('whale_transactions').insert(tx);
    if (!error) {
      transactions.push(tx);
      
      // Update wallet last activity
      await supabase
        .from('whale_wallets')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('address', fromWallet.address?.toLowerCase());
    }
  }

  // Create alert for very large transactions
  const significantTxs = transactions.filter(tx => (tx.usd_value || 0) > 5000000);
  for (const tx of significantTxs) {
    await supabase.from('alerts').insert({
      title: `🐋 Whale Alert: $${((tx.usd_value || 0) / 1000000).toFixed(2)}M ${tx.direction}`,
      message: `Large ${tx.instrument} ${tx.direction} detected: ${tx.amount.toFixed(2)} tokens ($${((tx.usd_value || 0) / 1000000).toFixed(2)}M)`,
      source: 'whale-alerts',
      severity: (tx.usd_value || 0) > 10000000 ? 'critical' : 'warning',
      metadata: { transaction: tx },
    });
  }

  console.log(`[whale-alerts] Generated ${transactions.length} transactions`);
  return transactions;
}

async function generateWhaleSignals(supabase: any, transactions: any[], instruments: string[]) {
  const signals: any[] = [];
  
  // Group transactions by instrument
  const txByInstrument: Record<string, any[]> = {};
  for (const tx of transactions) {
    const instrument = tx.instrument || 'BTC-USDT';
    if (!txByInstrument[instrument]) txByInstrument[instrument] = [];
    txByInstrument[instrument].push(tx);
  }

  for (const instrument of instruments) {
    const txs = txByInstrument[instrument] || [];
    if (txs.length === 0) continue;

    // Calculate net flows
    let inflow = 0;
    let outflow = 0;
    let largestTx = 0;
    
    for (const tx of txs) {
      const value = tx.usd_value || 0;
      largestTx = Math.max(largestTx, value);
      
      if (tx.direction === 'inflow') inflow += value;
      else if (tx.direction === 'outflow') outflow += value;
    }

    const netFlow = outflow - inflow;
    const totalFlow = inflow + outflow;
    
    // Outflow from exchanges = accumulation = bullish
    // Inflow to exchanges = distribution = bearish
    let direction = 'neutral';
    if (totalFlow > 0) {
      const flowRatio = netFlow / totalFlow;
      if (flowRatio > 0.25) direction = 'bullish';
      else if (flowRatio < -0.25) direction = 'bearish';
    }

    const signal = {
      instrument,
      signal_type: 'whale_activity',
      direction,
      strength: Math.min(1, totalFlow / 20000000), // Normalize by $20M
      confidence: 0.65,
      source_data: {
        source: 'whale_alerts',
        exchange_inflow_usd: inflow,
        exchange_outflow_usd: outflow,
        net_flow_usd: netFlow,
        transaction_count: txs.length,
        largest_tx_usd: largestTx,
        flow_ratio: totalFlow > 0 ? netFlow / totalFlow : 0,
      },
      reasoning: `Whale activity: ${txs.length} transactions, net ${netFlow > 0 ? 'outflow' : 'inflow'} of $${Math.abs(netFlow / 1000000).toFixed(2)}M`,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };

    // Store signal
    const { error } = await supabase.from('intelligence_signals').insert(signal);
    if (!error) signals.push(signal);

    // Generate high-impact alert for significant flows
    if (largestTx > 10000000) {
      const alertSignal = {
        instrument,
        signal_type: 'whale_mega_transaction',
        direction: netFlow > 0 ? 'bullish' : 'bearish',
        strength: Math.min(1, largestTx / 50000000),
        confidence: 0.75,
        source_data: {
          source: 'whale_alerts_mega',
          largest_tx_usd: largestTx,
          net_flow_usd: netFlow,
        },
        reasoning: `🐋 MEGA whale transaction detected: $${(largestTx / 1000000).toFixed(1)}M ${netFlow > 0 ? 'accumulation' : 'distribution'}`,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
      
      await supabase.from('intelligence_signals').insert(alertSignal);
      signals.push(alertSignal);
    }
  }

  console.log(`[whale-alerts] Generated ${signals.length} intelligence signals`);
  return signals;
}
