import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { networks, payments, Psbt } from "bitcoinjs-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as check } from "./check/route";
import { POST as prepare } from "./prepare/route";

const net = networks.testnet;
const ECPair = ECPairFactory(ecc);
const owner = ECPair.fromPrivateKey(Buffer.alloc(32, 7), { network: net });
const FROM = payments.p2wpkh({ pubkey: Buffer.from(owner.publicKey), network: net }).address!;
const SAFE = payments.p2wpkh({ pubkey: Buffer.from(ECPair.fromPrivateKey(Buffer.alloc(32, 8)).publicKey), network: net }).address!;

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

function mempool({ safeUsed = false } = {}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith(`/address/${FROM}/utxo`)) return json([{ txid: "ab".repeat(32), vout: 1, value: 250_000 }]);
    if (url.endsWith(`/address/${SAFE}`)) {
      const n = safeUsed ? 1 : 0;
      return json({ chain_stats: { funded_txo_count: n, spent_txo_count: 0 }, mempool_stats: { funded_txo_count: 0, spent_txo_count: 0 } });
    }
    if (url.endsWith("/v1/fees/recommended")) return json({ fastestFee: 2 });
    return new Response("", { status: 404 });
  });
}

describe("Bitcoin rescue routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prepares on testnet4, then accepts the owner's signed escape", async () => {
    const f = mempool();
    vi.stubGlobal("fetch", f);
    const res = await post(prepare, { from: FROM, to: SAFE, speed: "high" });
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.feeRate).toBe(20); // floor for "high"
    expect(f.mock.calls.some(([u]) => String(u).includes("/testnet4/api/"))).toBe(true);

    const p = Psbt.fromBase64(plan.psbt, { network: net });
    p.signAllInputs(owner);
    const out = await (await post(check, { plan, signed: p.toBase64() })).json();
    expect(out).toMatchObject({ ok: true, amount: plan.amount });
  });

  it("refuses a safe address that has been used", async () => {
    vi.stubGlobal("fetch", mempool({ safeUsed: true }));
    const res = await post(prepare, { from: FROM, to: SAFE });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/used before/);
  });

  it("says so plainly when the network can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const res = await post(prepare, { from: FROM, to: SAFE });
    expect(res.status).toBe(502);
  });

  it("asks for a Bitcoin address", async () => {
    const res = await post(prepare, { from: "alice.near", to: SAFE });
    expect(res.status).toBe(400);
  });
});
