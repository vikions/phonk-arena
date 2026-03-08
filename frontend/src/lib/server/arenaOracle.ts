import "server-only";

import { createWalletClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { inkMainnet } from "@/lib/inkChain";
import { getInkRpcTransport } from "@/lib/inkRpc";

export function isAdminAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : authorization;

  return token === secret;
}

function getOraclePrivateKey(): `0x${string}` | null {
  const raw = (process.env.ARENA_ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY || "").trim();
  if (!raw) {
    return null;
  }

  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

export function getArenaOracleWalletClient(): WalletClient {
  const privateKey = getOraclePrivateKey();
  if (!privateKey) {
    throw new Error("ARENA_ORACLE_PRIVATE_KEY is not configured.");
  }

  const account = privateKeyToAccount(privateKey);

  return createWalletClient({
    account,
    chain: inkMainnet,
    transport: getInkRpcTransport(),
  });
}
