import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi, parseTransaction, type Hex, type TransactionSerializable } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildEvmRescue, castCommand, checkEvmRescue, EvmRescueError, feeCapWei, TOKENS, type EvmPlan } from "./rescue";

const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const safe = privateKeyToAccount(`0x${"22".repeat(32)}`).address;
const thief = privateKeyToAccount(`0x${"33".repeat(32)}`);
const GWEI = BigInt(1e9);
const ETH = BigInt(1e18);

/** Sign each planned transaction exactly as an offline signer would. */
async function signAll(plan: EvmPlan, signer = owner, edit?: (t: TransactionSerializable, i: number) => TransactionSerializable) {
  return Promise.all(
    plan.txs.map(async (p, i) => {
      const t = parseTransaction(p.unsigned) as TransactionSerializable;
      return signer.signTransaction(edit ? edit(t, i) : t);
    }),
  );
}

const usdt = TOKENS.ethereum[1];
const base = {
  chain: "ethereum" as const,
  network: "mainnet" as const,
  from: owner.address,
  to: safe,
  nonce: 7,
  balanceWei: ETH,
  gasPriceWei: BigInt(3) * GWEI,
  speed: "high" as const,
};

describe("buildEvmRescue", () => {
  it("sends tokens first and the native sweep last, in nonce order, with fees reserved", () => {
    const plan = buildEvmRescue({ ...base, tokens: [{ ...usdt, balance: "5000000" }, { ...TOKENS.ethereum[0], balance: "0" }] });
    expect(plan.txs.map((t) => [t.kind, t.symbol, t.nonce])).toEqual([["token", "USDT", 7], ["native", "ETH", 8]]);
    expect(plan.feeCapWei).toBe((BigInt(20) * GWEI).toString()); // 5 x 3 gwei is under the 20 gwei floor
    const reserved = BigInt(20) * GWEI * BigInt(121_000);
    expect(plan.txs[1].amount).toBe((ETH - reserved).toString());
    expect(parseTransaction(plan.txs[1].unsigned).type).toBe("eip1559");
  });

  it("uses a plain gas price on BNB Chain so the sweep empties the wallet", () => {
    const plan = buildEvmRescue({ ...base, chain: "bsc", network: "testnet", gasPriceWei: GWEI });
    expect(plan.chainId).toBe(97);
    const t = parseTransaction(plan.txs[0].unsigned);
    expect(t.type).toBe("legacy");
    expect(BigInt(plan.txs[0].amount) + BigInt(5) * GWEI * BigInt(21_000)).toBe(ETH);
  });

  it("refuses unsafe or impossible escapes", () => {
    expect(() => buildEvmRescue({ ...base, to: owner.address })).toThrow(EvmRescueError);
    expect(() => buildEvmRescue({ ...base, to: "bc1qxyz" })).toThrow(/0x/);
    expect(() => buildEvmRescue({ ...base, balanceWei: BigInt(1000) })).toThrow(/fee/);
  });

  it("raises the fee cap with the speed", () => {
    expect(feeCapWei("ethereum", BigInt(10) * GWEI, "highest")).toBe(BigInt(150) * GWEI);
    expect(feeCapWei("bsc", GWEI, "normal")).toBe(GWEI);
  });

  it("gives a cast command that signs without sending", () => {
    const plan = buildEvmRescue({ ...base, tokens: [{ ...usdt, balance: "5000000" }] });
    expect(castCommand(plan, plan.txs[0])).toContain(`"transfer(address,uint256)" ${safe} 5000000`);
    expect(castCommand(plan, plan.txs[1])).toMatch(/^cast mktx .* --value \d+ --nonce 8 .* --chain 1 --interactive$/);
  });
});

describe("checkEvmRescue", () => {
  const plan = buildEvmRescue({ ...base, tokens: [{ ...usdt, balance: "5000000" }] });

  it("accepts the owner's signatures, in any order", async () => {
    const signed = await signAll(plan);
    const r = await checkEvmRescue([...signed].reverse(), plan);
    expect(r).toMatchObject({ ok: true, problems: [] });
    expect(r.signed).toEqual(signed);
    expect(r.hashes).toHaveLength(2);
  });

  it("rejects signatures from another wallet", async () => {
    const r = await checkEvmRescue(await signAll(plan, thief), plan);
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toMatch(/different wallet/);
  });

  it("rejects a sweep redirected to someone else", async () => {
    const signed = await signAll(plan, owner, (t, i) => (i === 1 ? { ...t, to: thief.address } : t));
    expect((await checkEvmRescue(signed, plan)).problems.join(" ")).toMatch(/coin transfer does not pay only your safe address/);
  });

  it("rejects a token transfer redirected to someone else", async () => {
    const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
    const data = encodeFunctionData({ abi, functionName: "transfer", args: [thief.address, BigInt(5000000)] }) as Hex;
    const signed = await signAll(plan, owner, (t, i) => (i === 0 ? { ...t, data } : t));
    expect((await checkEvmRescue(signed, plan)).problems.join(" ")).toMatch(/USDT transfer does not pay only your safe address/);
  });

  it("rejects a lower fee cap, a wrong chain and a missing transaction", async () => {
    const cheap = await signAll(plan, owner, (t) => ({ ...t, maxFeePerGas: GWEI, maxPriorityFeePerGas: GWEI }) as TransactionSerializable);
    expect((await checkEvmRescue(cheap, plan)).problems.join(" ")).toMatch(/fee cap is lower/);
    const other = await signAll(plan, owner, (t) => ({ ...t, chainId: 56 }));
    expect((await checkEvmRescue(other, plan)).problems.join(" ")).toMatch(/different network/);
    const [first] = await signAll(plan);
    expect((await checkEvmRescue([first], plan)).problems.join(" ")).toMatch(/missing/);
  });

  it("rejects unsigned and unreadable input", async () => {
    expect((await checkEvmRescue([plan.txs[0].unsigned], plan)).problems.join(" ")).toMatch(/not signed/);
    expect((await checkEvmRescue(["hello"], plan)).ok).toBe(false);
  });
});
