import { defineChain } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

export const MONAD_MAINNET_CHAIN_ID = 143;

export const monadMainnet = defineChain({
  id: MONAD_MAINNET_CHAIN_ID,
  name: "Monad Mainnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://monadexplorer.com",
    },
  },
});