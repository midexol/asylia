// Build and check a Bitcoin rescue: one transaction that sweeps every coin in an exposed
// address to a fresh address whose public key has never been seen. Asylia builds it
// unsigned (a PSBT), the owner signs it in their own wallet, and Asylia checks the
// signed result pays only where the owner chose before it is sealed. No keys touch Asylia.
import * as ecc from "@bitcoinerlab/secp256k1";
import { address as baddress, initEccLib, networks, Psbt, Transaction, type Network as BtcNetwork } from "bitcoinjs-lib";
import { parseAddress, type BitcoinKind, type Network } from "../address";

initEccLib(ecc);

export interface Utxo {
  txid: string;
  vout: number;
  value: number; // sats
  prevTxHex?: string; // full previous transaction: required for legacy (p2pkh, p2sh) inputs
}

export interface RescuePlan {
  network: Network;
  from: string;
  to: string;
  fromKind: BitcoinKind;
  utxos: Utxo[];
  feeRate: number; // sat/vB
  vbytes: number;
  fee: number; // sats
  amount: number; // sats that reach the safe address
  psbt: string; // base64, unsigned
}

export class RescueError extends Error {}

const net = (n: Network): BtcNetwork => (n === "mainnet" ? networks.bitcoin : networks.testnet);

// Virtual size per input when spent, and per output, by address type.
const INPUT_VB: Record<BitcoinKind, number> = { p2pkh: 148, p2sh: 91, p2wpkh: 68, p2wsh: 105, p2tr: 58 };
const OUTPUT_VB: Record<BitcoinKind, number> = { p2pkh: 34, p2sh: 32, p2wpkh: 31, p2wsh: 43, p2tr: 43 };
const DUST = 546;
/** Rescues opt in to replace-by-fee so a sealed rescue can be re-signed higher if fees spike past its cap. */
export const RBF_SEQUENCE = 0xfffffffd;

export function estimateVbytes(fromKind: BitcoinKind, toKind: BitcoinKind, inputs: number): number {
  const segwit = fromKind !== "p2pkh" && fromKind !== "p2sh";
  return Math.ceil((segwit ? 10.5 : 10) + inputs * INPUT_VB[fromKind] + OUTPUT_VB[toKind]);
}

function btcAddress(raw: string, label: string) {
  const p = parseAddress(raw);
  if (p.chain !== "bitcoin") throw new RescueError(`The ${label} is not a Bitcoin address.`);
  return p;
}

export function buildRescue(input: { from: string; to: string; utxos: Utxo[]; feeRate: number }): RescuePlan {
  const from = btcAddress(input.from, "wallet to rescue");
  const to = btcAddress(input.to, "safe address");
  if (from.network !== to.network) throw new RescueError("Both addresses must be on the same network (mainnet or testnet).");
  if (from.address === to.address) throw new RescueError("The safe address must be a different, fresh address.");
  if (from.kind === "p2sh" || from.kind === "p2wsh") {
    throw new RescueError("Multisig and script wallets are not supported yet. Use a single-key wallet address.");
  }
  if (!input.utxos.length) throw new RescueError("This wallet has no coins to rescue.");
  if (!(input.feeRate >= 1)) throw new RescueError("The fee rate must be at least 1 sat/vB.");

  const network = net(from.network);
  const script = baddress.toOutputScript(from.address, network);
  const total = input.utxos.reduce((s, u) => s + u.value, 0);
  const vbytes = estimateVbytes(from.kind, to.kind, input.utxos.length);
  const fee = Math.ceil(vbytes * input.feeRate);
  const amount = total - fee;
  if (amount < DUST) throw new RescueError("At this fee rate the fee would take almost everything. Pick a lower fee or add coins.");

  const psbt = new Psbt({ network });
  for (const u of input.utxos) {
    if (from.kind === "p2pkh") {
      if (!u.prevTxHex) throw new RescueError("Legacy addresses need the previous transactions to build a rescue.");
      psbt.addInput({ hash: u.txid, index: u.vout, sequence: RBF_SEQUENCE, nonWitnessUtxo: Buffer.from(u.prevTxHex, "hex") });
    } else {
      psbt.addInput({ hash: u.txid, index: u.vout, sequence: RBF_SEQUENCE, witnessUtxo: { script, value: u.value } });
    }
  }
  psbt.addOutput({ address: to.address, value: amount });

  return {
    network: from.network,
    from: from.address,
    to: to.address,
    fromKind: from.kind,
    utxos: input.utxos.map(({ txid, vout, value }) => ({ txid, vout, value })),
    feeRate: input.feeRate,
    vbytes,
    fee,
    amount,
    psbt: psbt.toBase64(),
  };
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
  txHex?: string;
  txid?: string;
  amount?: number;
  fee?: number;
  feeRate?: number;
}

