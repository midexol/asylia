import { describe, expect, it } from "vitest";
import { parseAddress } from "./address";
import { atRiskUsd, chainsFor, judge } from "./exposure";
import { scan, tidyEvm } from "./scan";
import { bitcoinUtxos, BITCOIN_FALLBACK, factsFor, TooManyCoinsError } from "./sources";

const P2PKH = parseAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
const TAPROOT = parseAddress("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0");
const EVM = parseAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
const NEAR = parseAddress("lifeboat.near");

describe("judge", () => {
  it("flags a Bitcoin address that has spent as exposed, with dollars at risk", () => {
    const r = judge(P2PKH, "bitcoin", { balance: 0.5, sentBefore: true }, 100_000);
    expect(r.verdict).toBe("exposed");
    expect(r.usd).toBe(50_000);
  });

  it("calls an unspent hashed address hidden", () => {
    expect(judge(P2PKH, "bitcoin", { balance: 1, sentBefore: false }).verdict).toBe("hidden");
  });

  it("treats Taproot as exposed even before it spends", () => {
    expect(judge(TAPROOT, "bitcoin", { balance: 1, sentBefore: false }).verdict).toBe("exposed");
  });

  it("says empty wallets have nothing to protect", () => {
    expect(judge(EVM, "ethereum", { balance: 0, sentBefore: true }).verdict).toBe("empty");
  });

  it("offers NEAR accounts the in-place upgrade unless they already have it", () => {
    expect(judge(NEAR, "near", { balance: 3, pqKey: false }).verdict).toBe("upgrade");
    expect(judge(NEAR, "near", { balance: 3, pqKey: true })).toMatchObject({ verdict: "hidden", headline: "Already upgraded" });
  });

  it("reports failed lookups as unknown, not safe", () => {
    expect(judge(EVM, "bsc", { error: "HTTP 500" }).verdict).toBe("unknown");
    expect(judge(P2PKH, "bitcoin", { balance: 1 }).verdict).toBe("unknown");
  });

  it("never prices testnet coins", () => {
    const tb = parseAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx");
    expect(judge(tb, "bitcoin", { balance: 1, sentBefore: true }, 100_000).usd).toBeUndefined();
  });

  it("checks a 0x address on both EVM chains", () => {
    expect(chainsFor(EVM)).toEqual(["ethereum", "bsc"]);
  });

  it("adds up only exposed dollars", () => {
    const a = judge(P2PKH, "bitcoin", { balance: 1, sentBefore: true }, 10);
    const b = judge(P2PKH, "bitcoin", { balance: 1, sentBefore: false }, 10);
    expect(atRiskUsd([a, b])).toBe(10);
  });
});

describe("tidyEvm", () => {
  const eth = (verdict: "empty" | "exposed") => judge(EVM, "ethereum", verdict === "empty" ? { balance: 0 } : { balance: 1, sentBefore: true });
  const bsc = (verdict: "empty" | "exposed") => judge(EVM, "bsc", verdict === "empty" ? { balance: 0 } : { balance: 1, sentBefore: true });

  it("drops the empty chain when the other holds coins", () => {
    expect(tidyEvm([eth("empty"), bsc("exposed")]).map((r) => r.chain)).toEqual(["bsc"]);
  });
  it("keeps one row when both are empty", () => {
    expect(tidyEvm([eth("empty"), bsc("empty")]).map((r) => r.chain)).toEqual(["ethereum"]);
  });
  it("keeps both when both hold coins", () => {
    expect(tidyEvm([eth("exposed"), bsc("exposed")])).toHaveLength(2);
  });
});

/** A fake network: answers by URL and JSON-RPC method. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const method = init?.body ? (JSON.parse(String(init.body)) as { method: string; params: { request_type?: string } }) : null;
    const key = method ? `${url}#${method.params?.request_type ?? method.method}` : url;
    const hit = Object.entries(routes).find(([k]) => key.startsWith(k));
    if (!hit) return new Response("not found", { status: 404 });
    const body = method ? { jsonrpc: "2.0", id: 1, result: hit[1] } : hit[1];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe("sources and scan, with the network faked", () => {
  const net = fakeFetch({
    "https://api.coingecko.com": { bitcoin: { usd: 100_000 }, ethereum: { usd: 4000 }, binancecoin: { usd: 900 }, near: { usd: 3 } },
    "https://mempool.space/api/address/1A1z": {
      chain_stats: { funded_txo_sum: 150_000_000, spent_txo_sum: 50_000_000, spent_txo_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0 },
    },
    "https://ethereum-rpc.publicnode.com#eth_getTransactionCount": "0x3",
    "https://ethereum-rpc.publicnode.com#eth_getBalance": "0xde0b6b3a7640000", // 1 ETH
    "https://bsc-rpc.publicnode.com#eth_getTransactionCount": "0x0",
    "https://bsc-rpc.publicnode.com#eth_getBalance": "0x0",
    "https://rpc.mainnet.near.org#view_account": { amount: "5000000000000000000000000" },
    "https://rpc.mainnet.near.org#view_access_key_list": { keys: [{ public_key: "ed25519:abc" }] },
  });

  it("reads Bitcoin balance and spending from mempool.space", async () => {
    expect(await factsFor(P2PKH, "bitcoin", net)).toEqual({ balance: 1, sentBefore: true });
  });

  it("reads NEAR balance in NEAR, not yocto", async () => {
    expect(await factsFor(NEAR, "near", net)).toEqual({ balance: 5, pqKey: false });
  });

  it("turns a failed lookup into an error fact", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    expect((await factsFor(EVM, "ethereum", down)).error).toBe("HTTP 503");
  });

  it("scans a mixed paste end to end", async () => {
    const out = await scan("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa\n0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\nlifeboat.near\nnonsense", net);
    expect(out.map((r) => [r.chain, r.verdict])).toEqual([
      ["bitcoin", "exposed"],
      ["ethereum", "exposed"], // empty on BNB Chain, so that row is dropped
      ["near", "upgrade"],
      [null, "invalid"],
    ]);
    expect(atRiskUsd(out)).toBe(100_000 + 4000);
  });
});

describe("Bitcoin lookups when mempool.space refuses", () => {
  const ADDR = { chain_stats: { funded_txo_sum: 5e8, spent_txo_sum: 1e8, spent_txo_count: 1 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, spent_txo_count: 0 } };

  it("retries a rate-limited mainnet read on Blockstream", async () => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      seen.push(url);
      return url.startsWith(BITCOIN_FALLBACK) ? new Response(JSON.stringify(ADDR)) : new Response("slow down", { status: 429 });
    }) as unknown as typeof fetch;
    const facts = await factsFor(P2PKH, "bitcoin", f);
    expect(facts).toMatchObject({ balance: 4, sentBefore: true });
    expect(seen).toHaveLength(2);
  });

  it("says plainly when an address has too many coins to list", async () => {
    const f = (async () => new Response("Too many unspent transaction outputs (>500).", { status: 400 })) as unknown as typeof fetch;
    if (P2PKH.chain !== "bitcoin") throw new Error("fixture");
    await expect(bitcoinUtxos(P2PKH, f)).rejects.toBeInstanceOf(TooManyCoinsError);
  });
});

