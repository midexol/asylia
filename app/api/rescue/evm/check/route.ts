import { NextResponse } from "next/server";
import { checkEvmRescue, type EvmPlan } from "@/lib/evm/rescue";

/** POST { plan, signed: string[] or newline-separated string } → whether the signed escape is safe to seal. */
export async function POST(req: Request) {
  let body: { plan?: EvmPlan; signed?: string | string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with plan and signed." }, { status: 400 });
  }
  const signed = Array.isArray(body.signed) ? body.signed : String(body.signed ?? "").split(/\s+/);
  if (!body.plan?.txs?.length || !signed.some((s) => s.trim())) {
    return NextResponse.json({ error: "Paste the signed transactions first, one per line." }, { status: 400 });
  }
  return NextResponse.json(await checkEvmRescue(signed, body.plan));
}
