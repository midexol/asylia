// The Asylia testnet account, derived from the NEAR_TESTNET_SEED secret exactly as
// scripts/near-upgrade.mjs derives it, so every workflow uses the same account and key.
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { signerFromPrivateKey } from "@fastnear/utils";

const sha256 = (s) => createHash("sha256").update(s).digest();

export function testnetAccount(env = process.env) {
  const seed = env.NEAR_TESTNET_SEED?.trim();
  if (!seed || seed.length < 20) throw new Error("Add the NEAR_TESTNET_SEED secret (20+ characters of random text) first.");
  let accountId = env.NEAR_TESTNET_ACCOUNT?.trim();
  let key = env.NEAR_TESTNET_PRIVATE_KEY?.trim();
  if (!accountId || !key) {
    const priv = sha256(`lifeboat:near-testnet:ed25519:${seed}`);
    const pub = ed25519.getPublicKey(priv);
    key = `ed25519:${base58.encode(new Uint8Array([...priv, ...pub]))}`;
    accountId = `lifeboat-${sha256(pub).toString("hex").slice(0, 10)}.testnet`;
  }
  if (!accountId.endsWith(".testnet")) throw new Error(`Refusing: ${accountId} is not a testnet account.`);
  return { accountId, signer: signerFromPrivateKey(key) };
}
