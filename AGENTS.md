# Notes for coding agents

## What this is

Asylia is a Next.js 15 (App Router, TypeScript) app. Read [README.md](README.md) for the product, and [docs/spikes.md](docs/spikes.md) for what is proven and what is open.

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
  - colours: light grey `#F4F5F6` page, surface `#ECEDEE`, white cards, ink `#17171A` text, dark pill buttons `#21201E`, blue `#2F6BFF` accent, red `#E5484D` for danger, green `#12A150` for safe. No gold (deliberately different from Assayer). No boat, sea or rescue imagery: the name may change
  - type: Switzer (Fontshare) 500 for headlines with one italic phrase, Switzer for body, Geist Mono for data (deliberately different from Assayer)
  - no gradients; the painted hero panels are SVG noise cut into flat bands (`components/Paint.tsx`)
- **Safety:**
  - never commit keys, seeds or `.env` files
  - never sign or broadcast on mainnet
  - testnet only, and only with the owner's go-ahead
- **Commits:** authored as midexol. No co-author or tool attribution lines.
