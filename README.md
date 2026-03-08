# Phonk Arena

Phonk Arena is a live Ink-native music battle where four autonomous agents discover tokens from the Ink ecosystem, turn those tokens into phonk, and fight for the crown through live market performance.

Live product: [phonkarena.xyz](https://phonkarena.xyz/)

## What Makes It Different

Most onchain games stop at charts, votes, or simple PvP. Phonk Arena turns Ink token flow into a live audiovisual battleground:

- every epoch, each agent selects an Ink token
- each selected token becomes the basis for that agent's sound
- the browser generates phonk clips live from token metrics, agent DNA, and sample packs
- users bet on the agent they believe will finish the epoch strongest
- the winner is settled on-chain by token performance, not by popularity

The result is a product that feels like a music arena, a market game, and an autonomous agent experiment at the same time.

## Four Agents

Phonk Arena runs with four fixed agents:

- `RAGE`: hunts volatility and pushes the hardest, most aggressive sound
- `GHOST`: leans into holder behavior, dark texture, and ghosted vocal space
- `ORACLE`: favors liquidity, volume, and steadier market conviction
- `GLITCH`: embraces chaos and rotates through the most unstable corners of the board

Each agent has persistent DNA that shapes how it sounds:

- `bpmRange`
- `layerDensity`
- `glitchIntensity`
- `bassWeight`
- `mutationVersion`
- `wins / losses`

## How The Product Works

### 1. Discover

The system scans live Ink ecosystem tokens and ranks candidates with a strategy layer:

- `RAGE`: prioritizes volatility
- `GHOST`: prioritizes holder momentum and hype
- `ORACLE`: prioritizes volume and liquidity
- `GLITCH`: rotates through a seeded hype pool

Selections are tied to the active epoch, not to an arbitrary browser session.

### 2. Compose

Each agent turns its selected Ink token into phonk.

The audio engine uses:

- token price change
- volume
- holder count
- liquidity
- transaction activity
- agent DNA
- curated sample packs

This means every selected Ink token creates a different musical result. The sound is not a fixed MP3 playlist. It is generated live in the browser from the token state and the agent profile.

### 3. Battle

The arena rotates through the four agents on a live floor:

- `10s` live clip
- `2.5s` transition gap
- listener-driven runtime

Users can enter the foyer, preview the agents, then move into the battle floor and place a bet.

### 4. Settle

The winner is not chosen by votes.

At epoch close, the sidecar contract finalizes the epoch from token performance:

- `Price Surge`: `55%`
- `Volume`: `25%`
- `Flow`: `10%`
- `Liquidity`: `5%`
- `Holder Flow`: `5%`

Users who backed the winning agent can claim on-chain.

## Why It Fits Ink

Phonk Arena is built around Ink ecosystem assets, not around a generic chain abstraction.

- the discovery layer is Ink-specific
- the explorer and live token data are Ink-aware
- betting and settlement happen on Ink
- the product identity depends on Ink tokens becoming characters, sound, and competition

The core idea is simple:

> Tokens on Ink do not just trade. In Phonk Arena, they become music.

## Current Product Surface

### Landing

The landing page introduces the arena identity and the live aesthetic.

### Agent Foyer

`/lobbies`

Users see all four agents as premium character cards, inspect the current token each one is carrying, and preview the phonk that agent is generating right now.

### Battle Arena

`/lobby/[id]`

The battle floor shows:

- four agents around a live arena layout
- active clip rotation
- live leaderboard
- on-chain market panel
- betting
- claim rail

## On-Chain Design

Phonk Arena currently uses a dedicated 4-way sidecar for the new arena flow.

Frontend integration lives in:

- [arenaSidecar.ts](frontend/src/lib/arenaSidecar.ts)
- [PhonkArenaSidecar.json](frontend/src/lib/abi/PhonkArenaSidecar.json)

The sidecar handles:

- `recordTokenSelection`
- `placeBet`
- `finalizeEpoch`
- `getEpochResult`
- `claim`

## Automation

Epoch lifecycle is automated.

The web app exposes protected admin routes:

- `POST /api/admin/epoch-start`
- `POST /api/admin/epoch-finalize`
- `GET /api/admin/epoch-status`

A dedicated cron runner calls them through:

- [arena-sync.mjs](frontend/scripts/arena-sync.mjs)

This means:

- each new epoch gets its four token selections written on-chain
- each closed epoch is finalized on-chain
- the runtime stays in sync without manual daily intervention

## Architecture

### Frontend

- Next.js 14
- TypeScript
- Tailwind
- wagmi + viem
- WebAudio / sample-driven phonk engine

### Data Layer

- InkyPump for token discovery
- DexScreener for live market enrichment
- PostgreSQL snapshots for holder history and delta tracking

### Runtime

- server-driven arena state
- listener presence loop
- epoch-aware token selection
- on-chain settlement sidecar

## Repository Layout

- `frontend/`: main app, arena UI, API routes, audio engine, on-chain integration
- `contracts/`: separate contract workspace
- `backend/`: experimental or offline generation assets

## Local Setup

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

## Required Environment Variables

Frontend app:

- `NEXT_PUBLIC_INK_RPC`
- `NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_BLOCKSCOUT_API`
- `DATABASE_URL`
- `ADMIN_SECRET`
- `ARENA_ORACLE_PRIVATE_KEY`
- `ARENA_SYNC_BASE_URL`

## Main Routes

- `/`
- `/lobbies`
- `/lobby/[id]`

## Main API Routes

- `GET /api/epoch-battle`
- `GET /api/arena/state`
- `POST /api/arena/presence/join`
- `POST /api/arena/presence/leave`
- `POST /api/admin/epoch-start`
- `POST /api/admin/epoch-finalize`
- `GET /api/admin/epoch-status`

## Demo Notes

What matters most when reviewing the project:

1. Four autonomous agents each bind themselves to a live Ink token.
2. That token meaningfully changes the phonk they produce.
3. The battle loop is live and listener-driven.
4. Bets are placed on-chain.
5. The winner is decided by token performance on Ink, not by a popularity contest.

## Asset Attribution

- Landing model: `Matryoshka`
- Author: `Neo_minigan`
- License: `CC BY`
- Source: https://sketchfab.com/3d-models/matryoshka-aeaec4f19c684a0fae818eff5078ec2d
