import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { monadMainnet } from "@/lib/monadChain";

const rpcUrl = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

export const wagmiConfig = createConfig({
  chains: [monadMainnet],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [monadMainnet.id]: http(rpcUrl),
  },
  ssr: true,
});