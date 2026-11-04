// Decide whether a wallet's public key is already visible on chain, which is what a
// quantum computer would need to work out its private key. Pure: takes facts, returns a verdict.
import type { BitcoinKind, Parsed } from "./address";

export type Chain = "bitcoin" | "ethereum" | "bsc" | "near";

export type Verdict =
  | "exposed" // the public key is public: a rescue should be sealed
  | "hidden" // only a hash of the key is public: safe until it next sends
  | "empty" // nothing to protect
  | "upgrade" // NEAR: fix in place with a quantum-safe key
  | "invalid"
  | "unknown"; // couldn't look it up

/** Facts fetched from the chain. Every field is optional because lookups can fail. */
export interface Facts {
  balance?: number; // in the chain's coin (BTC, ETH, BNB, NEAR)
  sentBefore?: boolean; // the address has signed at least one transaction
  pqKey?: boolean; // NEAR: an ML-DSA key is already on the account
  error?: string;
}

export interface Result {
  input: string;
  chain: Chain | null;
  network?: "mainnet" | "testnet";
  verdict: Verdict;
  headline: string;
  reason: string;
  balance?: number;
  symbol?: string;
  usd?: number;
}

export const SYMBOL: Record<Chain, string> = { bitcoin: "BTC", ethereum: "ETH", bsc: "BNB", near: "NEAR" };
export const CHAIN_NAME: Record<Chain, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  bsc: "BNB Chain",
  near: "NEAR",
};

const HEADLINE: Record<Verdict, string> = {
  exposed: "At risk",
  hidden: "Safe for now",
  empty: "Nothing to protect",
  upgrade: "Can be fixed in one step",
  invalid: "Not an address",
  unknown: "Couldn't check",
};

/** Bitcoin address types whose public key is on chain from the moment they receive coins. */
const ALWAYS_EXPOSED: BitcoinKind[] = ["p2tr"];

export function judge(parsed: Parsed, chain: Chain | null, facts: Facts, priceUsd?: number): Result {
  const base = { input: parsed.address, chain };
  if (parsed.chain === "unknown" || !chain) {
    return { ...base, verdict: "invalid", headline: HEADLINE.invalid, reason: parsed.chain === "unknown" ? parsed.reason : "" };
  }
  const network = parsed.chain === "evm" ? undefined : parsed.network;
  const money = {
    balance: facts.balance,
    symbol: SYMBOL[chain],
    usd: facts.balance !== undefined && priceUsd !== undefined && network !== "testnet" ? facts.balance * priceUsd : undefined,
  };
  const done = (verdict: Verdict, reason: string): Result => ({ ...base, network, verdict, headline: HEADLINE[verdict], reason, ...money });

  if (facts.error) return done("unknown", `We couldn't reach ${CHAIN_NAME[chain]} just now. Try again in a minute.`);

  if (parsed.chain === "near") {
    if (facts.pqKey) return { ...done("hidden", "This account already has a quantum-safe key."), headline: "Already upgraded" };
    return done(
      "upgrade",
      "NEAR account keys are always public, but NEAR lets you add a quantum-safe key to the same account. No coins need to move.",
    );
  }

  if (facts.balance === 0) {
    return done("empty", "There are no coins here, so there is nothing to rescue. Don't reuse it once it has sent coins.");
  }

  if (parsed.chain === "bitcoin" && ALWAYS_EXPOSED.includes(parsed.kind)) {
    return done("exposed", "This is a Taproot address. Its public key is written into the address itself, so it is visible to everyone.");
  }

  if (facts.sentBefore === undefined) return done("unknown", "We couldn't tell whether this wallet has sent coins before.");

  if (facts.sentBefore) {
    return done(
      "exposed",
      parsed.chain === "bitcoin"
        ? "This address has sent coins before, which put its public key on the blockchain for good."
        : "This wallet has sent a transaction before, which put its public key on the blockchain for good.",
    );
  }
  return done(
    "hidden",
    "This wallet has never sent anything, so only a fingerprint of its key is public. It becomes exposed the first time it sends.",
  );
}

/** Which chains to look up for a parsed address. One 0x address is checked on both Ethereum and BNB Chain. */
export function chainsFor(parsed: Parsed): Chain[] {
  switch (parsed.chain) {
    case "bitcoin":
      return ["bitcoin"];
    case "evm":
      return ["ethereum", "bsc"];
    case "near":
      return ["near"];
    default:
      return [];
  }
}

/** Total US dollars sitting in exposed wallets. */
export function atRiskUsd(results: Result[]): number {
  return results.filter((r) => r.verdict === "exposed").reduce((sum, r) => sum + (r.usd ?? 0), 0);
}
