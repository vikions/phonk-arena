import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { getArenaWagmiChains, isArenaNetworkConfigured, litvmTestnet } from "@/lib/arenaNetworks";
import { inkMainnet } from "@/lib/inkChain";

const rpcUrl = process.env.NEXT_PUBLIC_INK_RPC || "https://rpc-gel.inkonchain.com";
const litvmRpcUrl = process.env.NEXT_PUBLIC_LITVM_RPC || "";

const transports = {
  [inkMainnet.id]: http(rpcUrl),
  ...(isArenaNetworkConfigured("litvm") && litvmRpcUrl
    ? {
        [litvmTestnet.id]: http(litvmRpcUrl),
      }
    : {}),
};

export const wagmiConfig = createConfig({
  chains: getArenaWagmiChains(),
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports,
  ssr: true,
});
