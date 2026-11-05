// The NEAR upgrade, end to end on testnet: an account with a classic Ed25519 key adds a
// quantum-safe ML-DSA-65 key, then proves the new key works by signing a transaction with it.
// Same account, same funds, nothing moved. Testnet only; refuses to touch mainnet.
//
// Run in GitHub Actions (needs the internet). Credentials come from repository secrets:
//   NEAR_TESTNET_SEED            any long random text: the script derives the account and both keys
//                                from it, creating and funding the account from NEAR's testnet faucet
// or
//   NEAR_TESTNET_ACCOUNT         an existing name.testnet account
//   NEAR_TESTNET_PRIVATE_KEY     its full-access key, "ed25519:..."
//   NEAR_TESTNET_SEED            still used to derive the ML-DSA key, so reruns reuse it
//
// Set RETIRE_CLASSIC=1 to also delete the Ed25519 key afterwards. Off by default: the account
// then answers only to the ML-DSA key, so the seed becomes the only way in.
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import * as near from "@fastnear/api";
import { signerFromPrivateKey } from "@fastnear/utils";
import { publicKeyToHandle, signerFromSeed, ML_DSA_65_PROTOCOL_VERSION } from "@fastnear/ml-dsa-65";

const NETWORK = "testnet";
const sha256 = (s) => createHash("sha256").update(s).digest();
const explorer = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
// FastNEAR returns raw JSON-RPC envelopes ({ result: ... }); unwrap either shape.
const unwrap = (r) => r?.result ?? r;
const txHash = (r) => unwrap(r)?.transaction?.hash ?? unwrap(r)?.transaction_outcome?.id ?? "unknown";
const keyList = async () => (unwrap(await near.queryAccessKeyList({ accountId, network: NETWORK }))?.keys ?? []).map((k) => k.public_key);
const summary = [];
const say = (line) => {
  console.log(line);
  summary.push(line);
};
const finish = (code) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
  process.exit(code);
};

const seed = process.env.NEAR_TESTNET_SEED?.trim();
if (!seed || seed.length < 20) {
  say("No `NEAR_TESTNET_SEED` secret yet (any random text, 20+ characters). Add it under Settings → Secrets and variables → Actions, then run this again.");
  finish(0);
}

near.config({ networkId: NETWORK });

// Classic key and account.
let accountId = process.env.NEAR_TESTNET_ACCOUNT?.trim();
let classicKey = process.env.NEAR_TESTNET_PRIVATE_KEY?.trim();
if (!accountId || !classicKey) {
  const priv = sha256(`lifeboat:near-testnet:ed25519:${seed}`);
  const pub = ed25519.getPublicKey(priv);
  classicKey = `ed25519:${base58.encode(new Uint8Array([...priv, ...pub]))}`;
  accountId = `lifeboat-${sha256(pub).toString("hex").slice(0, 10)}.testnet`;
}
if (!accountId.endsWith(".testnet") && !/^[0-9a-f]{64}$/.test(accountId)) {
  say(`Refusing to run: ${accountId} is not a testnet account.`);
  finish(1);
}
const classic = signerFromPrivateKey(classicKey);
const pq = signerFromSeed(sha256(`lifeboat:near-testnet:ml-dsa-65:${seed}`));

say(`## Asylia NEAR upgrade on testnet\n`);
say(`- Account: \`${accountId}\` ([explorer](https://testnet.nearblocks.io/address/${accountId}))`);

try {
  const version = unwrap(await near.queryProtocolVersion({ network: NETWORK }));
  say(`- Protocol version: ${version} (ML-DSA-65 needs ${ML_DSA_65_PROTOCOL_VERSION})`);
  if (Number(version) < ML_DSA_65_PROTOCOL_VERSION) throw new Error("Testnet does not support ML-DSA-65 keys yet.");

  let exists = true;
  try {
    await near.queryAccount({ accountId, network: NETWORK });
  } catch {
    exists = false;
  }
  if (!exists) {
    await near.createFundedTestnetAccount({ newAccountId: accountId, publicKey: classic.publicKey });
    say(`- Created the account and funded it from the testnet faucet`);
    await new Promise((r) => setTimeout(r, 5000));
  }

  const handle = publicKeyToHandle(pq.publicKey);
  const keysBefore = await keyList();
  say(`- Keys before: ${keysBefore.map((k) => `\`${k.slice(0, 24)}…\``).join(", ")}`);

  if (!keysBefore.includes(handle)) {
    const added = await near.sendTx({
      receiverId: accountId,
      actions: [near.actions.addFullAccessKey({ publicKey: pq.publicKey })],
      signer: classic,
      signerId: accountId,
      waitUntil: "FINAL",
      network: NETWORK,
    });
    const hash = txHash(added);
    say(`- Added the quantum-safe key, signed by the classic key: [${hash}](${explorer(hash)})`);
  } else {
    say(`- The quantum-safe key was already on the account`);
  }

  const proof = await near.sendTx({
    receiverId: accountId,
    actions: [near.actions.transfer("1")],
    signer: pq,
    signerId: accountId,
    waitUntil: "FINAL",
    network: NETWORK,
  });
  const proofHash = txHash(proof);
  say(`- Signed a transaction with the ML-DSA-65 key itself (3,309-byte signature): [${proofHash}](${explorer(proofHash)})`);

  if (process.env.RETIRE_CLASSIC === "1") {
    const retired = await near.sendTx({
      receiverId: accountId,
      actions: [near.actions.deleteKey({ publicKey: classic.publicKey })],
      signer: pq,
      signerId: accountId,
      waitUntil: "FINAL",
      network: NETWORK,
    });
    const h = txHash(retired);
    say(`- Retired the classic key, signed by the quantum-safe key: [${h}](${explorer(h)})`);
  }

  const keysAfter = await keyList();
  say(`- Keys after: ${keysAfter.map((k) => `\`${k.slice(0, 24)}…\``).join(", ")}`);
  if (!keysAfter.includes(handle)) throw new Error("The quantum-safe key is not on the account after all.");
  say(`\nDone: the same account, with the same funds, now answers to a quantum-safe key.`);
  finish(0);
} catch (e) {
  say(`\nFailed: ${e instanceof Error ? e.message : String(e)}`);
  finish(1);
} finally {
  pq.destroy();
}
