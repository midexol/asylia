# Lifeboat

Lifeboat gets your crypto out before a quantum computer can steal it, without ever holding your coins.

- **The escape is yours.** You sign it in your own wallet, to a fresh address whose key has never been seen.
- **It is sealed away.** It goes into an OutLayer TEE that nobody can read.
- **A watchman releases it.** It watches old wallets with exposed keys, and when they start moving like an attack, it sends the escapes out.
- **NEAR accounts are fixed in place.** They get a quantum-safe ML-DSA-65 key instead.

Built for [NEAR HACKATHON](https://nearhackathon.com), November 2026. Tracks: `security`, `privacy`, `open`.

**Other project by the same entrant:** [Assayer](https://github.com/midexol/assayer), which measures tokenized-stock prices across chains. The two projects are independent and share no code.

## Why this exists

A large enough quantum computer can derive a private key from its public key.

| Chain | When the public key becomes visible |
| --- | --- |
| Bitcoin | After the first spend. Taproot addresses always |
| Ethereum, BNB Chain | After the first outgoing transaction |
| NEAR | Always, but since network upgrade 2.13 an account can add an ML-DSA-65 key without moving funds |

Routing coins through NEAR Chain Signatures would not help. The MPC network signs with classical keys and has no post-quantum timeline yet. So Lifeboat never takes custody: the rescue is signed by the owner before it is sealed, and can only pay the owner's own addresses.

## Status

This table is updated as work lands. Anything not marked built is not claimed.

| Part | State | Where |
| --- | --- | --- |
| Exposure check: Bitcoin (all address types, mainnet and testnet), Ethereum, BNB Chain, NEAR | built, tested | [`lib/address.ts`](lib/address.ts), [`lib/exposure.ts`](lib/exposure.ts), [`lib/sources.ts`](lib/sources.ts), tests beside each |
| Scan screen and `POST /api/scan` | built | [`components/Scanner.tsx`](components/Scanner.tsx), [`app/api/scan/route.ts`](app/api/scan/route.ts) |
| Landing page | built | [`app/page.tsx`](app/page.tsx) |
| Spikes: ML-DSA-65 keys, OutLayer sealing, HOT Wallet | researched; ML-DSA keygen, sign and verify checked locally | [`docs/spikes.md`](docs/spikes.md), [`scripts/spike-mldsa.mjs`](scripts/spike-mldsa.mjs) |
| Seal: sign a Bitcoin and EVM rescue in the browser, seal it in OutLayer | planned | |
| Upgrade NEAR: one-click ML-DSA-65 key | planned | |
| Watchman: canary wallets, NEAR AI Cloud judgement, release | planned | |
| Simulated attack on testnet, end to end | planned | |

## How the exposure check works

1. Each pasted line is classified offline, with checksums verified:
   - Bitcoin P2PKH, P2SH, P2WPKH, P2WSH or P2TR (bech32 and bech32m per BIP-173/350)
   - an EVM address (EIP-55)
   - a NEAR account
2. Read-only public endpoints supply the facts: mempool.space for Bitcoin, publicnode RPC for Ethereum and BNB Chain, NEAR RPC, and CoinGecko for prices.
3. The verdict depends on the chain:
   - **Bitcoin, Ethereum, BNB Chain:** *exposed* if the address has ever spent (Bitcoin) or has a nonce above zero (EVM). Taproot is always exposed.
   - **NEAR:** *upgrade* unless an ML-DSA key is already on the account.
   - **Any chain:** *empty* if it holds nothing, and *unknown* if a lookup failed. A failed lookup never counts as safe.

All network calls sit in `lib/sources.ts` behind an injectable `fetch`, so the tests run offline.

## Run it

```bash
npm install
npm test            # 27 tests
npm run dev         # http://localhost:3000
npm run spike:mldsa # make an ML-DSA-65 key locally, sign and verify
```

No keys or environment variables are needed for the scanner.

## Renaming

The product name lives only in [`lib/brand.ts`](lib/brand.ts).

## Safety

- Nothing in this repo signs mainnet transactions or holds keys.
- The demo will run on testnet only, and the attack in it will be labelled as simulated.
