// Encrypt an escape to the vault's public key, in the owner's browser. Mirrors vault/src/seal.rs:
//   shared = X25519(ephemeral secret, vault public)
//   key    = HKDF-SHA256(ikm = shared, salt = ephemeral public || vault public, info = "lifeboat-vault-v1")
//   blob   = ephemeral public (32) || nonce (12) || ChaCha20-Poly1305(key, nonce, escape JSON, aad = "lifeboat-escape")
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { base64 } from "@scure/base";

const INFO = new TextEncoder().encode("lifeboat-vault-v1");
const AAD = new TextEncoder().encode("lifeboat-escape");

export interface EscapeForVault {
  id: string;
  chain: "bitcoin" | "ethereum" | "bsc";
  network: "mainnet" | "testnet";
  txs: string[];
}

export function sealFor(vaultPublicB64: string, escape: EscapeForVault, eph = randomBytes(32), nonce = randomBytes(12)): string {
  const vaultPub = base64.decode(vaultPublicB64);
  if (vaultPub.length !== 32) throw new Error("The vault's public key is not valid.");
  const ephPub = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, vaultPub);
  const salt = new Uint8Array([...ephPub, ...vaultPub]);
  const key = hkdf(sha256, shared, salt, INFO, 32);
  const ct = chacha20poly1305(key, nonce, AAD).encrypt(new TextEncoder().encode(JSON.stringify(escape)));
  return base64.encode(new Uint8Array([...ephPub, ...nonce, ...ct]));
}
