import "server-only";
// A second opinion from a model on NEAR AI Cloud (OpenAI-compatible). It reads the recent
// canary moves and says whether they look like an attack or like an owner moving their coins.
import type { Assessment, Opinion } from "./detect";

export const NEARAI_URL = "https://cloud-api.near.ai/v1/chat/completions";
export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

const SYSTEM = `You watch dormant 2009 Bitcoin block rewards whose public keys are exposed. If a quantum computer
can derive private keys, these coins move first. Decide whether the recent moves look like an attack.
Signs of an attack: many unrelated canaries moving within hours, paying the same few destinations, at high fees.
Signs of an owner: one or two coins, consolidated carefully, ordinary fees.
Reply with JSON only: {"attack": true|false, "confidence": 0..1, "reason": "one plain sentence"}.`;

export function evidence(a: Assessment) {
  return {
    canaries_watched: a.watched,
    moved_in_last_day: a.recent.length,
    btc_moved_in_last_day: a.btcMovedRecent,
    destinations_shared_between_moves: a.sharedDestinations,
    moves: a.recent.slice(0, 25).map((s) => ({
      in_mempool: s.spendHeight == null,
      destinations: (s.destinations ?? []).length,
      fee_rate_sat_vb: s.feeRate ?? null,
    })),
  };
}

export function parseOpinion(text: string, model: string): Opinion | null {
  const match = text.replace(/<think>[\s\S]*?<\/think>/g, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as { attack?: unknown; confidence?: unknown; reason?: unknown };
    if (typeof o.attack !== "boolean") return null;
    const confidence = Math.min(1, Math.max(0, Number(o.confidence) || 0));
    return { attack: o.attack, confidence, reason: String(o.reason ?? "").slice(0, 300), source: "near-ai-cloud", model };
  } catch {
    return null;
  }
}

// The same evidence gets the same answer for 10 minutes, so a demo clicked over and over
// costs one call, and a key with no credit isn't retried on every page load.
const ASK_EVERY_MS = 10 * 60_000;
const answers = new Map<string, { at: number; opinion: Opinion | null }>();

/** For tests: forget remembered answers. */
export function clearJudgeCache() {
  answers.clear();
}

/** Whether a second opinion can be asked for at all on this deployment. */
export const judgeConfigured = (env: Record<string, string | undefined> = process.env) => !!env.NEARAI_API_KEY?.trim();

/** Ask only when the rules have raised an alarm; calm and watch levels need no opinion. */
export async function judge(
  a: Assessment,
  env: Record<string, string | undefined> = process.env,
  f: typeof fetch = fetch,
): Promise<Opinion | null> {
  if (a.level !== "alarm" && a.level !== "release") return null;
  if (!env.NEARAI_API_KEY?.trim()) return null;
  const k = JSON.stringify(evidence(a));
  const hit = answers.get(k);
  if (hit && Date.now() - hit.at < ASK_EVERY_MS) return hit.opinion;
  const opinion = await ask(a, env, f);
  answers.set(k, { at: Date.now(), opinion });
  return opinion;
}

async function ask(
  a: Assessment,
  env: Record<string, string | undefined> = process.env,
  f: typeof fetch = fetch,
): Promise<Opinion | null> {
  if (a.level !== "alarm" && a.level !== "release") return null;
  const key = env.NEARAI_API_KEY?.trim();
  if (!key) return null;
  const model = env.NEARAI_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const res = await f(NEARAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(evidence(a)) },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseOpinion(body.choices?.[0]?.message?.content ?? "", model);
  } catch {
    return null;
  }
}
