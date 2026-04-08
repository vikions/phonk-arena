# Phonk Arena

Phonk Arena is a live Ink-native music arena where four autonomous agents discover Ink ecosystem tokens, turn market data into phonk, and battle on a continuous floor while users back the agent they think will finish the epoch strongest.

Live product: [phonkarena.xyz](https://phonkarena.xyz/)

## What The Product Is Now

- Four fixed agents: `RAGE`, `GHOST`, `ORACLE`, `GLITCH`
- One live foyer at `/lobbies`
- One live battle floor mounted at `/lobby/[id]`
- Browser-rendered phonk clips: `10s` live clip + `2.5s` transition gap
- Daily epoch logic synced against an Ink sidecar
- On-chain betting and claim flow on Ink
- Listener-driven runtime: the floor wakes up when people enter and idles when the room is empty

## How It Works

### 1. Discover

Every epoch, the system pulls live Ink ecosystem candidates and assigns one token to each agent.

Current discovery stack:

- `InkyPump` for candidate discovery
- `DexScreener` for live market enrichment
- PostgreSQL snapshots for holder deltas when `DATABASE_URL` is configured

Each agent scores the market differently:

- `RAGE`: volatility and pressure
- `GHOST`: holders, recency, and hype
- `ORACLE`: liquidity, volume, and steadier market weight
- `GLITCH`: seeded chaos from the hype pool

### 2. Compose

The browser does not play a fixed MP3 playlist. Each clip is rendered from:

- token price change
- volume
- transaction flow
- liquidity
- holder flow
- agent DNA
- sample packs from `frontend/public/sounds`

That means the same agent sounds different when its token changes.

### 3. Battle

The live floor rotates all four agents in order:

- `RAGE`
- `GHOST`
- `ORACLE`
- `GLITCH`

Every pass updates the recent clip history, the live board, and the active floor state.

### 4. Settle

The winner is not picked by popularity.

At epoch close, the sidecar finalizes using token performance:

- `Price Surge`: `55%`
- `Volume`: `25%`
- `Flow`: `10%`
- `Liquidity`: `5%`
- `Holder Flow`: `5%`

Users who backed the winning agent can claim on-chain after finalization.

## Product Surface

### Landing

`/`

A full-screen 3D landing page with the arena identity, wallet connect, and hero audio controls.

### Agent Foyer

`/lobbies`

The foyer shows the four agents as character cards, their current token picks, their win/loss state, and live preview playback for the token they are carrying.

### Battle Floor

`/lobby/[id]`

The battle floor is the current live arena experience:

- four-agent rotation
- live clip timer
- epoch timer
- live leaderboard
- current token per agent
- on-chain pool reads
- bet rail
- claim rail
- recent clip history

## On-Chain Integration

Phonk Arena is currently wired to an external Ink sidecar contract through:

- `frontend/src/lib/abi/PhonkArenaSidecar.json`
- `frontend/src/lib/arenaSidecar.ts`

The live app reads or writes:

- current epoch id
- epoch open / closed state
- token selection recording
- epoch finalization
- pool sizes
- user bets
- claims

Important repo note:

- The current production integration is ABI-first.
- The live sidecar source is not the main contract workspace in this repository.
- The old `/contracts` folder is kept as reference material and is not the source of truth for the current Ink arena flow.

## Runtime And Automation

The arena runtime is server-driven from:

- `frontend/src/lib/server/arenaStore.ts`
- `frontend/src/lib/server/tokenDiscovery.ts`
- `frontend/src/lib/server/arenaEpochSync.ts`
- `frontend/src/lib/server/agentProfileStore.ts`

Protected admin routes:

- `POST /api/admin/epoch-start`
- `POST /api/admin/epoch-finalize`
- `GET /api/admin/epoch-status`

Cron / scheduler entrypoint:

- `frontend/scripts/arena-sync.mjs`

Useful command:

```bash
cd frontend
pnpm arena:sync
```

## Stack

### Frontend

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- wagmi + viem
- React Three Fiber / drei for the landing hero
- WebAudio + sample-driven phonk rendering

### Data Layer

- InkyPump
- DexScreener
- PostgreSQL for holder snapshots and agent progression persistence

### Chain

- Ink mainnet
- chain id `57073`

## Repository Layout

- `frontend/`: current live product, UI, APIs, audio engine, Ink integration
- `contracts/`: legacy standalone contract workspace kept for reference
- `backend/`: source sample packs and offline asset material

## Local Setup

Requirements:

- Node `18.17+`
- `pnpm`

Run:

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

## Deploy

Railway:

- Root directory: `frontend`
- Build command: `pnpm install && pnpm build`
- Start command: `pnpm start`

## Environment

See `frontend/.env.example` for the full list.

Most important variables right now:

- `NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS`: current live sidecar address
- `NEXT_PUBLIC_INK_RPC`: Ink RPC endpoint
- `DATABASE_URL`: enables persistent holder snapshots and agent mutation history
- `ADMIN_SECRET`: protects admin routes
- `ARENA_ORACLE_PRIVATE_KEY`: wallet used by the sync worker to record selections and finalize epochs
- `ARENA_SYNC_BASE_URL`: base URL for the sync script / cron runner

Notes:

- Without `DATABASE_URL`, the app still boots, but agent progression falls back to in-memory defaults.
- Without `NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS`, the live arena UI still renders, but real on-chain pool and claim flow will be unavailable.

## Audio Packs

The phonk engine loads sample manifests from:

- `frontend/public/sounds/kicks`
- `frontend/public/sounds/snares`
- `frontend/public/sounds/hats`
- `frontend/public/sounds/bass`
- `frontend/public/sounds/fx`
- `frontend/public/sounds/melodies`

Manifest route:

- `GET /api/sounds`

## Current Main Routes

- `/`
- `/lobbies`
- `/lobby/[id]`
- `GET /api/epoch-battle`
- `GET /api/arena/state`
- `POST /api/arena/presence/join`
- `POST /api/arena/presence/leave`

## Important Code Paths

If you are reading the repo for the current product, start here:

- `frontend/src/components/LandingHero3D.tsx`
- `frontend/src/components/ArenaFoyerClient.tsx`
- `frontend/src/components/ArenaBattleClient.tsx`
- `frontend/src/lib/server/arenaStore.ts`
- `frontend/src/lib/server/tokenDiscovery.ts`
- `frontend/src/lib/arenaSidecar.ts`

There are older prototype files still in the tree from earlier iterations. The live arena flow above is the current source of truth.

## Asset Attribution

- Landing model: `Matryoshka`
- Author: `Neo_minigan`
- License: `CC BY`
- Source: https://sketchfab.com/3d-models/matryoshka-aeaec4f19c684a0fae818eff5078ec2d
