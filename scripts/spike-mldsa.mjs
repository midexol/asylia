// Spike: make an ML-DSA-65 key locally, sign a transaction-sized hash, verify it,
// and check the sizes NEAR expects. Nothing touches a network.
// Adding the key to a testnet account needs a funded testnet account: see docs/spikes.md.
import { createHash, randomBytes } from "node:crypto";
import * as pq from "@fastnear/ml-dsa-65";

const signer = pq.generateSigner();
try {
  const hash = createHash("sha256").update(randomBytes(64)).digest();
  const signature = signer.signHash(hash);
  const ok = pq.verifyHash({ hash, signature, publicKey: signer.publicKey });

  console.log("protocol version needed:", pq.ML_DSA_65_PROTOCOL_VERSION);
  console.log("public key bytes:", pq.decodePublicKey(signer.publicKey).length);
  console.log("signature bytes:", signature.length);
  console.log("AddKey form:", signer.publicKey.slice(0, 20) + "...");
  console.log("on-chain handle:", signer.publicKeyHandle.slice(0, 25) + "...");
  console.log("signature verifies:", ok);
  const tampered = Uint8Array.from(hash);
  tampered[0] ^= 1;
  console.log("tampered hash rejected:", !pq.verifyHash({ hash: tampered, signature, publicKey: signer.publicKey }));
} finally {
  signer.destroy();
}
