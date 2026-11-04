import { NextResponse } from "next/server";
import { buildEvmRescue, EvmRescueError, TOKENS, type EvmChain, type EvmNetwork, type EvmSpeed } from "@/lib/evm/rescue";
import { evmHasSent, evmRescueFacts } from "@/lib/sources";

/** POST { from, to, chain, network, speed } → unsigned escape transactions. Read-only lookups. */
export async function POST(req: Request) {
  let body: { from?: string; to?: string; chain?: string; network?: string; speed?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with from, to, chain, network and speed." }, { status: 400 });
  }
  const chain = (body.chain === "bsc" ? "bsc" : "ethereum") as EvmChain;
  const network = (body.network === "testnet" ? "testnet" : "mainnet") as EvmNetwork;
  const speed = (["normal", "high", "highest"].includes(String(body.speed)) ? body.speed : "high") as EvmSpeed;
  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(from) || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json({ error: "Enter both addresses as 0x addresses." }, { status: 400 });
  }
  try {
    const [facts, sent] = await Promise.all([evmRescueFacts(from, chain, network, TOKENS[chain]), evmHasSent(to, chain, network)]);
    if (sent) {
      return NextResponse.json(
        { error: "That safe address has sent transactions before, so its key is already public. Make a brand-new address." },
        { status: 400 },
      );
    }
    const plan = buildEvmRescue({ chain, network, from, to, speed, ...facts });
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof EvmRescueError) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "We couldn't reach the network just now. Try again in a minute." }, { status: 502 });
  }
}
