# Phonk Arena Frontend

## Install

```bash
pnpm install
```

## Environment

Copy `.env.example` to `.env.local` and fill:

- `NEXT_PUBLIC_MONAD_RPC`
- `NEXT_PUBLIC_MATCH_ID`
- `ADMIN_SECRET`

## Run

```bash
pnpm dev
```

Routes:

- `/` landing
- `/lobbies` three live lobby cards with independent LIVE/IDLE + listeners
- `/lobby/[id]` continuous live battle + off-chain clip voting

API:

- `GET /api/match?lobbyId=...`
- `GET /api/match?all=1`
- `POST /api/presence/join`
- `POST /api/presence/leave`
- `POST /api/vote`
- `GET /api/sounds`
- `POST /api/admin/start` (protected)
- `POST /api/admin/reset` (protected)

Audio sample pack:

- Put files into `public/sounds/{kicks,snares,hats,bass,fx,melodies}`.
- Supported extensions: `.wav`, `.mp3`, `.ogg`, `.m4a`.
- To sync Lunatic pack from backend in one step, run:
  `powershell -ExecutionPolicy Bypass -File frontend/scripts/sync-lunatic-to-frontend.ps1`
