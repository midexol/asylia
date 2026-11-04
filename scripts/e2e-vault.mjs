// End-to-end check of the website's sealing route against the live testnet vault: encrypt a
// harmless test escape exactly as the browser does, POST it to /api/vault/seal, print the answer.
//   node scripts/e2e-vault.mjs http://localhost:3000
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { base64 } from "@scure/base";
import { appendFileSync, readFileSync } from "node:fs";

const site = process.argv[2] ?? "http://localhost:3000";
const pubkey = readFileSync("lib/vault/config.ts", "utf8").match(/pubkey: "([^"]+)"/)[1];
const escape = { id: `e2e-${Date.now()}`, chain: "bitcoin", network: "testnet", txs: ["00".repeat(60)] };

const vaultPub = base64.decode(pubkey);
const eph = randomBytes(32);
const nonce = randomBytes(12);
const ephPub = x25519.getPublicKey(eph);
const key = hkdf(sha256, x25519.getSharedSecret(eph, vaultPub), new Uint8Array([...ephPub, ...vaultPub]), new TextEncoder().encode("lifeboat-vault-v1"), 32);
const ct = chacha20poly1305(key, nonce, new TextEncoder().encode("lifeboat-escape")).encrypt(new TextEncoder().encode(JSON.stringify(escape)));
const sealed = base64.encode(new Uint8Array([...ephPub, ...nonce, ...ct]));

const res = await fetch(`${site}/api/vault/seal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sealed }) });
const body = await res.json();
const line = `- Site sealed test escape \`${escape.id}\` through /api/vault/seal: HTTP ${res.status} ${JSON.stringify(body)}`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n");
process.exit(res.ok && body.sealed === escape.id ? 0 : 1);
