# Notes for coding agents

## What this is

Lifeboat is a Next.js 15 (App Router, TypeScript) app. Read [README.md](README.md) for the product, and [docs/spikes.md](docs/spikes.md) for what is proven and what is open.

## Commands

- `npm test`: vitest, runs offline
- `npx eslint .`
- `npx tsc --noEmit`
- `npm run build`
- `cd vault && cargo test`: the enclave program's rules and encryption, natively
- Workflows: `NEAR testnet upgrade`, `Vault` (`deploy=yes`, `selftest=yes`), `Site end-to-end` (live checks against testnet and mainnet data)

## Rules

- **Name:** the product name appears only in `lib/brand.ts`. Never hard-code it elsewhere.
- **Network calls:** they go in `lib/sources.ts` and take a `fetch` parameter, so tests can fake them. Pure logic stays in `lib/` modules without I/O (`address.ts`, `exposure.ts`, `btc/`, `evm/`, `watchman/detect.ts`, `near/upgrade.ts`).
- **Vault encryption:** `lib/vault/seal.ts` and `vault/src/seal.rs` must stay byte-for-byte compatible. `lib/vault/seal.test.ts` writes the fixture that the Rust tests open.
- **Watchman rules:** `lib/watchman/detect.ts` and `vault/src/rules.rs` must agree (window 144 blocks, alarm 3, release 8).
- **Failed lookups:** a failed lookup must produce the verdict `unknown`, never `hidden` or `empty`.
- **Copy on screen:** plain English, sentence case, one obvious action per screen. Avoid jargon such as "UTXO", "nonce" or "secp256k1" in the UI. It is fine in code and docs.
- **Design:**
  - colours: pure black `#000`, ivory `#F2EFE8`, coral `#E58363` for danger, sea `#8FB8A8` for safe. No gold (deliberately different from Assayer)
  - type: Bricolage Grotesque 700/800 for headlines, Hanken Grotesk for everything else (deliberately different from Assayer)
  - no gradients
- **Safety:**
  - never commit keys, seeds or `.env` files
  - never sign or broadcast on mainnet
  - testnet only, and only with the owner's go-ahead
- **Commits:** authored as midexol. No co-author or tool attribution lines.
