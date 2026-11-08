import { NextResponse } from "next/server";
import mainnet from "@/data/canaries.json";
import testnet from "@/data/canaries-testnet.json";
import { assess, decide, type Canary, type CanaryState } from "@/lib/watchman/detect";
import { FRESH_MS, lastGood, STALE_MS } from "@/lib/watchman/cache";
import { judge } from "@/lib/watchman/judge";
import { canaryStates } from "@/lib/sources";

export const revalidate = 60;

/**
 * GET /api/watch/status?network=mainnet|testnet[&simulate=N]
 * Checks every canary, applies the rules, asks NEAR AI Cloud on an alarm, and says whether
 * escapes would be released. `simulate=N` pretends the first N canaries just moved to one
 * address, for demos; the answer is marked simulated and nothing is released.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const network = url.searchParams.get("network") === "testnet" ? "testnet" : "mainnet";
  const simulate = Math.max(0, Math.min(60, Number(url.searchParams.get("simulate") ?? 0) || 0));
  const canaries = ((network === "mainnet" ? mainnet : testnet).canaries ?? []) as Canary[];
  if (!canaries.length) {
    return NextResponse.json({ network, error: "No canaries are set up on this network yet." }, { status: 404 });
  }

  let tip: number;
  let states: CanaryState[];
  let checkedAt = Date.now();
  const cached = lastGood.get(network);
  try {
    if (cached && Date.now() - cached.at < FRESH_MS) {
      ({ tip, states } = cached);
      checkedAt = cached.at;
    } else {
      ({ tip, states } = await canaryStates(canaries, network));
      lastGood.set(network, { at: checkedAt, tip, states });
    }
  } catch {
    if (cached && Date.now() - cached.at < STALE_MS) {
      ({ tip, states } = cached);
      checkedAt = cached.at;
    } else return NextResponse.json(
      { network, error: "The watchman couldn't reach the Bitcoin network just now. It will try again in a minute." },
      { status: 502 },
    );
  }
  if (simulate) {
    states = states.map((s, i) =>
      i < simulate ? { ...s, spent: true, spendHeight: null, spendTxid: "simulated", destinations: ["simulated-attacker"], feeRate: 400 } : s,
    );
  }

  const assessment = assess(canaries, states, tip);
  const opinion = await judge(assessment);
  const decision = decide(assessment, opinion);
  return NextResponse.json({
    network,
    simulated: simulate > 0,
    checkedAt: new Date(checkedAt).toISOString(),
    tip,
    assessment,
    opinion,
    decision: simulate > 0 ? { ...decision, release: false, wouldRelease: decision.release } : decision,
    canaries: canaries.map((c) => ({ ...c, spent: states.find((s) => s.id === c.id)?.spent ?? false })),
  });
}
