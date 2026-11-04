import { parseAddress, splitInput } from "./address";
import { chainsFor, judge, type Result } from "./exposure";
import { factsFor, prices } from "./sources";

export const MAX_ADDRESSES = 20;

/**
 * A 0x address is checked on both Ethereum and BNB Chain. Keep only the chains where it
 * holds something, or just Ethereum if it is empty on both.
 */
export function tidyEvm(results: Result[]): Result[] {
  return results.filter((r) => {
    if (r.chain !== "ethereum" && r.chain !== "bsc") return true;
    if (r.verdict !== "empty") return true;
    const twin = results.find((o) => o.input === r.input && o.chain !== r.chain && (o.chain === "ethereum" || o.chain === "bsc"));
    if (!twin || twin.verdict !== "empty") return !twin;
    return r.chain === "ethereum";
  });
}

/** Check every pasted address on every chain it belongs to. */
export async function scan(text: string, f: typeof fetch = fetch): Promise<Result[]> {
  const inputs = splitInput(text).slice(0, MAX_ADDRESSES);
  const usd = await prices(f).catch(() => ({}) as Awaited<ReturnType<typeof prices>>);
  const jobs = inputs.flatMap((input) => {
    const parsed = parseAddress(input);
    const chains = chainsFor(parsed);
    if (!chains.length) return [Promise.resolve(judge(parsed, null, {}))];
    return chains.map(async (chain) => judge(parsed, chain, await factsFor(parsed, chain, f), usd[chain]));
  });
  return tidyEvm(await Promise.all(jobs));
}
