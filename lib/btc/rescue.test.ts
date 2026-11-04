import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { networks, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";
import { buildRescue, checkRescue, estimateVbytes, RescueError, rescueFeeRate, type Utxo } from "./rescue";

const ECPair = ECPairFactory(ecc);
const net = networks.testnet;
const key = ECPair.fromPrivateKey(Buffer.alloc(32, 1), { network: net });
const safeKey = ECPair.fromPrivateKey(Buffer.alloc(32, 2), { network: net });
const thiefKey = ECPair.fromPrivateKey(Buffer.alloc(32, 3), { network: net });

const segwit = (k: typeof key) => payments.p2wpkh({ pubkey: Buffer.from(k.publicKey), network: net }).address!;
const legacy = (k: typeof key) => payments.p2pkh({ pubkey: Buffer.from(k.publicKey), network: net }).address!;
const FROM = segwit(key);
const SAFE = segwit(safeKey);
const THIEF = segwit(thiefKey);

const UTXOS: Utxo[] = [
  { txid: "aa".repeat(32), vout: 0, value: 60_000 },
  { txid: "bb".repeat(32), vout: 1, value: 40_000 },
];

function sign(psbtBase64: string, k = key): string {
  const p = Psbt.fromBase64(psbtBase64, { network: net });
  p.signAllInputs(k);
  return p.toBase64();
}

describe("buildRescue", () => {
  it("sweeps every coin to the safe address, less a fee at the planned rate", () => {
    const plan = buildRescue({ from: FROM, to: SAFE, utxos: UTXOS, feeRate: 20 });
    expect(plan.vbytes).toBe(estimateVbytes("p2wpkh", "p2wpkh", 2));
    expect(plan.fee).toBe(plan.vbytes * 20);
    expect(plan.amount).toBe(100_000 - plan.fee);
    const p = Psbt.fromBase64(plan.psbt, { network: net });
    expect(p.txOutputs).toHaveLength(1);
    expect(p.txOutputs[0].address).toBe(SAFE);
    expect(p.txInputs.every((i) => i.sequence === 0xfffffffd)).toBe(true);
  });

  it("refuses unsafe or impossible rescues", () => {
    expect(() => buildRescue({ from: FROM, to: FROM, utxos: UTXOS, feeRate: 5 })).toThrow(RescueError);
    expect(() => buildRescue({ from: FROM, to: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed", utxos: UTXOS, feeRate: 5 })).toThrow(/not a Bitcoin/);
    expect(() => buildRescue({ from: FROM, to: SAFE, utxos: [], feeRate: 5 })).toThrow(/no coins/);
    expect(() => buildRescue({ from: FROM, to: SAFE, utxos: [{ txid: "cc".repeat(32), vout: 0, value: 1000 }], feeRate: 50 })).toThrow(/fee/);
    expect(() => buildRescue({ from: FROM, to: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", utxos: UTXOS, feeRate: 5 })).toThrow(/same network/);
  });
});

describe("checkRescue", () => {
  const plan = buildRescue({ from: FROM, to: SAFE, utxos: UTXOS, feeRate: 20 });

  it("accepts the owner's signed rescue, as a PSBT or as raw hex", () => {
    const signed = sign(plan.psbt);
    const r = checkRescue(signed, plan);
    expect(r).toMatchObject({ ok: true, problems: [], amount: plan.amount, fee: plan.fee });
    expect(r.feeRate).toBeGreaterThanOrEqual(19);
    expect(checkRescue(r.txHex!, plan).ok).toBe(true);
    expect(Transaction.fromHex(r.txHex!).getId()).toBe(r.txid);
  });

  it("rejects an unsigned rescue", () => {
    expect(checkRescue(plan.psbt, plan)).toMatchObject({ ok: false, problems: [expect.stringMatching(/not signed/)] });
  });

  it("rejects a rescue redirected to someone else", () => {
    const p = new Psbt({ network: net });
    const script = payments.p2wpkh({ pubkey: Buffer.from(key.publicKey), network: net }).output!;
    UTXOS.forEach((u) => p.addInput({ hash: u.txid, index: u.vout, witnessUtxo: { script, value: u.value } }));
    p.addOutput({ address: THIEF, value: plan.amount });
    const r = checkRescue(sign(p.toBase64()), plan);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/does not pay only your safe address/);
  });

  it("rejects a skimmed rescue that adds a second output", () => {
    const p = Psbt.fromBase64(plan.psbt, { network: net });
    const skim = new Psbt({ network: net });
    p.txInputs.forEach((inp, i) => skim.addInput({ hash: inp.hash, index: inp.index, witnessUtxo: p.data.inputs[i].witnessUtxo! }));
    skim.addOutput({ address: SAFE, value: plan.amount - 5000 });
    skim.addOutput({ address: THIEF, value: 5000 });
    expect(checkRescue(sign(skim.toBase64()), plan).ok).toBe(false);
  });

  it("rejects a rescue with a lower fee than planned", () => {
    const cheap = buildRescue({ from: FROM, to: SAFE, utxos: UTXOS, feeRate: 2 });
    const r = checkRescue(sign(cheap.psbt), plan);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/fee is lower/);
  });

  it("rejects a signature from the wrong key", () => {
    const p = Psbt.fromBase64(plan.psbt, { network: net });
    expect(() => p.signAllInputs(thiefKey)).toThrow(); // bitcoinjs refuses to sign for a key that doesn't own the input
  });

  it("rejects text that is not a transaction", () => {
    expect(checkRescue("hello", plan)).toMatchObject({ ok: false });
  });
});

describe("legacy p2pkh rescue", () => {
  it("builds with the previous transaction and checks out once signed", () => {
    const from = legacy(key);
    const prev = new Transaction();
    prev.addInput(Buffer.alloc(32, 9), 0);
    prev.addOutput(payments.p2pkh({ pubkey: Buffer.from(key.publicKey), network: net }).output!, 80_000);
    const utxo = { txid: prev.getId(), vout: 0, value: 80_000, prevTxHex: prev.toHex() };
    const plan = buildRescue({ from, to: SAFE, utxos: [utxo], feeRate: 10 });
    const r = checkRescue(sign(plan.psbt), plan);
    expect(r.ok).toBe(true);
    expect(() => buildRescue({ from, to: SAFE, utxos: [{ ...utxo, prevTxHex: undefined }], feeRate: 10 })).toThrow(/previous transactions/);
  });
});

describe("rescueFeeRate", () => {
  it("sets the fee well above today's, with a floor", () => {
    expect(rescueFeeRate(1, "high")).toBe(20);
    expect(rescueFeeRate(10, "high")).toBe(50);
    expect(rescueFeeRate(10, "highest")).toBe(150);
    expect(rescueFeeRate(3, "normal")).toBe(3);
  });
});
