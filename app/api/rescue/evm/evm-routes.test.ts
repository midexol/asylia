import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTransaction, type TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POST as check } from "./check/route";
import { POST as prepare } from "./prepare/route";

const owner = privateKeyToAccount(`0x${"44".repeat(32)}`);
const SAFE = privateKeyToAccount(`0x${"55".repeat(32)}`).address;
const post = (h: (r: Request) => Promise<Response>, body: unknown) => h(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));

/** Fake JSON-RPC: the owner has sent 3 transactions, holds 0.5 ETH and 12 USDT; the safe address is fresh. */
function rpc({ safeSent = false } = {}) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const { method, params } = JSON.parse(String(init.body));
    const who = String(params?.[0]?.to ?? params?.[0] ?? "").toLowerCase();
    let result: string;
    if (method === "eth_getTransactionCount") result = who === SAFE.toLowerCase() ? (safeSent ? "0x1" : "0x0") : "0x3";
    else if (method === "eth_getBalance") result = "0x6f05b59d3b20000"; // 0.5 ETH
    else if (method === "eth_gasPrice") result = "0x77359400"; // 2 gwei
    else if (method === "eth_call") result = who === "0xdac17f958d2ee523a2206206994597c13d831ec7" ? "0x" + (12_000_000).toString(16).padStart(64, "0") : "0x" + "0".repeat(64);
    else return new Response("", { status: 400 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result, _url: url }), { status: 200 });
  });
}

describe("EVM escape routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plans USDT then ETH on mainnet, and accepts the owner's offline signatures", async () => {
    vi.stubGlobal("fetch", rpc());
    const res = await post(prepare, { from: owner.address, to: SAFE, chain: "ethereum", network: "mainnet", speed: "high" });
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.txs.map((t: { symbol: string; nonce: number }) => [t.symbol, t.nonce])).toEqual([["USDT", 3], ["ETH", 4]]);

    const signed = await Promise.all(plan.txs.map((t: { unsigned: `0x${string}` }) => owner.signTransaction(parseTransaction(t.unsigned) as TransactionSerializable)));
    const out = await (await post(check, { plan, signed: signed.join("\n") })).json();
    expect(out.ok).toBe(true);
  });

  it("uses the testnet RPC and skips tokens on testnet", async () => {
    const f = rpc();
    vi.stubGlobal("fetch", f);
    const { plan } = await (await post(prepare, { from: owner.address, to: SAFE, chain: "bsc", network: "testnet" })).json();
    expect(plan.chainId).toBe(97);
    expect(plan.txs).toHaveLength(1);
    expect(f.mock.calls.every(([u]) => String(u).includes("bsc-testnet"))).toBe(true);
  });

  it("refuses a safe address that has already sent", async () => {
    vi.stubGlobal("fetch", rpc({ safeSent: true }));
    const res = await post(prepare, { from: owner.address, to: SAFE, chain: "ethereum" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sent transactions before/);
  });
});
