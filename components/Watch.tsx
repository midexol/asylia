"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Mark } from "./Mark";
import { Steps } from "./Steps";
import { NAME } from "@/lib/brand";
import type { Assessment, Decision, Opinion } from "@/lib/watchman/detect";

interface Status {
  network: string;
  simulated: boolean;
  checkedAt: string;
  tip: number;
  assessment: Assessment;
  opinion: Opinion | null;
  ai?: "answered" | "no-answer" | "off" | "not-needed";
  decision: Decision & { wouldRelease?: boolean };
  canaries: { id: string; height?: number; sats: number; spent: boolean }[];
  error?: string;
}

const LEVEL_WORD = { calm: "Calm", watch: "Watching", alarm: "Alarm", release: "Releasing" } as const;

export function Watch() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [simulate, setSimulate] = useState(false);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/watch/status?network=mainnet${simulate ? "&simulate=8" : ""}`, { cache: "no-store" });
      const body = (await res.json()) as Status;
      if (!res.ok) throw new Error(body.error ?? "The watchman couldn't check just now.");
      setStatus(body);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The watchman couldn't check just now.");
    } finally {
      setBusy(false);
    }
  }, [simulate]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const a = status?.assessment;
  const btcWatched = status ? status.canaries.reduce((s, c) => s + c.sats, 0) / 1e8 : 0;

  return (
    <>
      <header className="wrap app-top">
        <Link href="/" className="brand">
          <Mark />
          <span>{NAME}</span>
        </Link>
      </header>

      <main className="wrap screen">
        <Steps current={3} />

        <div>
          <h1>The watchman</h1>
          <p className="intro">
            It watches {status?.canaries.length ?? 60} Bitcoin block rewards from 2009 whose keys have always been public.
            If a quantum computer arrives, these move first. When enough of them move together, your escapes go out.
          </p>
        </div>

        {simulate && (
          <div className="warn" role="status">
            <b>Simulated attack.</b> Eight canaries are shown as moving to one address. This is a demo: nothing is
            released.
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        {a && status && (
          <>
            <section className={`level level-${a.level}`} aria-live="polite">
              <span className="level-word">{status.simulated && a.level === "release" ? "Would release" : LEVEL_WORD[a.level]}</span>
              <p>{status.simulated ? a.headline.replace("releasing escapes", "escapes would be released") : a.headline}</p>
            </section>

            <dl className="facts">
              <div><dt>Canaries watched</dt><dd>{a.watched}, holding {btcWatched.toLocaleString("en-US")} BTC</dd></div>
              <div><dt>Moved in the last day</dt><dd>{a.recent.length}</dd></div>
              <div><dt>Moved to the same place</dt><dd>{a.sharedDestinations === 0 ? "None" : `${a.sharedDestinations} shared destination${a.sharedDestinations > 1 ? "s" : ""}`}</dd></div>
              <div><dt>Judgement</dt><dd>{status.opinion ? `${status.opinion.attack ? "Attack" : "Not an attack"} (${Math.round(status.opinion.confidence * 100)}% sure): ${status.opinion.reason}` : a.level === "calm" || a.level === "watch" ? "Not needed while things are calm." : status.ai === "off" ? "NEAR AI Cloud isn't switched on for this site, so the rules decide alone." : status.ai === "no-answer" ? "NEAR AI Cloud didn't answer, so the rules decide alone." : "Waiting for NEAR AI Cloud."}</dd></div>
              <div><dt>Escapes</dt><dd>{status.simulated ? (status.decision.wouldRelease ? "Would be released now" : "Would stay sealed") : status.decision.release ? "Released" : "Sealed"}</dd></div>
              <div><dt>Last check</dt><dd>{new Date(status.checkedAt).toLocaleTimeString()} at block {status.tip.toLocaleString("en-US")}</dd></div>
            </dl>

            <section aria-labelledby="canaries-title" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 id="canaries-title" className="subhead">Each canary, by the 2009 block it came from</h2>
              <ul className="canaries">
                {status.canaries.map((c) => (
                  <li key={c.id} className={c.spent ? "moved" : ""}>
                    <b>{c.height}</b>
                    <span>{c.spent ? "Moved" : "Still"}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="subhead">How it decides</h2>
              <ol className="todo">
                <li>One canary moves in a day: it watches closely. Owners sometimes move old coins.</li>
                <li>Three move in a day: it raises the alarm and asks a model on NEAR AI Cloud whether the moves look like an attack. A confident yes releases your escapes.</li>
                <li>Eight move in a day: it releases your escapes, whatever the judgement says.</li>
              </ol>
              <p className="privacy">The watchman can release escapes, but it can never change where they pay. Each one was signed by you, to your own safe address.</p>
            </section>
          </>
        )}

        <div className="actions">
          <button type="button" className="btn btn-quiet" onClick={() => setSimulate(!simulate)} disabled={busy}>
            {simulate ? "Back to the live view" : "Show a simulated attack"}
          </button>
          {busy && <span className="privacy">Checking...</span>}
        </div>
      </main>
    </>
  );
}
