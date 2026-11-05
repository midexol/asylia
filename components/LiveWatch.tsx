"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = { tip: number; assessment: { level: string; watched: number; recent: unknown[] } };

const WORD: Record<string, string> = { calm: "Calm", watch: "Watching", alarm: "Alarm", release: "Release" };

// The real watchman, live on the landing page: how many of the 2009 wallets moved in the last day.
export function LiveWatch() {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/watch/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Status) => alive && setS(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const level = s?.assessment.level ?? "calm";
  return (
    <Link href="/watch" className={`live live-${s ? level : "wait"}`}>
      <span className="live-top">
        <span>Live watchman</span>
        <b>{s ? WORD[level] ?? level : failed ? "Offline" : "Checking"}</b>
      </span>
      <span className="live-big">
        {s ? s.assessment.recent.length : "–"}
        <small> of {s?.assessment.watched ?? 60}</small>
      </span>
      <span className="live-note">
        {s
          ? `old wallets moved in the last day, as of Bitcoin block ${s.tip.toLocaleString("en-US")}`
          : failed
            ? "couldn't reach the Bitcoin network just now"
            : "reading the 2009 wallets from the Bitcoin network"}
      </span>
    </Link>
  );
}
