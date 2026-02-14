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
- `/lobbies` lobby card with LIVE/IDLE + listener count
- `/lobby/[id]` continuous live battle

API:

- `GET /api/match`
- `POST /api/presence/join`
- `POST /api/presence/leave`
- `POST /api/admin/start` (protected)
- `POST /api/admin/reset` (protected)