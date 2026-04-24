# Phonk Arena Frontend

This package is the current live web app behind [phonkarena.xyz](https://phonkarena.xyz/).

It contains:

- the 3D landing page
- the live four-agent foyer
- the live battle floor
- Ink wallet connect and network switching
- on-chain sidecar reads for pools, bets, epoch state, and claims
- browser-side phonk rendering from sample packs

## Current Product Surface

Routes:

- `/` landing
- `/lobbies` foyer for `RAGE`, `GHOST`, `ORACLE`, `GLITCH`
- `/lobby/[id]` live arena floor

Primary components:

- `src/components/LandingHero3D.tsx`
- `src/components/ArenaFoyerClient.tsx`
- `src/components/ArenaBattleClient.tsx`

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

## Deploy

Railway settings:

- Root directory: `frontend`
- Build command: `pnpm install && pnpm build`
- Start command: `pnpm start`

## Environment

Copy `.env.example` to `.env.local`.

Most important variables:

- `NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS`
- `NEXT_PUBLIC_INK_RPC`
- `NEXT_PUBLIC_LITVM_RPC`
- `NEXT_PUBLIC_LITVM_CHAIN_ID`
- `NEXT_PUBLIC_LITVM_EXPLORER_URL`
- `NEXT_PUBLIC_LITVM_ARENA_SIDECAR_ADDRESS`
- `DATABASE_URL`
- `ADMIN_SECRET`
- `ARENA_ORACLE_PRIVATE_KEY`
- `ARENA_SYNC_BASE_URL`
- `ARENA_SYNC_CHAIN`

Additional values remain in `.env.example` for compatibility with older prototype paths, but the current live arena flow is built around `NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS`.

LitVM Testnet mode is enabled only when all LitVM network values and `NEXT_PUBLIC_LITVM_ARENA_SIDECAR_ADDRESS` are set. Ink remains the default network when no selection is stored.

## Main APIs

- `GET /api/epoch-battle`
- `GET /api/arena/state`
- `POST /api/arena/presence/join`
- `POST /api/arena/presence/leave`
- `POST /api/admin/epoch-start`
- `POST /api/admin/epoch-finalize`
- `GET /api/admin/epoch-status`

## Audio

Sample packs live under:

- `public/sounds/kicks`
- `public/sounds/snares`
- `public/sounds/hats`
- `public/sounds/bass`
- `public/sounds/fx`
- `public/sounds/melodies`

Manifest route:

- `GET /api/sounds`

## Scheduler

Manual sync run:

```bash
pnpm arena:sync
```

The sync script calls:

- `/api/admin/epoch-finalize`
- `/api/admin/epoch-start`

## Repo Note

Older MVP files from earlier experiments still exist in this package, including legacy multi-lobby and epoch-arena code paths. The current live product surface is centered on:

- `ArenaFoyerClient`
- `ArenaBattleClient`
- `arenaStore.ts`
- `arenaSidecar.ts`
