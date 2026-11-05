# Asylia

*Asylia* is Greek for inviolability: protection from seizure. The project was built under the working name Lifeboat, so the repository, the live site address, the testnet account (`lifeboat-f86cd6e7d4.testnet`) and the vault's encryption labels still say `lifeboat`.

Asylia gets your crypto out before a quantum computer can steal it, without ever holding your coins.

A large enough quantum computer can work out a wallet's private key from its public key, and millions of wallets have already published theirs. Asylia does four things:

1. **Scan:** finds which of your Bitcoin, Ethereum, BNB Chain and NEAR wallets are exposed, and how much is in them.
2. **Seal:** helps you sign an *escape* in your own wallet: a transaction that moves everything to a fresh address whose key has never been seen. The escape is encrypted in your browser and sealed inside a vault running in an OutLayer enclave on NEAR.
3. **Upgrade NEAR:** walks you through adding a quantum-safe ML-DSA-65 key to a NEAR account: same account, same coins, nothing moves.
4. **Watch:** a watchman tracks 60 Bitcoin block rewards from 2009 whose keys have always been public. If they start moving like an attack, the vault broadcasts every escape. The vault can release escapes, but it can never change where they pay.

Built at [NEAR HACKATHON](https://nearhackathon.com), November 2026. **Tracks:** `security`, `privacy`, `open`.

**Other project by the same entrant:** [Assayer](https://github.com/midexol/assayer), which measures tokenized-stock prices across chains. The two projects are independent and share no code.

## Proof on chain (NEAR testnet)

| What | Where |
| --- | --- |
| A NEAR account with a quantum-safe ML-DSA-65 key beside its classic key | [`lifeboat-f86cd6e7d4.testnet`](https://testnet.nearblocks.io/address/lifeboat-f86cd6e7d4.testnet) |
| A transaction signed by that ML-DSA-65 key (3,309-byte signature) | [`DVAmKNmf…YZgL2o`](https://testnet.nearblocks.io/txns/DVAmKNmf8qmjGJ4fQAnyMGc4AVgjxZTbZPVbwCYZgL2o) |
| The vault registered on OutLayer as `lifeboat-f86cd6e7d4.testnet/lifeboat-vault` | [`91xhjC7i…PeQApW`](https://testnet.nearblocks.io/txns/91xhjC7iNH23XCC1HqQ6iSLy9TnuYKKvGcR1wBPeQApW) |
| The vault answering inside the enclave with its own public key | [`JAnUUC85…53Ud9M`](https://testnet.nearblocks.io/txns/JAnUUC85rANQpvVZBrBVGbPG8H2qSmjPpSBcSB53Ud9M) |
| The website sealing an encrypted escape into the vault | [`47idhuMV…c589ws`](https://testnet.nearblocks.io/txns/47idhuMV61qirbBhT7ocXyQ7PxbL3yVJBq4yP4c589ws) |
| The vault checking all 60 canaries from inside the enclave, finding them calm, and refusing to release | [`GTRxvhPr…n4h2ZK`](https://testnet.nearblocks.io/txns/GTRxvhPrshfR2HdRfSB6u7bTQbuUWC55BVePSpn4h2ZK) |

Each of these is reproducible from the workflows in [`.github/workflows`](.github/workflows): `NEAR testnet upgrade`, `Vault` (with `selftest=yes`) and `Site end-to-end`.

## Try it

Needs Node 22.

```bash
git clone https://github.com/midexol/lifeboat && cd lifeboat
npm install
npm test        # 87 tests, all offline
npm run dev     # http://localhost:3000
```

- **Open `/`.** You should see the landing page: the problem, the four steps, and one button, **Check my wallets**.
- **Open `/scan`**, paste `lifeboat-f86cd6e7d4.testnet`, and press **Check them**. You should see "Already upgraded": the scanner read the account's keys from NEAR testnet and found the quantum-safe one.
- **Paste a Bitcoin, Ethereum or BNB Chain address that has sent coins before.** You should see "At risk", the dollars in it, and a **Seal an escape** button. An address that has only ever received shows "Safe for now".
- **Open `/watch`.** You should see "Calm" and all 60 canaries, checked live against mempool.space. Press **Show a simulated attack**: eight canaries turn to "Moved", the level becomes "Would release", and the screen states that the attack is simulated and nothing was released.
- **Open `/upgrade`** and enter `lifeboat-f86cd6e7d4.testnet`. You should see "is quantum-safe" and both keys. For an account without the new key, it shows the three NEAR CLI commands that add one.
- **Open `/seal`.** The full Bitcoin and EVM escape walk-throughs are below.

None of this needs keys or environment variables, except sealing into the vault (see "Run it yourself").

## How NEAR is used

- **Quantum-safe keys (protocol 2.13, ML-DSA-65).**
  - NEAR is the one chain here that can be fixed in place. Asylia adds an ML-DSA-65 key to an existing account, signed by the classic key, then signs with the new key: [`scripts/near-upgrade.mjs`](scripts/near-upgrade.mjs), using FastNEAR's `@fastnear/ml-dsa-65`.
  - The Upgrade screen checks any account's keys live and gives the NEAR CLI commands (`near-cli-rs` 0.29+). The key is generated on the owner's computer, never on a website.
- **OutLayer enclave (TEE) on NEAR.** The vault ([`vault/`](vault), Rust, `wasm32-wasip2`):
  - makes its own encryption key inside the enclave;
  - opens escapes that owners encrypted to it in their browsers;
  - keeps them in OutLayer's encrypted storage;
  - checks the canaries itself, and broadcasts escapes itself only when its rule says so.

  It is called through `request_execution` on `outlayer.testnet`.
- **NEAR AI Cloud.** When three or more canaries move in a day, the watchman asks a model on NEAR AI Cloud whether the moves look like an attack ([`lib/watchman/judge.ts`](lib/watchman/judge.ts)). The model sees counts and fees, never addresses. It can confirm an alarm, but it can't start one or block a release.
- **Why not Chain Signatures?** NEAR's MPC network signs with classical keys and has no post-quantum timeline yet. Asylia therefore never takes custody of coins.

## Why each track

- **`security`:** an attack-detecting agent whose powers are deliberately narrow. It can release escapes the owners signed themselves, but it can never redirect them. Every signed escape is checked before sealing:
  - it pays only the safe address;
  - it spends exactly the planned coins;
  - it keeps the planned fee;
  - it is signed by the exposed wallet.

  Tampered escapes are refused in the browser flow and in the enclave.
- **`privacy`:** escapes are encrypted on the owner's device to a key that exists only inside the enclave. Neither the Asylia server nor anyone reading NEAR can see them. The AI judgement receives no addresses.
- **`open`:** quantum readiness across Bitcoin, Ethereum, BNB Chain and NEAR in one flow, built to be usable by someone who has never heard of a public key.

## The problem

| Chain | When the public key becomes visible | What Asylia does |
| --- | --- | --- |
| Bitcoin | After the first spend. Taproot always | Escape to a fresh address |
| Ethereum, BNB Chain | After the first outgoing transaction | Escape, including USDC and USDT |
| NEAR | Always: access keys are public | Add a quantum-safe key in place |

Project Eleven [estimates about $600B of Bitcoin](https://thequantuminsider.com/2025/06/19/project-eleven-raises-6-million-to-secure-digital-assets-against-quantum-threats/) sits in wallets whose keys are already public.

## How each step works

### Scan

1. Each pasted line is classified offline, with checksums verified:
   - Bitcoin P2PKH, P2SH, P2WPKH, P2WSH, P2TR (BIP-173 and BIP-350)
   - EVM (EIP-55)
   - NEAR accounts
2. Read-only public endpoints supply the facts: mempool.space, publicnode RPC, NEAR RPC and CoinGecko.
3. The verdict depends on the chain:
   - **Bitcoin, Ethereum, BNB Chain:** *exposed* if the address has spent (Bitcoin) or has a nonce above zero (EVM). Taproot is always exposed.
   - **NEAR:** *upgrade* unless the account already has an ML-DSA key.
   - **Any chain:** *empty* when it holds nothing. A failed lookup shows "Couldn't check" and never counts as safe.

All network calls sit in [`lib/sources.ts`](lib/sources.ts) behind an injectable `fetch`, so the tests run offline.

### Seal: Bitcoin

1. On `/scan`, an exposed `tb1q…` (testnet) address shows **Seal an escape**. Click it, paste a brand-new address from your wallet as the safe address, and press **Prepare my escape**. A safe address that has been used before is refused.
2. You get an unsigned PSBT that sends every coin to the safe address. Its fee cap is five times today's fastest fee by default ("High"), with a floor.
3. Sign it in your own wallet (Sparrow, Electrum), paste it back, and press **Check my escape**.
   - **A good escape:** "Your escape is ready".
   - **A bad one is refused** with the reason: it pays anyone else, adds an output, spends other coins, lowers the fee, or isn't signed.
4. Press **Seal into the vault**. The escape is encrypted in your browser and sealed. You get a link to the vault's record on NEAR testnet.

Code: [`lib/btc/rescue.ts`](lib/btc/rescue.ts), [`components/Sealer.tsx`](components/Sealer.tsx).

### Seal: Ethereum and BNB Chain

1. Paste an exposed `0x` address, choose the network, and choose **Testnet**.
2. You get one `cast mktx` command per step. On mainnet, any USDC or USDT goes first. The rest of the native coin goes last, after every fee is reserved.
3. Run each command on your own computer. `cast` signs without sending, which browser wallets such as MetaMask can't do. Paste the results back.
4. Asylia checks the signer, chain, nonces, recipients (including inside token transfers) and fee caps.

Code: [`lib/evm/rescue.ts`](lib/evm/rescue.ts), [`components/EvmEscape.tsx`](components/EvmEscape.tsx).

### Upgrade NEAR

1. Enter an account. The screen reads its keys from NEAR and marks each one classic or quantum-safe.
2. If no quantum-safe key is there, it gives three commands:
   1. install `near-cli-rs`
   2. sign in with your wallet
   3. `near account add-key <account> grant-full-access autogenerate-new-keypair --signature-scheme ml-dsa-65 save-to-keychain …`
3. Press **Check again** to confirm the new key on chain.

Code: [`components/Upgrade.tsx`](components/Upgrade.tsx), [`lib/near/upgrade.ts`](lib/near/upgrade.ts).

### Watch

The canaries are the block rewards from Bitcoin blocks 1 to 61, mined in January 2009 (block 9's was spent long ago). They hold 3,000 BTC. They were paid to bare public keys and have never moved. [`scripts/find-canaries.mjs`](scripts/find-canaries.mjs) rebuilds the list.

How it decides:

1. **One moves in a day:** watch closely.
2. **Three move in a day:** alarm, and ask NEAR AI Cloud. A "yes" with at least 70% confidence releases.
3. **Eight move in a day:** release, whatever the judgement says.

Code: [`lib/watchman`](lib/watchman), [`components/Watch.tsx`](components/Watch.tsx).

### The vault

| Request | What the vault does inside the enclave |
| --- | --- |
| `pubkey` | Makes an X25519 key from enclave randomness on first use, stores the secret half in OutLayer's encrypted storage, and returns the public half. |
| `seal` | Opens an escape encrypted to that key: X25519, then HKDF-SHA256, then ChaCha20-Poly1305 (mirrored in [`lib/vault/seal.ts`](lib/vault/seal.ts)). It checks the escape and stores it. A tampered blob is refused. |
| `status` | Counts only. |
| `release` | Checks the 60 canaries from mempool.space. Only at eight or more recent moves does it broadcast every sealed escape for that network, through mempool.space or `eth_sendRawTransaction`. |

Whoever calls `release` can only ask; the vault answers by its rule. Code: [`vault/src`](vault/src), with the rules unit-tested natively (`cd vault && cargo test`).

## Status

Anything not listed as built is not claimed.

| Part | State |
| --- | --- |
| Scan: exposure check for Bitcoin, Ethereum, BNB Chain, NEAR | Built and tested. Checked live in the `Site end-to-end` workflow |
| Seal, Bitcoin: build, sign in your own wallet, check | Built and tested with real signatures |
| Seal, Ethereum and BNB Chain, with USDC and USDT | Built and tested with real signatures |
| Vault in an OutLayer enclave: key, seal, status, release by rule | Built. Deployed and self-tested on OutLayer testnet |
| Sealing into the vault from the website | Built. Run end to end on testnet |
| Upgrade NEAR: ML-DSA-65 key added and used on chain | Done on testnet ([proof above](#proof-on-chain-near-testnet)) |
| Upgrade NEAR screen: live key check, CLI commands, on-chain confirmation | Built. Checked live against the testnet account |
| Watchman: 60 canaries, rules, NEAR AI Cloud second opinion, labelled simulated attack | Built and tested. Checked live against mainnet |
| A full simulated attack on testnet, in which canary coins we control move and the vault broadcasts a real testnet escape | Not built yet |

## Limits

- **The vault is on testnet.** It accepts testnet escapes only. Real-coin escapes can be prepared and checked, then downloaded, but not sealed.
- **Project upgrades:** the vault's key lives in project storage, so a later version deployed by the project's owner could read sealed escapes. That would still only let it release early, never redirect coins. Pinning the key to one build is the next step.
- **The vault releases on the rule of eight alone.** The NEAR AI judgement runs in the watchman, not yet inside the enclave.
- **An escape is a race.** If an attacker has already derived a key, they can try to outbid the escape once it is broadcast. Escapes carry high fee caps, and the watchman fires on the oldest coins moving, before yours do.
- **Escapes go stale.** They cover the coins that were there when they were signed. Coins arriving later, or the wallet sending anything else, mean a new escape is needed. The screen says so.
- **The Upgrade NEAR screen uses the NEAR CLI.** No browser wallet was confirmed to add ML-DSA-65 keys yet. HOT Wallet login is not built. See [`docs/spikes.md`](docs/spikes.md).
- **The scanner can't see bare-public-key (P2PK) Bitcoin outputs** under their derived address. A 2009-style P2PK holding can show "Safe for now".
- **Address types:** Taproot escapes build but are untested with a real Taproot wallet. Multisig and Solana are not supported.

## Run it yourself

| Variable | Needed for |
| --- | --- |
| none | Scan, Seal (prepare and check), Upgrade NEAR, Watch |
| `NEAR_TESTNET_SEED` | Sealing into the vault from the site. Use the same value as the repository secret. It derives the testnet account that pays for vault runs. |
| `NEARAI_API_KEY` (optional) | The watchman's NEAR AI Cloud judgement on an alarm. `NEARAI_MODEL` is also optional. |

The product name lives only in [`lib/brand.ts`](lib/brand.ts).

## Repo map

| Path | What |
| --- | --- |
| [`app/`](app) | Next.js pages and API routes: `/scan`, `/seal`, `/upgrade`, `/watch`; `api/scan`, `api/rescue/{btc,evm}`, `api/vault/seal`, `api/near/keys`, `api/watch/status` |
| [`components/`](components) | Screens: Scanner, Sealer, EvmEscape, VaultSeal, Upgrade, Watch, Steps |
| [`lib/`](lib) | Address parsing, exposure verdicts, Bitcoin and EVM escapes, watchman rules and judgement, vault encryption and calls, NEAR upgrade |
| [`vault/`](vault) | The OutLayer enclave program (Rust) |
| [`data/`](data) | Canary lists |
| [`scripts/`](scripts) | NEAR testnet upgrade, vault deploy, call and self-test, canary finder, ML-DSA spike |
| [`docs/spikes.md`](docs/spikes.md) | What was tested, and what was learned about ML-DSA keys, OutLayer and HOT Wallet |

## Safety

- Nothing in this repo holds users' keys or signs on their behalf.
- Every on-chain action shown here ran on NEAR testnet, from a testnet account derived from a repository secret.
- The attack on the Watch screen is labelled as simulated.

## License

MIT. See [LICENSE](LICENSE).
