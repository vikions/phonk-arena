# Phonk Arena

Autonomous agents battle in a live music duel with real on-chain wagering on Monad.

## What This Is

`Phonk Arena` is a custom game mode (`Agent Music Duel`) where two AI-driven agents compete in continuous rounds:

- agents generate evolving phonk performance states
- users vote and place token wagers on outcomes
- epoch winner is finalized on-chain
- winners claim payouts on-chain

This is intentionally not a classic board/card game. The game is strategic and stateful: agent behavior adapts over time based on results, risk profile, and lobby conditions.

## Why It Fits The Bounty

- Game type implemented: `Agent Music Duel` (non-traditional competitive game)
- Real token wagering: on-chain `placeBet` + `claim`
- Strategic decisions: agents mutate confidence, risk, intensity, and style based on outcomes
- Bankroll handling: per-agent bankroll and epoch bet pools are tracked
- Verifiable results: `vote`, `finalizeEpoch`, `claim` transactions on Monad

## Core Flow

1. Connect wallet and switch to Monad mainnet.
2. Enter a lobby with two competing agents.
3. Vote and place bet during active epoch.
4. At epoch end, contract finalization determines winner.
5. User claims payout from contract if eligible.

Important claim rule:

- claim target is always the previous epoch (`currentEpochId - 1`)
- frontend auto-calls `finalizeEpoch` before `claim` when needed

## Strategy Layer (Not Random)

Each agent has runtime state including:

- `strategy`: `AGGRESSIVE | ADAPTIVE | SAFE`
- `confidence`
- `riskLevel`
- `intensityBase`
- `mutationSensitivity`
- `bankroll`

During live play, the engine adjusts these values from vote outcomes and epoch outcomes. Winners and losers mutate differently, so behavior changes over time instead of random static play.

## Live Match Model

- clip playback cadence: `10s play + 2.5s pause`
- epoch duration: `1 hour`
- per-lobby isolated state and history
- listener-driven loop starts when users are present

Lobbies:

- `drift-hard`
- `soft-night`
- `chaos-lab`

## Tech Stack

- Next.js 14 + TypeScript + Tailwind
- wagmi + viem
- WebAudio synthesis
- server route-based match engine with persisted lobby snapshots in temp storage

## On-Chain Integration

Frontend is wired to `PhonkArenaEpochArena` ABI:

- ABI path: `frontend/src/lib/abi/PhonkArenaEpochArena.json`
- client bindings: `frontend/src/lib/contract.ts`
- default address: `NEXT_PUBLIC_EPOCH_ARENA_ADDRESS` in `frontend/.env.example`

Contract interactions used by UI:

- `currentEpochId`
- `vote`
- `placeBet`
- `getTally`
- `finalizeEpoch`
- `claim`
- `betA`, `betB`, `claimed`, `hasVoted`

## Repository Layout

- `frontend/` app UI, lobby engine integration, API routes, WebAudio
- `contracts/` legacy hardhat workspace (`PhonkArenaResults`) kept for reference
- `backend/` experimental/offline generation assets and scripts

## Quick Start

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

Required env values in `frontend/.env.local`:

- `NEXT_PUBLIC_MONAD_RPC`
- `NEXT_PUBLIC_EPOCH_ARENA_ADDRESS`
- `NEXT_PUBLIC_MATCH_ID`
- `ADMIN_SECRET`

## Key Routes

- `/` landing page
- `/lobbies` lobby index
- `/lobby/[id]` live battle + vote/bet/claim UI

## API Endpoints (Frontend App)

- `GET /api/match?lobbyId=...`
- `GET /api/match?all=1`
- `POST /api/presence/join`
- `POST /api/presence/leave`
- `POST /api/vote`
- `POST /api/bet`
- `POST /api/claim`
- `POST /api/admin/start` (protected)
- `POST /api/admin/reset` (protected)

## 3D Asset Attribution

- Landing background model: `Matryoshka`
- Author: `Neo_minigan`
- License: `CC Attribution` (`CC BY`)
- Source: https://sketchfab.com/3d-models/matryoshka-aeaec4f19c684a0fae818eff5078ec2d

## Demo Checklist (For Judges)

1. Show wallet connected on Monad and lobby opened.
2. Show existing votes in current epoch.
3. Place a bet and capture tx hash.
4. Wait epoch rollover (or time-cut in video edit).
5. Click `Claim Epoch #...` and capture claim tx hash in explorer.
6. Confirm payout success.

## Submission Notes

- Demo video: [PhonkARENA](https://x.com/varlamc88/status/2023049785884709068?s=20)
- Monad explorer tx set: https://monadscan.com/tx/0x855d6d133274d346798b6d0148f698f293c452f8be080795c1cf3112405bf25c
- Live URL: https://phonkarena.xyz/

