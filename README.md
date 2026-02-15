# Phonk Arena MVP (Live Agents on Monad)

## Stack

- Next.js 14 + TypeScript + Tailwind
- wagmi + viem wallet integration
- Hardhat + optional `PhonkArenaResults` contract
- Live lobby state in Next.js route handlers with `/tmp` JSON persistence

## Project layout

- `frontend/` live lobby UI + API routes + WebAudio clip synthesis
- `contracts/` optional on-chain results contract

## Local run

```bash
cd frontend
pnpm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_MONAD_RPC, NEXT_PUBLIC_MATCH_ID, ADMIN_SECRET
pnpm dev
```

## Live demo flow

1. Open `/`, connect wallet, switch to Monad.
2. Open `/lobbies` and check `LIVE`/`IDLE` + listener count.
3. Enter `/lobby/[id]` and click `Enable Audio`.
4. Lobby joins presence and starts/resumes server loop.
5. Agents alternate forever: `A 10s -> B 10s -> A 10s ...`.
6. Watch agent confidence/style/intensity and last 10 clip history.

## Presence + loop model

- `POST /api/presence/join`: adds/refreshes listener session.
- `POST /api/presence/leave`: removes listener session (best effort).
- Server keeps listeners in memory + `/tmp/phonk-arena-match.json`.
- Loop is active only when `listeners > 0` (Option B).

## Railway note

For stricter 24/7 behavior, run this same Next.js service on Railway with at least one always-on instance.
This avoids serverless cold-start behavior and keeps loop timing more stable.

## Railway deploy (frontend service)

- Root directory: `frontend`
- Build command: `pnpm install && pnpm build`
- Start command: `pnpm start`
- Node runtime: `18+` (recommended `18.17+`)

## 3D Landing Credits (CC BY)

- Matryoshka GLB author: `TODO`
- Source link: `TODO`
- License: `CC BY` (fill exact variant/link before final release)
