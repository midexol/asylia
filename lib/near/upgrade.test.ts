import { describe, expect, it } from "vitest";
import { cliCommands, upgradeState } from "./upgrade";

const classic = { publicKey: "ed25519:abc", kind: "classic" as const, fullAccess: true };
const pq = { publicKey: "ml-dsa-65-hash:xyz", kind: "quantum-safe" as const, fullAccess: true };
const fc = { publicKey: "ed25519:fc", kind: "classic" as const, fullAccess: false };

describe("upgradeState", () => {
  it("reads the account's keys", () => {
    expect(upgradeState([classic])).toBe("needs-upgrade");
    expect(upgradeState([classic, pq])).toBe("upgraded");
    expect(upgradeState([pq, fc])).toBe("upgraded-only");
    expect(upgradeState([fc])).toBe("no-full-access");
  });
});

describe("cliCommands", () => {
  it("generates the key on the owner's machine, for the right network", () => {
    const c = cliCommands("alice.testnet", "testnet");
    expect(c.addKey).toBe(
      "near account add-key alice.testnet grant-full-access autogenerate-new-keypair --signature-scheme ml-dsa-65 save-to-keychain network-config testnet sign-with-keychain send",
    );
    expect(cliCommands("bob.near", "mainnet").signIn).toContain("network-config mainnet");
  });
});
