import type { CanaryState } from "./detect";

// One canary check reads ~60 transactions from a public API, so the status route keeps the
// last good answer for a minute, and serves it for up to 30 minutes if the API is down.
export const FRESH_MS = 60_000;
export const STALE_MS = 30 * 60_000;
export const lastGood = new Map<string, { at: number; tip: number; states: CanaryState[] }>();

/** For tests: forget every cached answer. */
export function clearWatchCache() {
  lastGood.clear();
}
