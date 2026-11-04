// Every network call the scanner makes lives here, behind a `fetch` that tests can replace.
// Read-only public endpoints: no keys, no signing, nothing sent anywhere.
import type { Parsed } from "./address";
import type { Chain, Facts } from "./exposure";

type Fetch = typeof fetch;

export const ENDPOINTS = {
  bitcoin: { mainnet: "https://mempool.space/api", testnet: "https://mempool.space/testnet4/api" },
  ethereum: "https://ethereum-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  near: { mainnet: "https://rpc.mainnet.near.org", testnet: "https://rpc.testnet.near.org" },
  prices: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,near&vs_currencies=usd",
};

const TIMEOUT_MS = 8000;

async function getJson(f: Fetch, url: string, init?: RequestInit): Promise<unknown> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function rpc(f: Fetch, url: string, method: string, params: unknown): Promise<unknown> {
  const body = (await getJson(f, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result;
}

interface MempoolAddress {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number; spent_txo_count: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; spent_txo_count: number };
}

export async function bitcoinFacts(p: Extract<Parsed, { chain: "bitcoin" }>, f: Fetch = fetch): Promise<Facts> {
  const a = (await getJson(f, `${ENDPOINTS.bitcoin[p.network]}/address/${p.address}`)) as MempoolAddress;
  const c = a.chain_stats;
  const m = a.mempool_stats;
  return {
    balance: (c.funded_txo_sum - c.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum) / 1e8,
    sentBefore: c.spent_txo_count + m.spent_txo_count > 0,
  };
}

export async function evmFacts(address: string, chain: "ethereum" | "bsc", f: Fetch = fetch): Promise<Facts> {
  const url = ENDPOINTS[chain];
  const [nonce, wei] = await Promise.all([
    rpc(f, url, "eth_getTransactionCount", [address, "latest"]),
    rpc(f, url, "eth_getBalance", [address, "latest"]),
  ]);
  return { sentBefore: BigInt(nonce as string) > 0n, balance: Number(BigInt(wei as string)) / 1e18 };
}

export async function nearFacts(p: Extract<Parsed, { chain: "near" }>, f: Fetch = fetch): Promise<Facts> {
  const url = ENDPOINTS.near[p.network];
  const [account, keys] = await Promise.all([
    rpc(f, url, "query", { request_type: "view_account", finality: "final", account_id: p.address }),
    rpc(f, url, "query", { request_type: "view_access_key_list", finality: "final", account_id: p.address }),
  ]);
  const amount = (account as { amount: string }).amount;
  const list = (keys as { keys: { public_key: string }[] }).keys;
  return {
    balance: Number(BigInt(amount) / 10n ** 18n) / 1e6,
    pqKey: list.some((k) => k.public_key.startsWith("ml-dsa-65")),
  };
}

export async function prices(f: Fetch = fetch): Promise<Partial<Record<Chain, number>>> {
  const p = (await getJson(f, ENDPOINTS.prices)) as Record<string, { usd: number }>;
  return { bitcoin: p.bitcoin?.usd, ethereum: p.ethereum?.usd, bsc: p.binancecoin?.usd, near: p.near?.usd };
}

export async function factsFor(parsed: Parsed, chain: Chain, f: Fetch = fetch): Promise<Facts> {
  try {
    if (parsed.chain === "bitcoin") return await bitcoinFacts(parsed, f);
    if (parsed.chain === "evm" && (chain === "ethereum" || chain === "bsc")) return await evmFacts(parsed.address, chain, f);
    if (parsed.chain === "near") return await nearFacts(parsed, f);
    return { error: "unsupported" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "lookup failed" };
  }
}
