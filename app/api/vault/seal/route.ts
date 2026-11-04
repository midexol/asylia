import { NextResponse } from "next/server";
import { VAULT } from "@/lib/vault/config";
import { callVault, VaultUnavailable } from "@/lib/vault/outlayer";

export const maxDuration = 60;

/**
 * POST { sealed } → the vault's answer and the testnet transaction that carried it.
 * `sealed` is an escape already encrypted in the browser to the vault's key: this server
 * cannot read it, and neither can anyone watching the chain.
 */
export async function POST(req: Request) {
  let sealed = "";
  try {
    sealed = String(((await req.json()) as { sealed?: unknown }).sealed ?? "");
  } catch {
    return NextResponse.json({ error: "Send JSON with sealed." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9+/=]{80,60000}$/.test(sealed)) {
    return NextResponse.json({ error: "That isn't a sealed escape." }, { status: 400 });
  }
  try {
    const { hash, answer, failure } = await callVault({ op: "seal", sealed });
    if (failure || !answer) {
      return NextResponse.json({ error: "The vault didn't answer. Try again in a minute.", tx: VAULT.explorer(hash) }, { status: 502 });
    }
    if (answer.ok !== true) {
      return NextResponse.json({ error: `The vault refused it: ${String(answer.error ?? "unknown reason")}.`, tx: VAULT.explorer(hash) }, { status: 400 });
    }
    return NextResponse.json({ sealed: answer.sealed, count: answer.count, tx: VAULT.explorer(hash), vault: VAULT.project });
  } catch (e) {
    if (e instanceof VaultUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: "We couldn't reach the vault just now. Try again in a minute." }, { status: 502 });
  }
}
