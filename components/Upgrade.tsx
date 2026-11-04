"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mark } from "./Mark";
import { Steps } from "./Steps";
import { NAME } from "@/lib/brand";
import type { UpgradeState } from "@/lib/near/upgrade";
import type { NearKey } from "@/lib/sources";

interface Account {
  account: string;
  network: "mainnet" | "testnet";
  keys: NearKey[];
  state: UpgradeState;
  commands: { install: string; signIn: string; addKey: string; listKeys: string };
}

const PROOF = {
  account: "https://testnet.nearblocks.io/address/lifeboat-f86cd6e7d4.testnet",
  tx: "https://testnet.nearblocks.io/txns/DVAmKNmf8qmjGJ4fQAnyMGc4AVgjxZTbZPVbwCYZgL2o",
};

function Command({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li>
      <b>{label}</b>
      <pre className="cmd">{text}</pre>
      <div className="actions">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </li>
  );
}

function KeyList({ keys }: { keys: NearKey[] }) {
  return (
    <ul className="keys">
      {keys.map((k) => (
        <li key={k.publicKey} className={k.kind === "quantum-safe" ? "safe" : ""}>
          <b>{k.kind === "quantum-safe" ? "Quantum-safe key" : "Classic key"}</b>
          <span>
            {k.fullAccess ? "Full access" : "Limited to one app"}: {k.publicKey.slice(0, 28)}…
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Upgrade() {
  const params = useSearchParams();
  const [input, setInput] = useState(params.get("account") ?? "");
  const [acct, setAcct] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/near/keys?account=${encodeURIComponent(input.trim())}`, { cache: "no-store" });
      const body = (await res.json()) as Account & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "We couldn't check that account.");
      setAcct(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't check that account.");
    } finally {
      setBusy(false);
    }
  }

  const classic = acct?.keys.filter((k) => k.kind === "classic" && k.fullAccess).length ?? 0;

  return (
    <>
      <header className="wrap app-top">
        <Link href="/" className="brand">
          <Mark />
          <span>{NAME.toUpperCase()}</span>
        </Link>
      </header>

      <main className="wrap screen">
        <Steps current={2} />

        <div>
          <h1>Upgrade your NEAR account</h1>
          <p className="intro">
            NEAR lets an account add a quantum-safe key. Same account, same coins, nothing moves. Start by checking which
            keys yours has.
          </p>
        </div>

        <div className="paste">
          <label htmlFor="account">Your NEAR account</label>
          <span className="hint">For example yourname.near, or yourname.testnet to try it on the test network.</span>
          <input
            id="account"
            className="field-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && check()}
            placeholder="yourname.near"
            spellCheck={false}
            autoCapitalize="off"
          />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn" disabled={busy || !input.trim()} onClick={check}>
              {busy ? "Checking..." : acct ? "Check again" : "Check my account"}
            </button>
          </div>
        </div>

        {acct && (acct.state === "upgraded" || acct.state === "upgraded-only") && (
          <>
            <div className="vault-box sealed" role="status">
              <b>{acct.account} is quantum-safe.</b>
              <span>
                It has a quantum-safe key.
                {acct.state === "upgraded"
                  ? ` It still has ${classic} classic ${classic === 1 ? "key" : "keys"} too; while ${classic === 1 ? "it stays" : "they stay"}, a quantum attacker could use ${classic === 1 ? "it" : "them"}. Remove ${classic === 1 ? "it" : "them"} only once you have tested signing with the new key.`
                  : " Its classic full-access keys are gone, so only the quantum-safe key can move its coins."}
              </span>
            </div>
            <KeyList keys={acct.keys} />
          </>
        )}

        {acct && acct.state === "needs-upgrade" && (
          <>
            <section className="level level-watch">
              <span className="level-word">Not yet</span>
              <p>
                {acct.account} has {classic} classic {classic === 1 ? "key" : "keys"} and no quantum-safe key.
              </p>
            </section>
            <KeyList keys={acct.keys} />

            <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="subhead">Add the quantum-safe key in three steps</h2>
              <p className="intro" style={{ margin: 0 }}>
                Run these on your own computer with NEAR&apos;s official command-line tool. It makes the new key there and
                keeps it in your computer&apos;s keychain; this website never sees it.
              </p>
              <ol className="tx-list">
                <Command label="1. Install the NEAR tool (once)" text={acct.commands.install} />
                <Command label="2. Sign in with your current wallet (once)" text={acct.commands.signIn} />
                <Command label="3. Add the quantum-safe key" text={acct.commands.addKey} />
              </ol>
              <p className="privacy">
                Then come back and press <b>Check again</b>. Adding the key costs a fraction of a cent in NEAR. Keep your
                computer&apos;s keychain backed up: the new key lives there.
              </p>
            </section>
          </>
        )}

        {acct && acct.state === "no-full-access" && (
          <div className="warn" role="status">
            <b>This account has no full-access keys we can see.</b> It may be a contract or locked account. Only a
            full-access key can add a new one.
          </div>
        )}

        <p className="privacy">
          Tested on NEAR testnet: <a href={PROOF.account}>an account</a> added a quantum-safe key and{" "}
          <a href={PROOF.tx}>signed a transaction with it</a>.
        </p>
      </main>
    </>
  );
}
