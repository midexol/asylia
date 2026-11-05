// Build and check an Ethereum or BNB Chain escape: a set of transactions, signed now and
// sent later, that move every USDC, USDT and native coin from an exposed address to a fresh
// one. Token transfers go first and the native sweep last, with nonces in sequence, so the
// native coin still pays every fee. Asylia never holds a key: the owner signs offline.
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  type Hex,
  type TransactionSerializable,
} from "viem";

export type EvmChain = "ethereum" | "bsc";
export type EvmNetwork = "mainnet" | "testnet";
export type EvmSpeed = "normal" | "high" | "highest";

export const CHAINS: Record<EvmChain, Record<EvmNetwork, { id: number; name: string; symbol: string }>> = {
  ethereum: {
    mainnet: { id: 1, name: "Ethereum", symbol: "ETH" },
    testnet: { id: 11155111, name: "Ethereum Sepolia testnet", symbol: "ETH" },
  },
  bsc: {
    mainnet: { id: 56, name: "BNB Chain", symbol: "BNB" },
    testnet: { id: 97, name: "BNB Chain testnet", symbol: "tBNB" },
  },
};

/** Stablecoins worth rescuing alongside the native coin, mainnet only. */
export const TOKENS: Record<EvmChain, { symbol: string; address: `0x${string}`; decimals: number }[]> = {
  ethereum: [
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  ],
  bsc: [
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  ],
};

const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
export const NATIVE_GAS = BigInt(21_000);
export const TOKEN_GAS = BigInt(100_000); // a USDT/USDC transfer uses ~35–65k; the cap is only charged if used
const GWEI = BigInt(1_000_000_000);

/** Fee caps in gwei. An escape may go out on the busiest day, so the cap sits far above today's price. */
const SPEEDS: Record<EvmSpeed, { multiplier: number; floor: Record<EvmChain, number> }> = {
  normal: { multiplier: 1, floor: { ethereum: 1, bsc: 1 } },
  high: { multiplier: 5, floor: { ethereum: 20, bsc: 5 } },
  highest: { multiplier: 15, floor: { ethereum: 60, bsc: 15 } },
};

export function feeCapWei(chain: EvmChain, gasPriceNowWei: bigint, speed: EvmSpeed): bigint {
  const s = SPEEDS[speed];
  const scaled = (gasPriceNowWei * BigInt(Math.round(s.multiplier * 100))) / BigInt(100);
  const floor = BigInt(s.floor[chain]) * GWEI;
  return scaled > floor ? scaled : floor;
}

export class EvmRescueError extends Error {}

export interface TokenBalance {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  balance: string; // smallest units, as a decimal string
}

export interface PlannedTx {
  kind: "token" | "native";
  symbol: string;
  amount: string; // smallest units
  decimals: number;
  nonce: number;
  unsigned: Hex; // serialized unsigned transaction, for offline signers
  fields: { to: `0x${string}`; value: string; data: Hex; gas: string; chainId: number; nonce: number; maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasPrice?: string };
}

export interface EvmPlan {
  chain: EvmChain;
  network: EvmNetwork;
  chainId: number;
  from: `0x${string}`;
  to: `0x${string}`;
  startNonce: number;
  feeCapWei: string;
  reservedFeeWei: string; // the most all transactions together can spend on fees
  txs: PlannedTx[];
}

function tx(chain: EvmChain, base: { chainId: number; nonce: number; to: `0x${string}`; value: bigint; data: Hex; gas: bigint }, cap: bigint): TransactionSerializable {
  // Ethereum: EIP-1559, tip capped at 2 gwei. BNB Chain: a plain gas price, which lets the sweep empty the account exactly.
  if (chain === "ethereum") {
    const tip = cap < BigInt(2) * GWEI ? cap : BigInt(2) * GWEI;
    return { type: "eip1559", ...base, maxFeePerGas: cap, maxPriorityFeePerGas: tip };
  }
  return { type: "legacy", ...base, gasPrice: cap };
}

export function buildEvmRescue(input: {
  chain: EvmChain;
  network: EvmNetwork;
  from: string;
  to: string;
  nonce: number;
  balanceWei: bigint;
  gasPriceWei: bigint;
  speed: EvmSpeed;
  tokens?: TokenBalance[];
}): EvmPlan {
  if (!isAddress(input.from) || !isAddress(input.to)) throw new EvmRescueError("Both addresses must be Ethereum-style 0x addresses.");
  const from = getAddress(input.from);
  const to = getAddress(input.to);
  if (from === to) throw new EvmRescueError("The safe address must be a different, fresh address.");
  const { id: chainId } = CHAINS[input.chain][input.network];
  const cap = feeCapWei(input.chain, input.gasPriceWei, input.speed);

  const tokens = (input.tokens ?? []).filter((t) => BigInt(t.balance) > BigInt(0));
  const reserved = cap * (NATIVE_GAS + TOKEN_GAS * BigInt(tokens.length));
  if (input.balanceWei < reserved) {
    throw new EvmRescueError(
      tokens.length
        ? "There isn't enough of the chain's coin to pay the escape's fees at this fee level. Pick a lower level or add a little coin."
        : "At this fee level the fee would take everything. Pick a lower level or add a little coin.",
    );
  }

  const txs: PlannedTx[] = [];
  let nonce = input.nonce;
  for (const t of tokens) {
    const data = encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [to, BigInt(t.balance)] });
    const s = tx(input.chain, { chainId, nonce, to: getAddress(t.address), value: BigInt(0), data, gas: TOKEN_GAS }, cap);
    txs.push(planned("token", t.symbol, t.balance, t.decimals, s));
    nonce++;
  }
  const sweep = input.balanceWei - reserved;
  if (sweep > BigInt(0)) {
    const s = tx(input.chain, { chainId, nonce, to, value: sweep, data: "0x", gas: NATIVE_GAS }, cap);
    txs.push(planned("native", CHAINS[input.chain][input.network].symbol, sweep.toString(), 18, s));
  }
  if (!txs.length) throw new EvmRescueError("This wallet has nothing to rescue.");

  return { chain: input.chain, network: input.network, chainId, from, to, startNonce: input.nonce, feeCapWei: cap.toString(), reservedFeeWei: reserved.toString(), txs };
}

