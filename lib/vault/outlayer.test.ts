import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escapeId, VAULT } from "./config";
import { readOutcome, vaultAccount, VaultUnavailable } from "./outlayer";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("vaultAccount", () => {
  it("refuses to run without the seed", () => {
    expect(() => vaultAccount({})).toThrow(VaultUnavailable);
  });

  it("derives the same account as the testnet scripts", () => {
    const seed = "x".repeat(30);
    // scripts/near-upgrade.mjs for this seed gives lifeboat-e9d36f326d.testnet (checked when it was written).
    expect(vaultAccount({ NEAR_TESTNET_SEED: seed }).accountId).toBe("lifeboat-e9d36f326d.testnet");
    expect(createHash("sha256").update("a").digest("hex")).toHaveLength(64);
  });
});

describe("readOutcome", () => {
  it("reads the vault's JSON from the last receipt, unwrapping OutLayer's envelope", () => {
    const rpc = {
      result: {
        transaction: { hash: "H1" },
        status: { SuccessValue: "" },
        receipts_outcome: [
          { outcome: { status: { SuccessValue: b64("null") } } },
          { outcome: { status: { SuccessValue: b64(JSON.stringify({ success: true, output: { ok: true, sealed: "abc", count: 2 } })) } } },
        ],
      },
    };
    expect(readOutcome(rpc)).toEqual({ hash: "H1", answer: { ok: true, sealed: "abc", count: 2 }, failure: null });
  });

  it("reports a failed receipt", () => {
    const out = readOutcome({ transaction: { hash: "H2" }, receipts_outcome: [{ outcome: { status: { Failure: { ActionError: { kind: "x" } } } } }] });
    expect(out.failure).toContain("ActionError");
    expect(out.answer).toBeNull();
  });
});

describe("escapeId", () => {
  it("keeps only what the vault accepts", () => {
    expect(escapeId("0xABCdef")).toBe("ABCdef");
    expect(escapeId("a".repeat(100))).toHaveLength(80);
    expect(VAULT.project).toMatch(/\/lifeboat-vault$/);
  });
});
