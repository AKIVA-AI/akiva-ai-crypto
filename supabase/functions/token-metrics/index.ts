import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenMetrics {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  holderCount: number;
  topHolders: Array<{
    address: string;
    balance: string;
    percentage: number;
  }>;
  holderConcentration: number;
  liquidityUSD: number;
  volume24h: number;
  priceUSD: number;
  priceChange24h: number;
  marketCap: number;
  chain: string;
}

// Simulated blockchain data for demo - in production, use Moralis, Alchemy, or The Graph
async function fetchTokenMetrics(tokenAddress: string, chain: string): Promise<TokenMetrics> {
  console.log(`Fetching metrics for token ${tokenAddress} on ${chain}`);
  
  // Generate realistic mock data based on address hash for consistency
  const hash = tokenAddress.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const seed = Math.abs(hash);
  const random = (min: number, max: number) => min + (seed % (max - min));
  
  const holderCount = random(100, 50000);
  const topHolderPercentages = [
    random(5, 25),
    random(3, 15),
    random(2, 10),
    random(1, 8),
    random(1, 5),
  ];
  
  const holderConcentration = topHolderPercentages.slice(0, 10).reduce((a, b) => a + b, 0);
  
  return {
    address: tokenAddress,
    name: `Token ${tokenAddress.slice(0, 6)}`,
    symbol: tokenAddress.slice(2, 6).toUpperCase(),
    totalSupply: (random(1000000, 1000000000000)).toString(),
    holderCount,
    topHolders: topHolderPercentages.map((pct, i) => ({
      address: `0x${(seed * (i + 1)).toString(16).padStart(40, '0').slice(0, 40)}`,
      balance: (random(10000, 10000000)).toString(),
      percentage: pct,
    })),
    holderConcentration,
    liquidityUSD: random(10000, 50000000),
    volume24h: random(5000, 10000000),
    priceUSD: random(1, 1000) / 10000,
    priceChange24h: (random(-5000, 5000)) / 100,
    marketCap: random(100000, 500000000),
    chain,
  };
}

async function fetchMultipleTokens(addresses: string[], chain: string): Promise<TokenMetrics[]> {
  const results = await Promise.all(
    addresses.map(addr => fetchTokenMetrics(addr, chain))
  );
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, tokenAddress, tokenAddresses, chain = 'ethereum' } = await req.json();
    
    console.log(`Token metrics request: action=${action}, chain=${chain}`);
    
    let result: TokenMetrics | TokenMetrics[];
    
    switch (action) {
      case 'single': {
        if (!tokenAddress) {
          throw new Error('Token address required');
        }
        result = await fetchTokenMetrics(tokenAddress, chain);
        break;
      }
        
      case 'batch': {
        if (!tokenAddresses || !Array.isArray(tokenAddresses)) {
          throw new Error('Token addresses array required');
        }
        result = await fetchMultipleTokens(tokenAddresses, chain);
        break;
      }
        
      case 'watchlist': {
        // Predefined watchlist of popular meme tokens
        const watchlist = [
          '0x6982508145454ce325ddbe47a25d4ec3d2311933', // PEPE
          '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB
          '0xb131f4a55907b10d1f0a50d8ab8fa09ec342cd74', // MEME
          '0x6985884c4392d348587b19cb9eaaf157f13271cd', // ZRO
          '0x4d224452801aced8b2f0aebe155379bb5d594381', // APE
        ];
        result = await fetchMultipleTokens(watchlist, chain);
        break;
      }
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Token metrics error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
