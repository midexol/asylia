import { NextResponse } from "next/server";
import { checkRescue, type RescuePlan } from "@/lib/btc/rescue";

/** POST { plan, signed } → whether the signed rescue pays only the safe address, with its details. */
export async function POST(req: Request) {
  let body: { plan?: RescuePlan; signed?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with plan and signed." }, { status: 400 });
  }
  if (!body.plan?.psbt || !body.signed?.trim()) {
    return NextResponse.json({ error: "Paste the signed rescue from your wallet first." }, { status: 400 });
  }
  return NextResponse.json(checkRescue(body.signed, body.plan));
}
