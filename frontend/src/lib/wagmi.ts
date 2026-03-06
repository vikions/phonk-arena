import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { inkMainnet } from "@/lib/inkChain";

const rpcUrl = process.env.NEXT_PUBLIC_INK_RPC || "https://rpc-gel.inkonchain.com";

export const wagmiConfig = createConfig({
  chains: [inkMainnet],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [inkMainnet.id]: http(rpcUrl),
  },
  ssr: true,
});
