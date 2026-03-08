import { fallback, http } from "viem";

const DEFAULT_INK_RPC_URL = "https://rpc-gel.inkonchain.com";

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => (value || "").trim()).filter((value) => value.length > 0))];
}

export function getInkRpcUrls(): string[] {
  return unique([
    process.env.INK_RPC_URL,
    process.env.NEXT_PUBLIC_INK_RPC,
    DEFAULT_INK_RPC_URL,
  ]);
}

export function getInkRpcUrl(): string {
  return getInkRpcUrls()[0] || DEFAULT_INK_RPC_URL;
}

export function getInkRpcTransport() {
  const transports = getInkRpcUrls().map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 1,
      retryDelay: 1_000,
    }),
  );

  return transports.length > 1 ? fallback(transports) : transports[0];
}

export { DEFAULT_INK_RPC_URL };
