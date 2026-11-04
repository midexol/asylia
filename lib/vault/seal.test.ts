import { writeFileSync } from "node:fs";
import { x25519 } from "@noble/curves/ed25519";
import { base64 } from "@scure/base";
import { describe, expect, it } from "vitest";
import { sealFor } from "./seal";

const VAULT_SECRET = new Uint8Array(32).fill(7);
const vaultPub = base64.encode(x25519.getPublicKey(VAULT_SECRET));

describe("sealFor", () => {
  it("is deterministic for fixed inputs and writes the fixture the Rust vault checks", () => {
    // Plaintext is exactly {"hello":"vault"} when the object is serialised; reuse the escape slot for the fixture.
    const blob = sealFor(vaultPub, { hello: "vault" } as never, new Uint8Array(32).fill(9), new Uint8Array(12).fill(1));
    expect(sealFor(vaultPub, { hello: "vault" } as never, new Uint8Array(32).fill(9), new Uint8Array(12).fill(1))).toBe(blob);
    writeFileSync(new URL("../../vault/tests/browser-sealed.txt", import.meta.url), blob + "\n");
  });

  it("uses fresh randomness each time by default", () => {
    const e = { id: "a", chain: "bitcoin" as const, network: "testnet" as const, txs: ["00"] };
    expect(sealFor(vaultPub, e)).not.toBe(sealFor(vaultPub, e));
  });

  it("refuses a malformed vault key", () => {
    expect(() => sealFor("AAAA", { id: "a", chain: "bitcoin", network: "testnet", txs: [] })).toThrow(/not valid/);
  });
});
