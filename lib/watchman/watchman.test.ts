import { describe, expect, it } from "vitest";
import { assess, decide, type Canary, type CanaryState } from "./detect";
import { evidence, judge, parseOpinion } from "./judge";

const canaries: Canary[] = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}:0`, txid: `t${i}`, vout: 0, sats: 50e8, height: i + 1 }));
const TIP = 900_000;

function spent(n: number, opts: Partial<CanaryState> = {}): CanaryState[] {
  return canaries.map((c, i) =>
    i < n ? { id: c.id, spent: true, spendHeight: TIP - 2, destinations: ["bc1qattacker"], feeRate: 300, ...opts } : { id: c.id, spent: false },
  );
}

describe("assess", () => {
  it("is calm when every canary is still", () => {
    const a = assess(canaries, spent(0), TIP);
    expect(a).toMatchObject({ level: "calm", watched: 20, movedEver: 0 });
    expect(a.headline).toMatch(/All 20 canaries are still/);
  });

  it("watches on one move, alarms at three, releases at eight", () => {
    expect(assess(canaries, spent(1), TIP).level).toBe("watch");
    expect(assess(canaries, spent(3), TIP).level).toBe("alarm");
    expect(assess(canaries, spent(8), TIP).level).toBe("release");
  });

  it("ignores old moves outside the window, and counts the mempool as recent", () => {
    expect(assess(canaries, spent(5, { spendHeight: TIP - 500 }), TIP)).toMatchObject({ level: "calm", movedEver: 5 });
    expect(assess(canaries, spent(3, { spendHeight: null }), TIP).level).toBe("alarm");
  });

  it("notices moves paying the same destination", () => {
    const a = assess(canaries, spent(3), TIP);
    expect(a.sharedDestinations).toBe(1);
    expect(a.btcMovedRecent).toBe(150);
  });
});

describe("decide", () => {
  const yes = { attack: true, confidence: 0.9, reason: "Many coins to one address.", source: "near-ai-cloud" as const };
  const no = { attack: false, confidence: 0.8, reason: "Looks like one owner.", source: "near-ai-cloud" as const };

  it("releases on overwhelming evidence even if the judgement disagrees", () => {
    expect(decide(assess(canaries, spent(8), TIP), no).release).toBe(true);
  });

  it("releases an alarm only when the judgement confirms it with confidence", () => {
    const alarm = assess(canaries, spent(3), TIP);
    expect(decide(alarm, yes).release).toBe(true);
    expect(decide(alarm, { ...yes, confidence: 0.5 }).release).toBe(false);
    expect(decide(alarm, no).release).toBe(false);
    expect(decide(alarm, null)).toMatchObject({ release: false, why: expect.stringMatching(/waiting/) });
  });

  it("never releases while calm or watching, whatever the AI says", () => {
    expect(decide(assess(canaries, spent(0), TIP), yes).release).toBe(false);
    expect(decide(assess(canaries, spent(2), TIP), yes).release).toBe(false);
  });
});

describe("judge", () => {
  const alarm = assess(canaries, spent(3), TIP);

  it("reads a JSON opinion, even wrapped in reasoning or prose", () => {
    expect(parseOpinion('<think>hmm</think>Sure: {"attack": true, "confidence": 1.4, "reason": "Shared destination."}', "m")).toEqual({
      attack: true,
      confidence: 1,
      reason: "Shared destination.",
      source: "near-ai-cloud",
      model: "m",
    });
    expect(parseOpinion("no json here", "m")).toBeNull();
    expect(parseOpinion('{"attack": "yes"}', "m")).toBeNull();
  });

  it("asks NEAR AI Cloud only on an alarm, and only with a key", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"attack":true,"confidence":0.85,"reason":"Coordinated."}' } }] }));
    }) as unknown as typeof fetch;
    expect(await judge(assess(canaries, spent(1), TIP), { NEARAI_API_KEY: "k" }, f)).toBeNull();
    expect(await judge(alarm, {}, f)).toBeNull();
    expect(calls).toBe(0);
    expect(await judge(alarm, { NEARAI_API_KEY: "k" }, f)).toMatchObject({ attack: true, confidence: 0.85 });
  });

  it("gives up quietly when NEAR AI Cloud fails", async () => {
    const f = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await judge(alarm, { NEARAI_API_KEY: "k" }, f)).toBeNull();
  });

  it("sends counts and fees, never addresses", () => {
    const e = evidence(alarm);
    expect(JSON.stringify(e)).not.toContain("bc1qattacker");
    expect(e).toMatchObject({ moved_in_last_day: 3, destinations_shared_between_moves: 1 });
  });
});
