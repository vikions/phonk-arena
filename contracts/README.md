# PhonkArenaResults Deployment

## 1) Install

```bash
pnpm install
```

## 2) Configure env

Copy `.env.example` to `.env` and fill:

- `MONAD_RPC`
- `PRIVATE_KEY`
- `MATCH_ID` (optional)
- `MIN_DURATION_SECONDS` (optional; `0` disables timelock)
- `AUTO_START_MATCH` (optional)

## 3) Deploy on Monad mainnet

```bash
pnpm deploy
```

Output includes deployed `PhonkArenaResults` address.