import { NextResponse } from "next/server";
import { parseAddress } from "@/lib/address";
import { buildRescue, FEE_SPEEDS, RescueError, rescueFeeRate, type FeeSpeed } from "@/lib/btc/rescue";
import { bitcoinEverUsed, bitcoinFastestFee, bitcoinUtxos, TooManyCoinsError } from "@/lib/sources";

/**
 * POST { from, to, speed } → an unsigned rescue (PSBT) sweeping every coin at `from` to `to`.
 * Read-only lookups on mempool.space; nothing is signed or sent.
 */
export async function POST(req: Request) {
  let body: { from?: string; to?: string; speed?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with from, to and speed." }, { status: 400 });
  }
  const from = parseAddress(String(body.from ?? ""));
  const to = parseAddress(String(body.to ?? ""));
  const speed = (body.speed && body.speed in FEE_SPEEDS ? body.speed : "high") as FeeSpeed;
  if (from.chain !== "bitcoin") return NextResponse.json({ error: "Enter the Bitcoin address you want to rescue." }, { status: 400 });
  if (to.chain !== "bitcoin") return NextResponse.json({ error: "Enter a Bitcoin address for your safe wallet." }, { status: 400 });

  try {
    const [used, utxos, fastest] = await Promise.all([bitcoinEverUsed(to), bitcoinUtxos(from), bitcoinFastestFee(from.network)]);
    if (used) {
      return NextResponse.json(
        { error: "That safe address has been used before, so its key may already be public. Make a brand-new address in your wallet." },
        { status: 400 },
      );
    }
    const plan = buildRescue({ from: from.address, to: to.address, utxos, feeRate: rescueFeeRate(fastest, speed) });
    return NextResponse.json({ plan, fastestToday: fastest, speed });
  } catch (e) {
    if (e instanceof RescueError || e instanceof TooManyCoinsError) return NextResponse.json({ error: e.message }, { status: 400 });
    const detail = e instanceof Error ? e.message.slice(0, 200) : undefined;
    return NextResponse.json({ error: "We couldn't reach the Bitcoin network just now. Try again in a minute.", detail }, { status: 502 });
  }
}
