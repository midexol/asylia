// Every network call the scanner makes lives here, behind a `fetch` that tests can replace.
// Read-only public endpoints: no keys, no signing, nothing sent anywhere.
import type { Parsed } from "./address";
import type { Chain, Facts } from "./exposure";

type Fetch = typeof fetch;

export const ENDPOINTS = {
  bitcoin: { mainnet: "https://mempool.space/api", testnet: "https://mempool.space/testnet4/api" },
  ethereum: "https://ethereum-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  evmTestnet: { ethereum: "https://ethereum-sepolia-rpc.publicnode.com", bsc: "https://bsc-testnet-rpc.publicnode.com" },
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
  return { sentBefore: BigInt(nonce as string) > BigInt(0), balance: Number(BigInt(wei as string)) / 1e18 };
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
    balance: Number(BigInt(amount) / BigInt("1000000000000000000")) / 1e6,
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

// ---------- Bitcoin rescue lookups ----------

export interface BtcUtxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed: boolean };
}

/** Every unspent coin at an address, with the previous transaction for legacy addresses. */
export async function bitcoinUtxos(p: Extract<Parsed, { chain: "bitcoin" }>, f: Fetch = fetch) {
  const base = ENDPOINTS.bitcoin[p.network];
  const utxos = (await getJson(f, `${base}/address/${p.address}/utxo`)) as BtcUtxo[];
  const legacy = p.kind === "p2pkh" || p.kind === "p2sh";
  return Promise.all(
    utxos.map(async (u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      ...(legacy ? { prevTxHex: await getText(f, `${base}/tx/${u.txid}/hex`) } : {}),
    })),
  );
}

async function getText(f: Fetch, url: string): Promise<string> {
  const res = await f(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

/** Today's fastest fee rate in sat/vB. */
export async function bitcoinFastestFee(network: "mainnet" | "testnet", f: Fetch = fetch): Promise<number> {
  const fees = (await getJson(f, `${ENDPOINTS.bitcoin[network]}/v1/fees/recommended`)) as { fastestFee: number };
  return fees.fastestFee;
}

/** Has this address ever received or sent anything? A safe address must never have. */
export async function bitcoinEverUsed(p: Extract<Parsed, { chain: "bitcoin" }>, f: Fetch = fetch): Promise<boolean> {
  const a = (await getJson(f, `${ENDPOINTS.bitcoin[p.network]}/address/${p.address}`)) as {
    chain_stats: { funded_txo_count: number; spent_txo_count: number };
    mempool_stats: { funded_txo_count: number; spent_txo_count: number };
  };
  const c = a.chain_stats;
  const m = a.mempool_stats;
  return c.funded_txo_count + c.spent_txo_count + m.funded_txo_count + m.spent_txo_count > 0;
}

// ---------- Ethereum and BNB Chain rescue lookups ----------

const BALANCE_OF = "0x70a08231"; // balanceOf(address)

function evmUrl(chain: "ethereum" | "bsc", network: "mainnet" | "testnet"): string {
  return network === "mainnet" ? ENDPOINTS[chain] : ENDPOINTS.evmTestnet[chain];
}

/** Everything needed to plan an escape: next nonce, balance, today's gas price, and stablecoin balances. */
export async function evmRescueFacts(
  address: string,
  chain: "ethereum" | "bsc",
  network: "mainnet" | "testnet",
  tokens: { symbol: string; address: `0x${string}`; decimals: number }[],
  f: Fetch = fetch,
) {
  const url = evmUrl(chain, network);
  const [nonce, balance, gasPrice, ...tokenBalances] = await Promise.all([
    rpc(f, url, "eth_getTransactionCount", [address, "pending"]),
    rpc(f, url, "eth_getBalance", [address, "latest"]),
    rpc(f, url, "eth_gasPrice", []),
    ...(network === "mainnet" ? tokens : []).map((t) =>
      rpc(f, url, "eth_call", [{ to: t.address, data: BALANCE_OF + address.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
    ),
  ]);
  return {
    nonce: Number(BigInt(nonce as string)),
    balanceWei: BigInt(balance as string),
    gasPriceWei: BigInt(gasPrice as string),
    tokens: (network === "mainnet" ? tokens : []).map((t, i) => ({
      ...t,
      balance: BigInt((tokenBalances[i] as string) === "0x" ? 0 : (tokenBalances[i] as string)).toString(),
    })),
  };
}

/** Has this address ever sent a transaction on this chain? If so its public key is already out. */
export async function evmHasSent(address: string, chain: "ethereum" | "bsc", network: "mainnet" | "testnet", f: Fetch = fetch) {
  const nonce = await rpc(f, evmUrl(chain, network), "eth_getTransactionCount", [address, "latest"]);
  return BigInt(nonce as string) > BigInt(0);
}

// ---------- Watchman lookups ----------

interface Outspend {
  spent: boolean;
  txid?: string;
  status?: { confirmed: boolean; block_height?: number };
}

interface EsploraTx {
  fee: number;
  weight: number;
  vout: { scriptpubkey_address?: string }[];
}

/** Current state of each canary: still, or spent (when, where to, at what fee). */
export async function canaryStates(
  canaries: { id: string; txid: string; vout: number }[],
  network: "mainnet" | "testnet",
  f: Fetch = fetch,
) {
  const base = ENDPOINTS.bitcoin[network];
  const tip = Number(await getText(f, `${base}/blocks/tip/height`));
  const states = await mapLimit(canaries, 6, async (c) => {
      const o = (await getJson(f, `${base}/tx/${c.txid}/outspend/${c.vout}`)) as Outspend;
      if (!o.spent || !o.txid) return { id: c.id, spent: false };
      const tx = (await getJson(f, `${base}/tx/${o.txid}`)) as EsploraTx;
      return {
        id: c.id,
        spent: true,
        spendTxid: o.txid,
        spendHeight: o.status?.confirmed ? (o.status.block_height ?? null) : null,
        destinations: tx.vout.map((v) => v.scriptpubkey_address).filter((a): a is string => !!a),
        feeRate: Math.round((tx.fee / (tx.weight / 4)) * 10) / 10,
      };
  });
  return { tip, states };
}

/** Run `fn` over items with at most `limit` in flight, so public APIs aren't flooded. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
