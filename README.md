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
| Seal, Bitcoin: build an unsigned sweep (PSBT) of every coin to a fresh address at a high fee cap; the owner signs in their own wallet; Lifeboat checks the signed escape pays only the safe address | built, tested with real signatures | [`lib/btc/rescue.ts`](lib/btc/rescue.ts), [`app/api/rescue/btc`](app/api/rescue/btc), [`components/Sealer.tsx`](components/Sealer.tsx) |
| Seal into the OutLayer vault, released by the watchman | planned | |
| Seal, Ethereum and BNB Chain: USDC and USDT transfers first, then a sweep of the native coin, nonces in sequence, high fee caps; signed offline (Foundry `cast mktx`); Lifeboat checks the signer, chain, nonces, recipient and fees | built, tested with real signatures | [`lib/evm/rescue.ts`](lib/evm/rescue.ts), [`app/api/rescue/evm`](app/api/rescue/evm), [`components/EvmEscape.tsx`](components/EvmEscape.tsx) |
| Upgrade NEAR, testnet run: create or reuse a testnet account, add an ML-DSA-65 key signed by the classic key, then sign a transaction with the ML-DSA key itself (optionally retire the classic key) | built, run on testnet: [`lifeboat-f86cd6e7d4.testnet`](https://testnet.nearblocks.io/address/lifeboat-f86cd6e7d4.testnet) holds an ML-DSA-65 key beside its Ed25519 key, and [this transaction](https://testnet.nearblocks.io/txns/DVAmKNmf8qmjGJ4fQAnyMGc4AVgjxZTbZPVbwCYZgL2o) was signed with the ML-DSA-65 key | [`scripts/near-upgrade.mjs`](scripts/near-upgrade.mjs), [`.github/workflows/near-testnet.yml`](.github/workflows/near-testnet.yml) |
| Upgrade NEAR screen: one button in the browser, with a wallet | planned | |
| Watchman: 60 canaries (unspent 2009 block rewards paid to bare public keys, 3,000 BTC), checked live; rules raise watch, alarm and release levels; NEAR AI Cloud gives a second opinion on an alarm but can never block a release or cause one alone; Watch screen with a labelled simulated attack | built, tested | [`lib/watchman`](lib/watchman), [`data/canaries.json`](data/canaries.json), [`scripts/find-canaries.mjs`](scripts/find-canaries.mjs), [`app/api/watch/status`](app/api/watch/status), [`components/Watch.tsx`](components/Watch.tsx) |
| Watchman releasing sealed escapes from the vault | planned (needs the OutLayer vault) | |
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

## Try the Bitcoin escape on testnet

1. Run `npm run dev` and open `/scan`. Paste a Bitcoin testnet address (`tb1q...`) that holds coins and has sent before. You should see "At risk" and a **Seal an escape** button.
2. Click it. In your wallet, make a brand-new receiving address, paste it as the safe address, and press **Prepare my escape**.
   - A safe address that was used before is refused.
   - You get an unsigned PSBT that sends every coin to the safe address at a fee well above today's.
3. Load the PSBT into a testnet wallet that can sign PSBTs (Sparrow, Electrum), sign it, paste the result back, and press **Check my escape**.
   - **A good escape:** "Your escape is ready", with its ID and a file to download.
   - **A bad one is refused**, with the reason. That covers an escape that pays anyone else, adds an output, spends other coins, lowers the fee or isn't signed.

Supported for escapes:

- **Single-key addresses:** P2WPKH (`bc1q`/`tb1q`) and P2PKH (`1...`/`m...`), both tested with real signatures. P2TR (`bc1p`) builds, but signing with a real Taproot wallet is not tested yet; the wallet adds its own key details when signing.
- **Not yet:** multisig.
- **Escapes use replace-by-fee,** so one can be re-signed at a higher fee later.

**Limit, stated plainly:** an escape is a race. If an attacker has already derived the private key, they can try to outbid the escape with their own transaction once it is broadcast. That is why escapes carry a fee cap far above today's, and why the watchman is meant to fire on the first signs of an attack (old exposed wallets moving), not after your own coins move.

## Try the Ethereum or BNB Chain escape on testnet

1. Open `/seal`, paste an exposed `0x` address, then choose **Ethereum** or **BNB Chain** and **Testnet** (Sepolia, or BNB Chain testnet). Paste a fresh `0x` address as the safe address.
2. Press **Prepare my escape**. You get one `cast mktx` command per step:
   - on mainnet, any USDC or USDT goes first;
   - the rest of the native coin goes last, after reserving every fee.
3. Run each command on your own machine. `cast` signs without sending.
4. Paste the signed results, one per line, and press **Check my escape**.
   - **A good escape:** "Your escape is ready".
   - **A bad one is refused**, with the reason. That covers a wrong signer, a wrong chain, a missing step, a changed recipient or a lower fee cap.

Browser wallets such as MetaMask cannot sign a transaction without sending it, which is why escapes are signed offline.

**On Ethereum, a little dust stays behind.** The sweep reserves the full fee cap, and whatever the fee doesn't use stays in the old address. On BNB Chain the sweep empties the address exactly.

## The watchman

**What it watches.** The canaries are the block rewards from Bitcoin blocks 1 to 61 (block 9's has been spent), mined in January 2009. They were paid to bare public keys, so their keys have been public for 17 years, and none has ever moved. If a quantum computer can derive private keys, these are the easiest coins to take. `scripts/find-canaries.mjs` rebuilds the list from mempool.space.

**How it decides:**

1. **One moves in a day:** watch closely. Owners sometimes move old coins.
2. **Three move in a day:** raise the alarm and ask a model on NEAR AI Cloud whether the moves look like an attack. A "yes" with at least 70% confidence releases.
3. **Eight move in a day:** release, whatever the judgement says.

**What the AI can and can't do.** It sees counts and fees, never addresses. It can confirm an alarm, but it can't start one and it can't block a release.

**Try it.** Open `/watch` to see the live state, checked against mempool.space every minute. Press **Show a simulated attack** to see eight canaries move: the screen says plainly that the attack is simulated, and nothing is released.

## Run it

```bash
npm install
npm test            # 72 tests, offline
npm run dev         # http://localhost:3000
npm run spike:mldsa # make an ML-DSA-65 key locally, sign and verify
```

No keys or environment variables are needed for the scanner.

## Renaming

The product name lives only in [`lib/brand.ts`](lib/brand.ts).

## Safety

- Nothing in this repo signs mainnet transactions or holds keys.
- The demo will run on testnet only, and the attack in it will be labelled as simulated.
