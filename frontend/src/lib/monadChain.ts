import { defineChain } from "viem";

const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_MAINNET_CHAIN_ID_HEX = `0x${MONAD_MAINNET_CHAIN_ID.toString(16)}` as const;
export const MONAD_MAINNET_RPC_URL = rpcUrl;
export const MONAD_MAINNET_EXPLORER_URL = "https://monadexplorer.com";

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
      url: MONAD_MAINNET_EXPLORER_URL,
    },
  },
});

export const monadMainnetWalletAddParams = {
  chainId: MONAD_MAINNET_CHAIN_ID_HEX,
  chainName: monadMainnet.name,
  nativeCurrency: monadMainnet.nativeCurrency,
  rpcUrls: [MONAD_MAINNET_RPC_URL],
  blockExplorerUrls: [MONAD_MAINNET_EXPLORER_URL],
} as const;
