// Recognise what a pasted line is: a Bitcoin, EVM (Ethereum and BNB Chain) or NEAR address.
// Pure functions, no network.
import { sha256 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import { bech32, bech32m, createBase58check } from "@scure/base";

const base58check = createBase58check(sha256);

export type BitcoinKind = "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr";
export type Network = "mainnet" | "testnet";

export type Parsed =
  | { chain: "bitcoin"; address: string; kind: BitcoinKind; network: Network }
  | { chain: "evm"; address: string }
  | { chain: "near"; address: string; implicit: boolean; network: Network }
  | { chain: "unknown"; address: string; reason: string };

function parseBitcoin(input: string): Parsed | null {
  const lower = input.toLowerCase();
  const hrp = lower.startsWith("bc1") ? "bc" : lower.startsWith("tb1") ? "tb" : null;
  if (hrp) {
    if (input !== lower && input !== input.toUpperCase()) return null; // mixed case is invalid bech32
    for (const codec of [bech32, bech32m]) {
      try {
        const { prefix, words } = codec.decode(lower as `${string}1${string}`, 90);
        if (prefix !== hrp || words.length === 0) continue;
        const version = words[0];
        const program = codec.fromWords(words.slice(1));
        // BIP-350: version 0 uses bech32, version 1+ uses bech32m.
        if ((version === 0) !== (codec === bech32)) continue;
        const network: Network = hrp === "bc" ? "mainnet" : "testnet";
        if (version === 0 && program.length === 20) return { chain: "bitcoin", address: lower, kind: "p2wpkh", network };
        if (version === 0 && program.length === 32) return { chain: "bitcoin", address: lower, kind: "p2wsh", network };
        if (version === 1 && program.length === 32) return { chain: "bitcoin", address: lower, kind: "p2tr", network };
      } catch {
        /* try the other codec */
      }
    }
    return null;
  }
  try {
    const bytes = base58check.decode(input);
    if (bytes.length !== 21) return null;
    const version = bytes[0];
    if (version === 0x00) return { chain: "bitcoin", address: input, kind: "p2pkh", network: "mainnet" };
    if (version === 0x05) return { chain: "bitcoin", address: input, kind: "p2sh", network: "mainnet" };
    if (version === 0x6f) return { chain: "bitcoin", address: input, kind: "p2pkh", network: "testnet" };
    if (version === 0xc4) return { chain: "bitcoin", address: input, kind: "p2sh", network: "testnet" };
  } catch {
    /* not base58check */
  }
  return null;
}

/** EIP-55: a mixed-case address must match its checksum; all-lower or all-upper is accepted. */
export function isValidEvm(input: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input)) return false;
  const body = input.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(body.toLowerCase())));
  for (let i = 0; i < 40; i++) {
    const c = body[i];
    if (/[a-f]/.test(c) && parseInt(hash[i], 16) >= 8) return false;
    if (/[A-F]/.test(c) && parseInt(hash[i], 16) < 8) return false;
  }
  return true;
}

const NEAR_NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

function parseNear(input: string): Parsed | null {
  const s = input.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(s)) return { chain: "near", address: s, implicit: true, network: "mainnet" };
  if (s.length < 2 || s.length > 64 || !NEAR_NAMED.test(s)) return null;
  if (s.endsWith(".near") || s === "near") return { chain: "near", address: s, implicit: false, network: "mainnet" };
  if (s.endsWith(".testnet") || s === "testnet") return { chain: "near", address: s, implicit: false, network: "testnet" };
  return null;
}

export function parseAddress(raw: string): Parsed {
  const input = raw.trim();
  if (!input) return { chain: "unknown", address: input, reason: "Empty line" };
  if (/^0x/i.test(input)) {
    return isValidEvm(input)
      ? { chain: "evm", address: input.toLowerCase() }
      : { chain: "unknown", address: input, reason: "This looks like an Ethereum address, but a character is wrong." };
  }
  return (
    parseBitcoin(input) ??
    parseNear(input) ?? {
      chain: "unknown",
      address: input,
      reason: "We don't recognise this. Paste a Bitcoin, Ethereum, BNB Chain or NEAR address.",
    }
  );
}

/** Split pasted text into unique addresses: one per line, or separated by commas or spaces. */
export function splitInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = /^0x/i.test(t) ? t.toLowerCase() : t;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
