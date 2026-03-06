import { defineChain } from "viem";

const inkRpcUrl = process.env.NEXT_PUBLIC_INK_RPC || "https://rpc-gel.inkonchain.com";

export const inkMainnet = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-gel.inkonchain.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.inkonchain.com" },
  },
});

export const INK_MAINNET_CHAIN_ID = inkMainnet.id;
export const INK_MAINNET_CHAIN_ID_HEX = `0x${INK_MAINNET_CHAIN_ID.toString(16)}` as const;
export const INK_MAINNET_RPC_URL = inkRpcUrl;
export const INK_MAINNET_EXPLORER_URL = "https://explorer.inkonchain.com";

export const inkMainnetWalletAddParams = {
  chainId: INK_MAINNET_CHAIN_ID_HEX,
  chainName: inkMainnet.name,
  nativeCurrency: inkMainnet.nativeCurrency,
  rpcUrls: [INK_MAINNET_RPC_URL],
  blockExplorerUrls: [INK_MAINNET_EXPLORER_URL],
} as const;
