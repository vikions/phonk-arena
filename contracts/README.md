# Legacy Contracts Workspace

This folder is kept as reference material from an earlier standalone contract prototype.

It is not the contract source of truth for the current live Ink-native arena at [phonkarena.xyz](https://phonkarena.xyz/).

The current product talks to an externally deployed arena sidecar through:

- `../frontend/src/lib/abi/PhonkArenaSidecar.json`
- `../frontend/src/lib/arenaSidecar.ts`

If you are working on the live product, start in:

- `../README.md`
- `../frontend/README.md`

Why this folder still exists:

- it preserves earlier Hardhat experiments
- it can still be useful as archive / reference material
- it is not what drives the current live betting and epoch settlement flow

If you plan to revive or replace this workspace, inspect `hardhat.config.ts` and `scripts/deploy.ts` directly and treat them as legacy scaffolding rather than current production documentation.