function planned(kind: "token" | "native", symbol: string, amount: string, decimals: number, s: TransactionSerializable): PlannedTx {
  const f = s as TransactionSerializable & { gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint };
  return {
    kind,
    symbol,
    amount,
    decimals,
    nonce: s.nonce!,
    unsigned: serializeTransaction(s),
    fields: {
      to: s.to!,
      value: (s.value ?? BigInt(0)).toString(),
      data: (s.data ?? "0x") as Hex,
      gas: s.gas!.toString(),
      chainId: s.chainId!,
      nonce: s.nonce!,
      ...(f.maxFeePerGas !== undefined ? { maxFeePerGas: f.maxFeePerGas.toString(), maxPriorityFeePerGas: f.maxPriorityFeePerGas!.toString() } : {}),
      ...(f.gasPrice !== undefined ? { gasPrice: f.gasPrice.toString() } : {}),
    },
  };
}

export interface EvmCheck {
  ok: boolean;
  problems: string[];
  signed: Hex[]; // in nonce order, once ok
  hashes: string[];
}

/**
 * Check what the owner signed. Every planned transaction must be present exactly once,
 * signed by the exposed address, on the right chain, at the planned nonce, paying only the
 * safe address (directly, or as the recipient of a token transfer), with at least the planned fee cap.
 */
export async function checkEvmRescue(signedRaw: string[], plan: EvmPlan): Promise<EvmCheck> {
  const problems: string[] = [];
  const found = new Map<number, Hex>();
  const safe = plan.to.toLowerCase();

  for (const raw of signedRaw.map((r) => r.trim()).filter(Boolean)) {
    let t: ReturnType<typeof parseTransaction>;
    const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    try {
      t = parseTransaction(hex);
    } catch {
      problems.push("One of the pasted lines isn't a signed transaction.");
      continue;
    }
    if (t.r === undefined || t.s === undefined) {
      problems.push("A transaction is not signed yet.");
      continue;
    }
    let signer: string;
    try {
      signer = (await recoverTransactionAddress({ serializedTransaction: hex as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"] })).toLowerCase();
    } catch {
      problems.push("A signature could not be read.");
      continue;
    }
    if (signer !== plan.from.toLowerCase()) problems.push("A transaction was signed by a different wallet from the one being rescued.");
    if (t.chainId !== plan.chainId) problems.push("A transaction is for a different network.");

    const p = plan.txs.find((x) => x.nonce === t.nonce);
    if (!p) {
      problems.push(`A transaction uses position ${t.nonce}, which isn't part of this escape.`);
      continue;
    }
    if (found.has(t.nonce!)) problems.push("The same transaction was pasted twice.");

    const to = (t.to ?? "").toLowerCase();
    if (p.kind === "native") {
      if (to !== safe || (t.data && t.data !== "0x")) problems.push("The coin transfer does not pay only your safe address. Do not seal it.");
      else if ((t.value ?? BigInt(0)) < BigInt(p.amount)) problems.push("The coin transfer sends less than planned.");
    } else {
      let ok = to === p.fields.to.toLowerCase() && t.data !== undefined;
      if (ok) {
        try {
          const d = decodeFunctionData({ abi: ERC20, data: t.data! });
          ok = d.functionName === "transfer" && (d.args[0] as string).toLowerCase() === safe && (d.args[1] as bigint) === BigInt(p.amount);
        } catch {
          ok = false;
        }
      }
      if (!ok) problems.push(`The ${p.symbol} transfer does not pay only your safe address. Do not seal it.`);
    }
    const cap = t.maxFeePerGas ?? t.gasPrice ?? BigInt(0);
    if (cap * BigInt(100) < BigInt(plan.feeCapWei) * BigInt(95)) problems.push("A transaction's fee cap is lower than planned, so it may not get through when it matters.");
    if ((t.gas ?? BigInt(0)) < BigInt(p.fields.gas)) problems.push("A transaction has less gas than planned and could fail.");
    found.set(t.nonce!, hex);
  }

  for (const p of plan.txs) {
    if (!found.has(p.nonce)) problems.push(`The ${p.symbol} transfer (position ${p.nonce}) is missing. Paste every signed transaction, one per line.`);
  }
  const unique = [...new Set(problems)];
  const signed = plan.txs.map((p) => found.get(p.nonce)).filter((x): x is Hex => !!x);
  return { ok: unique.length === 0, problems: unique, signed: unique.length ? [] : signed, hashes: unique.length ? [] : signed.map((s) => keccak256(s)) };
}

/** Offline signing command for Foundry's `cast`, which signs without broadcasting. */
export function castCommand(plan: EvmPlan, t: PlannedTx): string {
  const f = t.fields;
  const fee = f.gasPrice ? `--gas-price ${f.gasPrice} --legacy` : `--gas-price ${f.maxFeePerGas} --priority-gas-price ${f.maxPriorityFeePerGas}`;
  const call = t.kind === "token" ? `${f.to} "transfer(address,uint256)" ${plan.to} ${t.amount}` : `${f.to} --value ${f.value}`;
  return `cast mktx ${call} --nonce ${f.nonce} --gas-limit ${f.gas} ${fee} --chain ${f.chainId} --interactive`;
}