/** Turn whatever the wallet gave back (a signed PSBT in base64 or hex, or a raw transaction) into a transaction. */
function toTransaction(signed: string, plan: RescuePlan): { tx: Transaction; problems: string[] } {
  const text = signed.trim();
  const network = net(plan.network);
  let psbt: Psbt | null = null;
  try {
    psbt = /^[0-9a-f]+$/i.test(text) && text.startsWith("70736274") ? Psbt.fromHex(text, { network }) : Psbt.fromBase64(text, { network });
  } catch {
    psbt = null;
  }
  if (psbt) {
    const p = psbt;
    const ecdsa = (pub: Uint8Array, msg: Uint8Array, sig: Uint8Array) => ecc.verify(msg, pub, sig);
    const schnorr = (pub: Uint8Array, msg: Uint8Array, sig: Uint8Array) => ecc.verifySchnorr(msg, pub, sig);
    const unsigned = p.data.inputs.some(
      (inp) => !inp.finalScriptWitness && !inp.finalScriptSig && !inp.partialSig?.length && !inp.tapKeySig,
    );
    if (unsigned) throw new RescueError("The rescue is not signed yet. Sign it in your wallet, then paste what the wallet gives back.");
    try {
      p.data.inputs.forEach((inp, i) => {
        const verify = inp.tapKeySig || inp.tapScriptSig?.length ? schnorr : ecdsa;
        if (!inp.finalScriptWitness && !inp.finalScriptSig && !p.validateSignaturesOfInput(i, verify)) {
          throw new RescueError("A signature does not match this transaction.");
        }
      });
      p.finalizeAllInputs();
    } catch (e) {
      if (!p.data.inputs.every((inp) => inp.finalScriptWitness || inp.finalScriptSig)) {
        throw e instanceof RescueError ? e : new RescueError("The rescue is not fully signed yet. Sign every input in your wallet, then paste it again.");
      }
    }
    return { tx: p.extractTransaction(true), problems: [] };
  }
  try {
    return { tx: Transaction.fromHex(text), problems: [] };
  } catch {
    throw new RescueError("That isn't a signed transaction. Paste the signed PSBT or transaction hex your wallet gave you.");
  }
}

/**
 * Check a signed rescue before sealing it. It must spend exactly the planned coins, pay all
 * of them (less the fee) to the chosen safe address and nothing else, carry signatures on every
 * input, and keep at least the planned fee rate.
 */
export function checkRescue(signed: string, plan: RescuePlan): CheckResult {
  let tx: Transaction;
  let problems: string[];
  try {
    ({ tx, problems } = toTransaction(signed, plan));
  } catch (e) {
    return { ok: false, problems: [e instanceof Error ? e.message : "Unreadable transaction."] };
  }
  const network = net(plan.network);

  const planned = new Set(plan.utxos.map((u) => `${u.txid}:${u.vout}`));
  const spent = tx.ins.map((i) => `${Buffer.from(i.hash).reverse().toString("hex")}:${i.index}`);
  if (spent.length !== planned.size || spent.some((s) => !planned.has(s))) {
    problems.push("It spends different coins from the rescue Asylia prepared.");
  }
  if (tx.ins.some((i) => !i.script.length && !i.witness.length)) {
    problems.push("Some inputs are not signed.");
  }

  const safeScript = baddress.toOutputScript(plan.to, network);
  if (tx.outs.length !== 1 || !Buffer.from(tx.outs[0].script).equals(safeScript)) {
    problems.push("It does not pay only your safe address. Do not seal it.");
  }

  const total = plan.utxos.reduce((s, u) => s + u.value, 0);
  const amount = tx.outs.reduce((s, o) => s + Number(o.value), 0);
  const fee = total - amount;
  const feeRate = fee / tx.virtualSize();
  if (fee < 0) problems.push("It pays out more than the wallet holds.");
  else if (feeRate < plan.feeRate * 0.95) problems.push("Its fee is lower than planned, so it may not confirm when it matters.");

  return {
    ok: problems.length === 0,
    problems,
    txHex: tx.toHex(),
    txid: tx.getId(),
    amount,
    fee,
    feeRate: Math.round(feeRate * 10) / 10,
  };
}

export const FEE_SPEEDS = {
  normal: { label: "Normal", multiplier: 1, floor: 2 },
  high: { label: "High", multiplier: 5, floor: 20 },
  highest: { label: "Highest", multiplier: 15, floor: 60 },
} as const;
export type FeeSpeed = keyof typeof FEE_SPEEDS;

/** A rescue may sit sealed for years and go out on the worst day, so its fee is set well above today's. */
export function rescueFeeRate(fastestToday: number, speed: FeeSpeed): number {
  const s = FEE_SPEEDS[speed];
  return Math.max(s.floor, Math.ceil(fastestToday * s.multiplier));
}
