import { createConfig, http } from 'wagmi';
import { mainnet, base, arbitrum, optimism, polygon } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

// Note: WalletConnect requires a valid project ID from cloud.walletconnect.com
// For now, we'll use injected wallets and Coinbase only
export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, optimism, polygon],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'CryptoOps Trading Platform' }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
});

export const supportedChains = [
  { id: mainnet.id, name: 'Ethereum', symbol: 'ETH' },
  { id: base.id, name: 'Base', symbol: 'ETH' },
  { id: arbitrum.id, name: 'Arbitrum', symbol: 'ETH' },
  { id: optimism.id, name: 'Optimism', symbol: 'ETH' },
  { id: polygon.id, name: 'Polygon', symbol: 'MATIC' },
];
