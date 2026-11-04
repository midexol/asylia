"use client";

import { useState } from "react";
import { escapeId, VAULT, VAULT_ACCEPTS } from "@/lib/vault/config";
import { sealFor, type EscapeForVault } from "@/lib/vault/seal";

/**
 * The last step of Seal: encrypt the checked escape in this browser to the vault's key, and
 * hand only the sealed blob to the vault. Testnet escapes only while the vault is on testnet.
 */
export function VaultSeal({ chain, network, txid, txs }: { chain: EscapeForVault["chain"]; network: "mainnet" | "testnet"; txid: string; txs: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const [proof, setProof] = useState<{ tx: string; count?: number } | null>(null);

  if (!VAULT_ACCEPTS.includes(network)) {
    return (
      <div className="vault-box">
        <b>The vault is in its testnet trial.</b>
        <span>It holds testnet escapes only for now. Download this escape and keep it safe; you can seal it once the vault opens for real coins.</span>
      </div>
    );
  }

  async function seal() {
    setState("busy");
    setError("");
    try {
      const sealed = sealFor(VAULT.pubkey, { id: escapeId(txid), chain, network, txs });
      const res = await fetch("/api/vault/seal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sealed }) });
      const body = (await res.json()) as { tx?: string; count?: number; error?: string };
      if (!res.ok || !body.tx) throw new Error(body.error ?? "The vault didn't take it. Try again.");
      setProof({ tx: body.tx, count: body.count });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The vault didn't take it. Try again.");
      setState("idle");
    }
  }

  if (state === "done" && proof) {
    return (
      <div className="vault-box sealed" role="status">
        <b>Sealed in the vault.</b>
        <span>
          It was encrypted in this browser, so only the vault can open it. The vault will send it out only if the canaries
          move like an attack. <a href={proof.tx}>See the vault&apos;s record on NEAR testnet</a>.
        </span>
      </div>
    );
  }

  return (
    <div className="vault-box">
      <b>Seal it into the vault</b>
      <span>It is encrypted here, in your browser, before it leaves. Takes about half a minute.</span>
      {error && <span className="error" role="alert">{error}</span>}
      <div className="actions">
        <button type="button" className="btn" onClick={seal} disabled={state === "busy"}>
          {state === "busy" ? "Sealing..." : "Seal into the vault"}
        </button>
      </div>
    </div>
  );
}
