// Server-side: run the vault once on OutLayer testnet through request_execution, paying from
// the Lifeboat testnet account (derived from NEAR_TESTNET_SEED, as scripts/testnet-account.mjs does).
// Only ever sees sealed (encrypted) escapes.
import { createHash } from "node:crypto";
import * as near from "@fastnear/api";
import { signerFromPrivateKey } from "@fastnear/utils";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { VAULT } from "./config";

const LIMITS = { max_instructions: 50_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 };
const TGAS_300 = (BigInt(300) * BigInt(10) ** BigInt(12)).toString();
const FALLBACK_DEPOSIT = (BigInt(50) * BigInt(10) ** BigInt(21)).toString(); // 0.05 NEAR

export class VaultUnavailable extends Error {}

export function vaultAccount(env: Record<string, string | undefined> = process.env) {
  const seed = env.NEAR_TESTNET_SEED?.trim();
  if (!seed || seed.length < 20) throw new VaultUnavailable("Sealing into the vault isn't switched on for this site yet.");
  const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest();
  const priv = sha(`lifeboat:near-testnet:ed25519:${seed}`);
  const pub = ed25519.getPublicKey(priv);
  const key = `ed25519:${base58.encode(new Uint8Array([...priv, ...pub]))}` as `ed25519:${string}`;
  const accountId = `lifeboat-${sha(pub).toString("hex").slice(0, 10)}.testnet`;
  return { accountId, signer: signerFromPrivateKey(key) };
}

type Rpc = { result?: unknown } & Record<string, unknown>;
const unwrap = (r: unknown) => ((r as Rpc)?.result ?? r) as Record<string, unknown>;

/** The vault's JSON answer and the transaction that carried it. */
export function readOutcome(result: unknown): { hash: string; answer: Record<string, unknown> | null; failure: string | null } {
  const r = unwrap(result) as {
    status?: { SuccessValue?: string; Failure?: unknown };
    transaction?: { hash?: string };
    receipts_outcome?: { outcome?: { status?: { SuccessValue?: string; Failure?: unknown } } }[];
  };
  const statuses = [r?.status, ...(r?.receipts_outcome ?? []).map((o) => o?.outcome?.status)];
  const failure = statuses.find((s) => s?.Failure)?.Failure;
  const values = statuses
    .map((s) => s?.SuccessValue)
    .filter((v): v is string => !!v)
    .map((v) => Buffer.from(v, "base64").toString())
    .filter((t) => t && t !== "null");
  let answer: Record<string, unknown> | null = null;
  try {
    const parsed = values.length ? JSON.parse(values[values.length - 1]) : null;
    answer = (parsed?.output ?? parsed) as Record<string, unknown> | null;
  } catch {
    answer = null;
  }
  return { hash: r?.transaction?.hash ?? "unknown", answer, failure: failure ? JSON.stringify(failure).slice(0, 300) : null };
}

export async function callVault(input: Record<string, unknown>, env: Record<string, string | undefined> = process.env) {
  const { accountId, signer } = vaultAccount(env);
  near.config({ networkId: VAULT.network });
  const data = JSON.stringify(input);
  let deposit = FALLBACK_DEPOSIT;
  try {
    const est = unwrap(
      await near.view({ contractId: VAULT.outlayer, methodName: "estimate_execution_cost", args: { resource_limits: LIMITS, input_len: data.length }, network: VAULT.network }),
    ) as { result?: number[] } | string;
    const raw = typeof est === "string" ? est : Array.isArray(est?.result) ? JSON.parse(Buffer.from(est.result).toString()) : null;
    if (raw) deposit = ((BigInt(String(raw)) * BigInt(15)) / BigInt(10)).toString();
  } catch {
    /* fall back to a fixed deposit; the unused part is refunded */
  }
  const result = await near
    .sendTx({
    receiverId: VAULT.outlayer,
    actions: [
      near.actions.functionCall({
        methodName: "request_execution",
        args: { source: { Project: { project_id: VAULT.project, version_key: null } }, resource_limits: LIMITS, input_data: data, response_format: "Json" },
        gas: TGAS_300,
        deposit,
      }),
    ],
    signer,
    signerId: accountId,
    waitUntil: "EXECUTED_OPTIMISTIC",
    network: VAULT.network,
    })
    .catch((e: unknown) => {
      // The RPC can time out waiting for the yield/resume to finish even though the vault has
      // answered; the timeout error then carries the outcome. Use it rather than report failure.
      const inner = outcomeInError(e);
      if (inner) return inner;
      throw e;
    });
  return readOutcome(result);
}

/** Dig a transaction outcome out of an RPC timeout error, if it carries one. */
export function outcomeInError(e: unknown): unknown | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): unknown | null => {
    if (!v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.receipts_outcome && (o.transaction || o.status)) return o;
    for (const k of Object.keys(o)) {
      const found = walk(o[k]);
      if (found) return found;
    }
    return null;
  };
  let candidate: unknown = e;
  if (e instanceof Error) {
    try {
      candidate = JSON.parse(e.message);
    } catch {
      candidate = e;
    }
  }
  return walk(candidate) ?? walk(e);
}
