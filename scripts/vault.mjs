// Deploy and call Lifeboat's vault on OutLayer testnet, as the Lifeboat testnet account.
//   node scripts/vault.mjs deploy <wasm url> <sha256>   register the project, or add a new active version
//   node scripts/vault.mjs call '<json input>'           run the vault once through request_execution
// Testnet only. Uses the account derived from NEAR_TESTNET_SEED (see testnet-account.mjs).
import { appendFileSync } from "node:fs";
import * as near from "@fastnear/api";
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { base64 } from "@scure/base";
import { testnetAccount } from "./testnet-account.mjs";

/** Same scheme as lib/vault/seal.ts and vault/src/seal.rs. */
function sealFor(vaultPublicB64, escape) {
  const vaultPub = base64.decode(vaultPublicB64);
  const eph = randomBytes(32);
  const nonce = randomBytes(12);
  const ephPub = x25519.getPublicKey(eph);
  const key = hkdf(sha256, x25519.getSharedSecret(eph, vaultPub), new Uint8Array([...ephPub, ...vaultPub]), new TextEncoder().encode("lifeboat-vault-v1"), 32);
  const ct = chacha20poly1305(key, nonce, new TextEncoder().encode("lifeboat-escape")).encrypt(new TextEncoder().encode(JSON.stringify(escape)));
  return base64.encode(new Uint8Array([...ephPub, ...nonce, ...ct]));
}

const NETWORK = "testnet";
const OUTLAYER = "outlayer.testnet";
const NAME = "lifeboat-vault";
const TGAS = (n) => (BigInt(n) * 10n ** 12n).toString();
const NEAR = (n) => (BigInt(Math.round(n * 1000)) * 10n ** 21n).toString();
const LIMITS = { max_instructions: 50_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 };

const log = (line) => {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
};
const unwrap = (r) => r?.result ?? r;
const txHash = (r) => unwrap(r)?.transaction?.hash ?? unwrap(r)?.transaction_outcome?.id ?? "unknown";
const decodeView = (r) => {
  const v = unwrap(r);
  if (Array.isArray(v?.result)) return JSON.parse(Buffer.from(v.result).toString() || "null");
  return v;
};

near.config({ networkId: NETWORK });
const { accountId, signer } = testnetAccount();
const projectId = `${accountId}/${NAME}`;

async function call(methodName, args, deposit, gas = TGAS(300)) {
  return near.sendTx({
    receiverId: OUTLAYER,
    actions: [near.actions.functionCall({ methodName, args, gas, deposit })],
    signer,
    signerId: accountId,
    waitUntil: "FINAL",
    network: NETWORK,
  });
}

/** The value the vault printed: the last SuccessValue in the transaction's receipts. */
function output(result) {
  const r = unwrap(result);
  const outcomes = [r?.status, ...(r?.receipts_outcome ?? []).map((o) => o?.outcome?.status)];
  const failures = outcomes.filter((s) => s?.Failure).map((s) => JSON.stringify(s.Failure).slice(0, 300));
  const values = outcomes.map((s) => s?.SuccessValue).filter((v) => v);
  const decoded = values.map((v) => Buffer.from(v, "base64").toString()).filter((t) => t && t !== "null");
  return { failures, value: decoded.at(-1) ?? null, logs: (r?.receipts_outcome ?? []).flatMap((o) => o?.outcome?.logs ?? []) };
}

/** Run the vault once and return its parsed JSON answer. */
async function run(input) {
  const est = decodeView(
    await near.view({ contractId: OUTLAYER, methodName: "estimate_execution_cost", args: { resource_limits: LIMITS, input_len: input.length }, network: NETWORK }),
  );
  const deposit = ((BigInt(String(est ?? NEAR(0.05))) * 15n) / 10n).toString();
  const r = await call(
    "request_execution",
    { source: { Project: { project_id: projectId, version_key: null } }, resource_limits: LIMITS, input_data: input, response_format: "Json" },
    deposit,
  );
  const o = output(r);
  log(`- \`${input.slice(0, 48)}${input.length > 48 ? "…" : ""}\` → \`${o.value ?? "(nothing)"}\` ([tx](https://testnet.nearblocks.io/txns/${txHash(r)}))`);
  if (o.failures.length) log(`  - Failure: ${o.failures.join("; ")}`);
  const parsed = o.value ? JSON.parse(o.value) : null;
  return parsed?.output ?? parsed;
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "deploy") {
    if (!a || !/^[0-9a-f]{64}$/.test(b ?? "")) throw new Error("usage: deploy <wasm url> <sha256 hex>");
    const source = { WasmUrl: { url: a, hash: b, build_target: "wasm32-wasip2" } };
    const existing = decodeView(await near.view({ contractId: OUTLAYER, methodName: "get_project", args: { project_id: projectId }, network: NETWORK }));
    const r = existing
      ? await call("add_version", { project_name: NAME, source, set_active: true }, NEAR(0.1))
      : await call("create_project", { name: NAME, source }, NEAR(0.1));
    const o = output(r);
    if (o.failures.length) throw new Error(o.failures.join("; "));
    log(`- ${existing ? "Added a new active version to" : "Registered"} \`${projectId}\` on OutLayer testnet: [${txHash(r)}](https://testnet.nearblocks.io/txns/${txHash(r)})`);
    log(`- Code: ${a} (sha256 \`${b.slice(0, 16)}…\`)`);
  } else if (cmd === "call") {
    const input = a ?? '{"op":"status"}';
    JSON.parse(input);
    const est = decodeView(
      await near.view({ contractId: OUTLAYER, methodName: "estimate_execution_cost", args: { resource_limits: LIMITS, input_len: input.length }, network: NETWORK }),
    );
    const deposit = ((BigInt(String(est ?? NEAR(0.05))) * 15n) / 10n).toString();
    const r = await call(
      "request_execution",
      { source: { Project: { project_id: projectId, version_key: null } }, resource_limits: LIMITS, input_data: input, response_format: "Json" },
      deposit,
    );
    const o = output(r);
    log(`- Called the vault with \`${input.slice(0, 60)}\`: [${txHash(r)}](https://testnet.nearblocks.io/txns/${txHash(r)})`);
    if (o.failures.length) log(`- Failure: ${o.failures.join("; ")}`);
    log(`- Vault answered: \`${o.value ?? "(nothing)"}\``);
    if (!o.value) log(`- Logs: ${o.logs.slice(-5).join(" | ").slice(0, 600)}`);
  } else if (cmd === "selftest") {
    // Seal a harmless test escape (testnet, a transaction that cannot be valid) and walk every op.
    log(`### Vault self-test on OutLayer testnet`);
    const pk = await run('{"op":"pubkey"}');
    const pubkey = pk?.pubkey;
    if (!pubkey) throw new Error("the vault did not return its public key");
    const escape = { id: `selftest-${Date.now()}`, chain: "bitcoin", network: "testnet", txs: ["00".repeat(60)] };
    await run(JSON.stringify({ op: "seal", sealed: sealFor(pubkey, escape) }));
    await run('{"op":"status"}');
    await run('{"op":"release","network":"mainnet"}');
    const tampered = sealFor(pubkey, escape).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    await run(JSON.stringify({ op: "seal", sealed: tampered }));
  } else {
    throw new Error("usage: vault.mjs deploy <url> <sha256> | call '<json>' | selftest");
  }
} catch (e) {
  log(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
