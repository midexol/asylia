"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mark } from "./Mark";
import { Steps } from "./Steps";
import { NAME } from "@/lib/brand";
import type { CheckResult, FeeSpeed, RescuePlan } from "@/lib/btc/rescue";
import type { EvmChain, EvmNetwork, EvmPlan } from "@/lib/evm/rescue";
import { EvmEscape } from "./EvmEscape";
import { VaultSeal } from "./VaultSeal";

const SPEEDS: { key: FeeSpeed; label: string; note: string }[] = [
  { key: "normal", label: "Normal", note: "Today's fastest fee. Cheapest, but may stall on a busy day." },
  { key: "high", label: "High", note: "Five times today's fastest. Recommended." },
  { key: "highest", label: "Highest", note: "Fifteen times today's fastest, for large balances." },
];

const btc = (sats: number) => `${(sats / 1e8).toLocaleString("en-US", { maximumFractionDigits: 8 })} BTC`;
const sats = (n: number) => `${n.toLocaleString("en-US")} sats`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again.");
  return json;
}

function download(name: string, data: BlobPart, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Sealer() {
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get("address") ?? "");
  const [to, setTo] = useState("");
  const [speed, setSpeed] = useState<FeeSpeed>("high");
  const [plan, setPlan] = useState<RescuePlan | null>(null);
  const [evmPlan, setEvmPlan] = useState<EvmPlan | null>(null);
  const [chain, setChain] = useState<EvmChain>(params.get("chain") === "bsc" ? "bsc" : "ethereum");
  const [network, setNetwork] = useState<EvmNetwork>(params.get("network") === "testnet" ? "testnet" : "mainnet");
  const isEvm = /^0x/i.test(from.trim());
  const [signed, setSigned] = useState("");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function prepare() {
    setBusy(true);
    setError("");
    setCheck(null);
    try {
      if (isEvm) {
        const r = await post<{ plan: EvmPlan }>("/api/rescue/evm/prepare", { from: from.trim(), to: to.trim(), speed, chain, network });
        setEvmPlan(r.plan);
      } else {
        const r = await post<{ plan: RescuePlan }>("/api/rescue/btc/prepare", { from: from.trim(), to: to.trim(), speed });
        setPlan(r.plan);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      setCheck(await post<CheckResult>("/api/rescue/btc/check", { plan, signed }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPlan(null);
    setEvmPlan(null);
    setSigned("");
    setCheck(null);
    setError("");
  }

  return (
    <>
      <header className="wrap app-top">
        <Link href="/" className="brand">
          <Mark />
          <span>{NAME}</span>
        </Link>
      </header>

      <main className="wrap screen">
        <Steps current={1} />

        {evmPlan && <EvmEscape plan={evmPlan} onRestart={startOver} download={download} />}

        {!plan && !evmPlan && (
          <>
            <div>
              <h1>Seal an escape</h1>
              <p className="intro">
                You sign a transaction that moves everything in an exposed wallet to a fresh, safe address. It waits,
                unsent, until it is needed. {NAME} never sees your keys.
              </p>
            </div>

            <div className="paste">
              <label htmlFor="from">The wallet to rescue</label>
              <span className="hint">The address the scan marked as at risk: Bitcoin, Ethereum or BNB Chain.</span>
              <input id="from" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="bc1q... or 0x..." spellCheck={false} autoCapitalize="off" />
            </div>

            {isEvm && (
              <div className="pick-row">
                <fieldset className="speeds">
                  <legend>Which network?</legend>
                  <div className="speed-row">
                    {([["ethereum", "Ethereum"], ["bsc", "BNB Chain"]] as const).map(([k, label]) => (
                      <label key={k} className={`speed ${chain === k ? "on" : ""}`}>
                        <input type="radio" name="chain" value={k} checked={chain === k} onChange={() => setChain(k)} />
                        <b>{label}</b>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="speeds">
                  <legend>Real coins or a test?</legend>
                  <div className="speed-row">
                    {([["mainnet", "Real coins"], ["testnet", "Testnet"]] as const).map(([k, label]) => (
                      <label key={k} className={`speed ${network === k ? "on" : ""}`}>
                        <input type="radio" name="network" value={k} checked={network === k} onChange={() => setNetwork(k)} />
                        <b>{label}</b>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}


            <div className="paste">
              <label htmlFor="to">Where the coins should go</label>
              <span className="hint">
                Make a brand-new receiving address in a wallet you control, ideally a different one. It must never have
                been used.
              </span>
              <input id="to" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="A fresh address" spellCheck={false} autoCapitalize="off" />
            </div>

            <fieldset className="speeds">
              <legend>How hard should it push to get through?</legend>
              <span className="hint">An escape may go out years from now, on the busiest day the network has seen.</span>
              <div className="speed-row">
                {SPEEDS.map((s) => (
                  <label key={s.key} className={`speed ${speed === s.key ? "on" : ""}`}>
                    <input type="radio" name="speed" value={s.key} checked={speed === s.key} onChange={() => setSpeed(s.key)} />
                    <b>{s.label}</b>
                    <span>{s.note}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="error" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="btn" disabled={busy || !from.trim() || !to.trim()} onClick={prepare}>
                {busy ? "Preparing..." : "Prepare my escape"}
              </button>
            </div>
          </>
        )}

        {plan && !check?.ok && (
          <>
            <div>
              <h1>Sign it in your wallet</h1>
              <p className="intro">
                This escape sends <b>{btc(plan.amount)}</b> to your safe address, with a fee of {sats(plan.fee)} (
                {plan.feeRate} sat/vB). Nothing is sent until the day it is needed.
              </p>
            </div>

            <ol className="todo">
              <li>Copy the escape below, or download it as a file.</li>
              <li>In your wallet (Sparrow, Electrum, Xverse and most others), choose to load or import a PSBT, then sign it.</li>
              <li>Paste what your wallet gives back, signed, into the box below.</li>
            </ol>

            <div className="paste">
              <label htmlFor="psbt">Your escape, unsigned</label>
              <textarea id="psbt" readOnly value={plan.psbt} className="mono-box" rows={4} onFocus={(e) => e.target.select()} />
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={async () => {
                    await navigator.clipboard.writeText(plan.psbt).catch(() => undefined);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => download("lifeboat-escape.psbt", Uint8Array.from(atob(plan.psbt), (c) => c.charCodeAt(0)))}
                >
                  Download file
                </button>
              </div>
            </div>

            <div className="paste">
              <label htmlFor="signed">Paste the signed escape</label>
              <textarea id="signed" value={signed} onChange={(e) => setSigned(e.target.value)} rows={4} spellCheck={false} placeholder="cHNidP8B... or 0200000001..." />
            </div>

            {error && <p className="error" role="alert">{error}</p>}
            {check && !check.ok && (
              <div className="warn" role="alert">
                <b>Don&apos;t seal this.</b>
                <ul>
                  {check.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="actions">
              <button type="button" className="btn" disabled={busy || !signed.trim()} onClick={verify}>
                {busy ? "Checking..." : "Check my escape"}
              </button>
              <button type="button" className="btn btn-quiet" onClick={startOver}>
                Start over
              </button>
            </div>
          </>
        )}

        {plan && check?.ok && (
          <>
            <div>
              <h1>Your escape is ready</h1>
              <p className="intro">
                It is signed and checked. It can only send {btc(check.amount ?? plan.amount)} to {plan.to}, and nowhere
                else.
              </p>
            </div>
            <dl className="facts">
              <div><dt>From</dt><dd>{plan.from}</dd></div>
              <div><dt>To your safe address</dt><dd>{plan.to}</dd></div>
              <div><dt>Amount</dt><dd>{btc(check.amount ?? plan.amount)}</dd></div>
              <div><dt>Fee</dt><dd>{sats(check.fee ?? plan.fee)}, {check.feeRate} sat/vB</dd></div>
              <div><dt>Escape ID</dt><dd>{check.txid}</dd></div>
            </dl>
            <VaultSeal chain="bitcoin" network={plan.network} txid={check.txid ?? ""} txs={check.txHex ? [check.txHex] : []} />
            <p className="privacy">
              Also keep a copy yourself. The file is harmless if someone else finds it: it can only move your coins to your
              own safe address.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() =>
                  download(
                    `lifeboat-escape-${check.txid?.slice(0, 8)}.json`,
                    JSON.stringify({ kind: "lifeboat-bitcoin-escape", network: plan.network, from: plan.from, to: plan.to, amount_sats: check.amount, fee_sats: check.fee, txid: check.txid, tx_hex: check.txHex, utxos: plan.utxos }, null, 2),
                    "application/json",
                  )
                }
              >
                Download my escape
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => { startOver(); setFrom(""); setTo(""); }}>
                Seal another wallet
              </button>
            </div>
            <p className="privacy">
              If coins later arrive at or leave {plan.from}, this escape stops covering them. Come back and seal a new one.
            </p>
          </>
        )}
      </main>
    </>
  );
}
