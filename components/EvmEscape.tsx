"use client";

import { useState } from "react";
import { NAME, SLUG } from "@/lib/brand";
import { VaultSeal } from "./VaultSeal";
import { CHAINS, castCommand, type EvmCheck, type EvmPlan, type PlannedTx } from "@/lib/evm/rescue";

const units = (amount: string, decimals: number, symbol: string) => {
  const v = Number(BigInt(amount)) / 10 ** decimals;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: decimals > 6 ? 6 : decimals })} ${symbol}`;
};
const gwei = (wei: string) => `${(Number(BigInt(wei)) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} gwei`;

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function describe(t: PlannedTx) {
  return t.kind === "token" ? `Send ${units(t.amount, t.decimals, t.symbol)}` : `Send the rest: ${units(t.amount, 18, t.symbol)}`;
}

export function EvmEscape({
  plan,
  onRestart,
  download,
}: {
  plan: EvmPlan;
  onRestart: () => void;
  download: (name: string, data: BlobPart, type?: string) => void;
}) {
  const [signed, setSigned] = useState("");
  const [check, setCheck] = useState<EvmCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chain = CHAINS[plan.chain][plan.network];

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rescue/evm/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, signed }),
      });
      const body = (await res.json()) as EvmCheck & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The check didn't finish. Try again.");
      setCheck(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (check?.ok) {
    return (
      <>
        <div>
          <h1>Your escape is ready</h1>
          <p className="intro">
            {check.signed.length === 1 ? "It is" : `All ${check.signed.length} transactions are`} signed and checked. They
            can only move your coins to {plan.to}, and nowhere else.
          </p>
        </div>
        <dl className="facts">
          <div><dt>Network</dt><dd>{chain.name}</dd></div>
          <div><dt>From</dt><dd>{plan.from}</dd></div>
          <div><dt>To your safe address</dt><dd>{plan.to}</dd></div>
          {plan.txs.map((t, i) => (
            <div key={t.nonce}><dt>{`Step ${i + 1}`}</dt><dd>{describe(t)}</dd></div>
          ))}
          <div><dt>Fee cap</dt><dd>{gwei(plan.feeCapWei)}</dd></div>
        </dl>
        <VaultSeal chain={plan.chain} network={plan.network} txid={check.hashes[0] ?? ""} txs={check.signed} />
        <p className="privacy">
          Also keep a copy yourself. The file is harmless if someone else finds it: it can only move your coins to your own
          safe address.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() =>
              download(
                `${SLUG}-escape-${plan.chain}-${check.hashes[0]?.slice(2, 10)}.json`,
                JSON.stringify({ kind: `${SLUG}-evm-escape`, chain: plan.chain, network: plan.network, chain_id: plan.chainId, from: plan.from, to: plan.to, signed_txs: check.signed, hashes: check.hashes }, null, 2),
                "application/json",
              )
            }
          >
            Download my escape
          </button>
          <button type="button" className="btn btn-quiet" onClick={onRestart}>
            Seal another wallet
          </button>
        </div>
        <p className="privacy">
          If this wallet sends anything else first, or its balances change, this escape stops covering it. Come back and
          seal a new one.
        </p>
      </>
    );
  }

  return (
    <>
      <div>
        <h1>Sign it offline</h1>
        <p className="intro">
          This escape moves everything on {chain.name} to your safe address in {plan.txs.length}{" "}
          {plan.txs.length === 1 ? "step" : "steps"}. Browser wallets such as MetaMask send as soon as they sign, so sign
          with a tool that signs without sending.
        </p>
      </div>

      <ol className="todo">
        <li>
          Install Foundry&apos;s <code>cast</code> (getfoundry.sh), or use any wallet that can sign without sending.
        </li>
        <li>Run each command below on your own computer. It asks for your key there; nothing reaches {NAME}.</li>
        <li>Paste every signed result below, one per line.</li>
      </ol>

      <ul className="tx-list">
        {plan.txs.map((t, i) => (
          <li key={t.nonce}>
            <b>
              Step {i + 1}: {describe(t)}
            </b>
            <pre className="cmd">{castCommand(plan, t)}</pre>
            <div className="actions">
              <CopyButton text={castCommand(plan, t)} label="Copy command" />
              <details>
                <summary>For other signing tools</summary>
                <pre className="cmd">{t.unsigned}</pre>
              </details>
            </div>
          </li>
        ))}
      </ul>

      <div className="paste">
        <label htmlFor="signed-evm">Paste the signed transactions</label>
        <span className="hint">Each starts with 0x. One per line, in any order.</span>
        <textarea id="signed-evm" value={signed} onChange={(e) => setSigned(e.target.value)} rows={4} spellCheck={false} placeholder="0x02f8..." />
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
        <button type="button" className="btn btn-quiet" onClick={onRestart}>
          Start over
        </button>
      </div>
    </>
  );
}
