"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Mark } from "./Mark";
import { Steps } from "./Steps";
import { NAME } from "@/lib/brand";
import { atRiskUsd, CHAIN_NAME, type Result } from "@/lib/exposure";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const coins = (n: number, symbol: string) => `${n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 4 })} ${symbol}`;

function summary(results: Result[]): string {
  const exposed = results.filter((r) => r.verdict === "exposed");
  const upgrade = results.filter((r) => r.verdict === "upgrade");
  const total = atRiskUsd(results);
  if (exposed.length) {
    const n = exposed.length === 1 ? "1 wallet is" : `${exposed.length} wallets are`;
    return total > 0 ? `${n} at risk, holding ${usd(total)}.` : `${n} at risk.`;
  }
  if (upgrade.length) return "Nothing at risk to rescue. Your NEAR account can be upgraded.";
  if (results.some((r) => r.verdict === "unknown")) return "We couldn't check everything. Try again in a minute.";
  if (results.every((r) => r.verdict === "invalid")) return "We didn't recognise those addresses.";
  return "Nothing at risk right now.";
}

function nextStep(r: Result): string | null {
  if (r.verdict === "exposed" && r.chain !== "bitcoin") return "Next: seal an escape for this wallet. Ethereum and BNB Chain escapes open in the next release.";
  if (r.verdict === "upgrade") return "Next: add a quantum-safe key. The NEAR upgrade opens in the next release.";
  if (r.verdict === "hidden" && r.chain !== "near") return "Keep it that way: don't send from this wallet until it has an escape sealed.";
  return null;
}

export function Scanner() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  async function check() {
    if (!text.trim()) {
      setError("Paste at least one wallet address first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json()) as { results?: Result[]; error?: string };
      if (!res.ok || !body.results) throw new Error(body.error ?? "The check didn't finish. Try again.");
      setResults(body.results);
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="wrap app-top">
        <Link href="/" className="brand">
          <Mark />
          <span>{NAME.toUpperCase()}</span>
        </Link>
      </header>

      <main className="wrap screen">
        <Steps current={0} />

        <div>
          <h1>Check your wallets</h1>
          <p className="intro">
            Paste the addresses you want to protect. We only read public blockchain data: no sign-in, no keys, nothing
            saved.
          </p>
        </div>

        <div className="paste">
          <label htmlFor="addresses">Your wallet addresses</label>
          <span className="hint" id="addresses-hint">
            Bitcoin, Ethereum, BNB Chain or NEAR. One per line, up to 20.
          </span>
          <textarea
            id="addresses"
            aria-describedby="addresses-hint"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) check();
            }}
            placeholder={"bc1q...\n0x...\nyourname.near"}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={check} disabled={busy}>
              {busy ? "Checking..." : "Check them"}
            </button>
            <span className="privacy">Takes a few seconds.</span>
          </div>
        </div>

        {results && (
          <section aria-labelledby="results-title" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 id="results-title" className="summary" tabIndex={-1} ref={resultsRef}>
              {summary(results)}
            </h2>
            <ul className="results">
              {results.map((r) => (
                <li key={`${r.input}-${r.chain}`} className={`result ${r.verdict}`}>
                  <div>
                    <div className="verdict">{r.headline}</div>
                    <div className="where">
                      {r.chain ? CHAIN_NAME[r.chain] : "Unrecognised"}
                      {r.network === "testnet" ? " testnet" : ""}: {r.input}
                    </div>
                    <p className="why">{r.reason}</p>
                  </div>
                  {r.balance !== undefined && r.symbol && (
                    <div className="money">
                      <b>{r.usd !== undefined ? usd(r.usd) : coins(r.balance, r.symbol)}</b>
                      {r.usd !== undefined && <span>{coins(r.balance, r.symbol)}</span>}
                    </div>
                  )}
                  {r.verdict === "exposed" && r.chain === "bitcoin" && (
                    <div className="next">
                      <Link href={`/seal?address=${encodeURIComponent(r.input)}`} className="btn">
                        Seal an escape
                      </Link>
                    </div>
                  )}
                  {nextStep(r) && <div className="next">{nextStep(r)}</div>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
