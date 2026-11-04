import { NextResponse } from "next/server";
import { MAX_ADDRESSES, scan } from "@/lib/scan";

/** POST { text } → one result per address and chain. Read-only lookups on public endpoints. */
export async function POST(req: Request) {
  let text = "";
  try {
    text = String(((await req.json()) as { text?: unknown }).text ?? "");
  } catch {
    return NextResponse.json({ error: "Send JSON like {\"text\": \"bc1q...\"}." }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "Paste at least one address." }, { status: 400 });
  if (text.length > 10_000) return NextResponse.json({ error: `Paste up to ${MAX_ADDRESSES} addresses at a time.` }, { status: 413 });
  return NextResponse.json({ results: await scan(text) });
}
