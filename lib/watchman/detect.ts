// The watchman's rules. Canaries are coins whose public keys have been on the blockchain
// since 2009 and that nobody has touched since: the first coins a quantum computer could take.
// One moving could be its owner. Many moving close together, to shared destinations, is an attack.
// Pure functions: facts in, an assessment out.

export interface Canary {
  id: string; // "txid:vout"
  txid: string;
  vout: number;
  sats: number;
  height?: number; // block it was mined in
}

/** What the chain says about one canary right now. */
export interface CanaryState {
  id: string;
  spent: boolean;
  spendTxid?: string;
  spendHeight?: number | null; // null = waiting in the mempool
  destinations?: string[]; // addresses the spending transaction paid
  feeRate?: number; // sat/vB of the spending transaction
}

export type Level = "calm" | "watch" | "alarm" | "release";

export interface Thresholds {
  windowBlocks: number; // how far back a move counts as recent (144 blocks = about a day)
  alarmCount: number; // recent moves that raise the alarm and ask for a judgement
  releaseCount: number; // recent moves that release every escape, whatever the judgement
}

export const DEFAULT_THRESHOLDS: Thresholds = { windowBlocks: 144, alarmCount: 3, releaseCount: 8 };

export interface Assessment {
  level: Level;
  watched: number;
  movedEver: number;
  recent: CanaryState[];
  sharedDestinations: number; // destinations paid by more than one recent canary spend
  btcMovedRecent: number;
  headline: string;
}

export function assess(
  canaries: Canary[],
  states: CanaryState[],
  tipHeight: number,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Assessment {
  const byId = new Map(states.map((s) => [s.id, s]));
  const moved = canaries.map((c) => byId.get(c.id)).filter((s): s is CanaryState => !!s?.spent);
  const recent = moved.filter((s) => s.spendHeight == null || tipHeight - s.spendHeight < t.windowBlocks);

  const seen = new Map<string, number>();
  for (const s of recent) for (const d of new Set(s.destinations ?? [])) seen.set(d, (seen.get(d) ?? 0) + 1);
  const sharedDestinations = [...seen.values()].filter((n) => n > 1).length;

  const sats = new Map(canaries.map((c) => [c.id, c.sats]));
  const btcMovedRecent = recent.reduce((sum, s) => sum + (sats.get(s.id) ?? 0), 0) / 1e8;

  const n = recent.length;
  const level: Level = n >= t.releaseCount ? "release" : n >= t.alarmCount ? "alarm" : n >= 1 ? "watch" : "calm";
  const headline =
    level === "calm"
      ? `All ${canaries.length} canaries are still. No sign of an attack.`
      : level === "watch"
        ? `${n === 1 ? "One canary has" : `${n} canaries have`} moved in the last day. Watching closely.`
        : level === "alarm"
          ? `${n} canaries moved in the last day. Asking for a judgement.`
          : `${n} canaries moved in the last day. That looks like an attack: releasing escapes.`;

  return { level, watched: canaries.length, movedEver: moved.length, recent, sharedDestinations, btcMovedRecent, headline };
}

export interface Opinion {
  attack: boolean;
  confidence: number; // 0 to 1
  reason: string;
  source: "near-ai-cloud" | "none";
  model?: string;
}

export interface Decision {
  release: boolean;
  why: string;
}

/**
 * Whether to release every sealed escape. The rules can release on their own when the
 * evidence is overwhelming; the AI can only confirm an alarm, never cause one or block a
 * release. Its key can release escapes but never choose where they pay.
 */
export function decide(a: Assessment, opinion: Opinion | null): Decision {
  if (a.level === "release") return { release: true, why: a.headline };
  if (a.level === "alarm") {
    if (opinion?.attack && opinion.confidence >= 0.7) {
      return { release: true, why: `${a.headline} The judgement agreed: ${opinion.reason}` };
    }
    return {
      release: false,
      why: opinion ? `Alarm raised, but the judgement did not call it an attack: ${opinion.reason}` : "Alarm raised; waiting for a judgement.",
    };
  }
  return { release: false, why: a.headline };
}
