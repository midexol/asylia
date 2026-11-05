# Spikes, 4 November 2026

Asylia depends on three things working that nobody has stitched together before. This file records what was checked, what was learned, and what is still open. Nothing here touched mainnet or spent tokens.

## 1. ML-DSA-65 keys on NEAR (FastNEAR)

**Question:** can we make a quantum-safe key and add it to an existing NEAR account?

**Checked locally** with `@fastnear/ml-dsa-65` 2.5.0 (`node scripts/spike-mldsa.mjs`):

| Check | Result |
| --- | --- |
| Protocol version needed | 85 |
| Public key | 1,952 bytes, written `ml-dsa-65:<base58>` for AddKey |
| On-chain form | a compact `ml-dsa-65-hash:<base58>` handle, which is what access-key lists return |
| Signature over a 32-byte transaction hash | 3,309 bytes, verifies |
| Tampered hash | rejected |

**From the FastNEAR docs** ([js.fastnear.com/post-quantum](https://js.fastnear.com/post-quantum)):

- The AddKey is signed by the account's existing classic key, with `actions.addFullAccessKey({ publicKey })` and the full `ml-dsa-65:` key, not the hash handle.
- Each ML-DSA signature costs 100 Ggas to verify, so Asylia uses the new key only for plan changes.
- To compare a key with what `view_access_key_list` returns, convert it with `publicKeyToHandle()`.
- Mainnet went live with network upgrade 2.13 on 20 July 2026 ([NEAR announcement, via Webull](https://www.webull.com/news/15259913496765440)).

**Run on testnet, 4 November**, by the `NEAR testnet upgrade` workflow ([`scripts/near-upgrade.mjs`](../scripts/near-upgrade.mjs)):

- **Account:** [`lifeboat-f86cd6e7d4.testnet`](https://testnet.nearblocks.io/address/lifeboat-f86cd6e7d4.testnet), created and funded from the testnet faucet. Testnet was on protocol 88.
- **AddKey:** signed by the Ed25519 key. The account now lists an `ml-dsa-65-hash:…` key beside its `ed25519:…` key.
- **Signing with the new key:** a transaction signed with the ML-DSA-65 key itself went through: [DVAmKNmf…YZgL2o](https://testnet.nearblocks.io/txns/DVAmKNmf8qmjGJ4fQAnyMGc4AVgjxZTbZPVbwCYZgL2o).

**Verdict:** proven on testnet. The upgrade step is low risk.

## 2. Sealed rescue in OutLayer

**Question:** can OutLayer hold a signed rescue transaction where nobody can read it, and give it up only when the watchman calls?

**From the OutLayer docs** ([secrets](https://app.outlayer.ai/docs/secrets), [NEAR integration](https://app.outlayer.ai/docs/near-integration)):

- Secrets are encrypted in the browser (X25519 + ChaCha20-Poly1305) and stored on chain as ciphertext. They are decrypted only inside attested TEE workers and handed to the WASM as environment variables.
- Every use is gated by an access condition: whitelist, account pattern, balance, time limit or WASM hash, combined with AND, OR and NOT. **Direct calls only** checks the calling account.
- A NEAR contract triggers a run with `request_execution` on `outlayer.testnet` / `outlayer.near` and gets the WASM's stdout back in a callback. Runs last up to 180 s.
- Storing a secret costs about 0.1 NEAR, which is refunded on delete.

**What this means for Asylia:** OutLayer has no "release when X happens" switch of its own, and we don't need one. The design becomes:

1. The owner seals each signed rescue as a secret whose condition is *Whitelist[registry contract] AND Direct calls only AND one build only*.
2. Only the registry contract can call `request_execution` with that secret. It does so only when the watchman, on its narrow release key, reports an attack.
3. The WASM prints the signed transaction, the callback records it, and the watchman broadcasts it.

The rescue is signed before it is sealed, so whoever releases it cannot change where the coins go.

**Risks found:**

- The secret reaches the WASM in plain form. The WASM must be tiny and pinned by hash, so it cannot be swapped for one that leaks.
- The docs don't mention testnet support for secrets. This needs checking on testnet before 10 November.

**Verdict, updated the same day: proven, with a better design than the one above.** OutLayer runs Asylia's own Rust program (`wasm32-wasip2`) inside the enclave. That program has encrypted storage, outbound HTTP and enclave randomness, so:

- **Keys:** the vault makes its own X25519 key inside the enclave, and owners encrypt escapes to it in the browser. No OutLayer secrets UI is involved.
- **Release:** the release rule runs inside the enclave. The vault checks the canaries itself and broadcasts escapes itself, so no registry contract has to be the gatekeeper.

Deployed as `lifeboat-f86cd6e7d4.testnet/lifeboat-vault` and self-tested on testnet: key, seal, status, a refused release, and a refused tampered seal. See the README's "The vault" section.

## 3. HOT Wallet and ML-DSA

**Question:** can HOT Wallet sign the AddKey for an ML-DSA key, or sign with one?

**Found:**

- No public source says HOT Wallet supports ML-DSA keys.
- NEAR's roadmap names Meteor Wallet as live, with Ledger and others "soon" ([roadmap summary](https://youmind.com/de-DE/landing/x-viral-articles/near-post-quantum-security-roadmap)).
- Adding the key needs only the classic key's signature, so any NEAR wallet, HOT included, should be able to sign the AddKey if it can sign a generic AddKey action. **Using** the ML-DSA key afterwards needs a wallet that holds ML-DSA keys.

**Verdict:**

- **Login:** HOT for login and the AddKey.
- **Upgrade:** the new ML-DSA key is created in the browser with FastNEAR's library and shown once for the owner to save. Meteor is an alternative to name in the README.
- **Still to confirm:** that HOT's connector signs an AddKey with a non-Ed25519 key, once a testnet account exists.

## Also confirmed

- The roadmap says NEAR's MPC network (Chain Signatures) has no post-quantum timeline yet. That is why Asylia never moves coins through it.
