import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhaleAlertRequest {
  action: 'track_wallet' | 'untrack_wallet' | 'get_transactions' | 'simulate_whale_activity';
  wallet_address?: string;
  label?: string;
  network?: string;
  category?: string;
  instrument?: string;
}

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
      instrument = 'BTC-USDT' 
    } = await req.json() as WhaleAlertRequest;

    console.log(`[whale-alerts] Action: ${action}`);

    switch (action) {
      case 'track_wallet': {
        if (!wallet_address) throw new Error('Wallet address required');
        
        const { data, error } = await supabase
          .from('whale_wallets')
          .upsert({
            address: wallet_address,
            label: label || 'Unknown Whale',
            network,
            category: category || 'unknown',
            is_tracked: true,
            balance: 0,
          }, { onConflict: 'address' })
          .select()
          .single();

        if (error) throw error;

        console.log(`[whale-alerts] Tracking wallet: ${wallet_address}`);
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
          .eq('address', wallet_address);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_transactions': {
        const query = supabase
          .from('whale_transactions')
          .select('*, whale_wallets(*)')
          .order('created_at', { ascending: false })
          .limit(50);

        if (wallet_address) {
          query.or(`from_address.eq.${wallet_address},to_address.eq.${wallet_address}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, transactions: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'simulate_whale_activity': {
        // Simulate whale transactions for demo purposes
        const transactions = await generateWhaleTransactions(supabase, instrument);
        
        return new Response(
          JSON.stringify({ success: true, transactions }),
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

async function generateWhaleTransactions(supabase: any, instrument: string) {
  const directions = ['inflow', 'outflow', 'transfer'];
  const networks = ['ethereum', 'bitcoin', 'solana'];
  const transactions = [];

  // Create some whale wallets if none exist
  const whaleWallets = [
    { address: '0x28c6c06298d514db089934071355e5743bf21d60', label: 'Binance Hot Wallet', category: 'exchange' },
    { address: '0x21a31ee1afc51d94c2efccaa2092ad1028285549', label: 'Binance Cold Wallet', category: 'exchange' },
    { address: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', label: 'Binance Treasury', category: 'exchange' },
    { address: '0x8103683202aa8da10536036edef04cdd865c225e', label: 'Unknown Whale 1', category: 'unknown' },
    { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', label: 'Lido Finance', category: 'defi' },
  ];

  for (const wallet of whaleWallets) {
    await supabase.from('whale_wallets').upsert({
      ...wallet,
      network: 'ethereum',
      is_tracked: true,
      balance: Math.random() * 100000,
    }, { onConflict: 'address' });
  }

  // Generate transactions
  for (let i = 0; i < 5; i++) {
    const direction = directions[Math.floor(Math.random() * directions.length)];
    const network = networks[Math.floor(Math.random() * networks.length)];
    const fromWallet = whaleWallets[Math.floor(Math.random() * whaleWallets.length)];
    const toWallet = whaleWallets[Math.floor(Math.random() * whaleWallets.length)];
    const amount = Math.random() * 10000;
    const usdValue = amount * (instrument.startsWith('BTC') ? 43000 : instrument.startsWith('ETH') ? 2200 : 100);

    const tx = {
      instrument,
      network,
      direction,
      tx_hash: `0x${crypto.randomUUID().replace(/-/g, '')}`,
      from_address: fromWallet.address,
      to_address: toWallet.address,
      amount,
      usd_value: usdValue,
      block_number: Math.floor(Math.random() * 1000000) + 19000000,
      gas_price: Math.random() * 100,
    };

    const { error } = await supabase.from('whale_transactions').insert(tx);
    if (!error) transactions.push(tx);
  }

  // Create alert for significant transactions
  const significantTx = transactions.find(tx => (tx.usd_value || 0) > 1000000);
  if (significantTx) {
    await supabase.from('alerts').insert({
      title: `Whale Alert: $${((significantTx.usd_value || 0) / 1000000).toFixed(2)}M ${significantTx.direction}`,
      message: `Large ${significantTx.instrument} ${significantTx.direction} detected: ${significantTx.amount.toFixed(2)} tokens ($${((significantTx.usd_value || 0) / 1000000).toFixed(2)}M)`,
      source: 'whale-alerts',
      severity: 'warning',
      metadata: { transaction: significantTx },
    });
  }

  return transactions;
}
