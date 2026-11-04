import { NextResponse } from "next/server";
import { parseAddress } from "@/lib/address";
import { cliCommands, upgradeState } from "@/lib/near/upgrade";
import { nearKeys } from "@/lib/sources";

/** GET ?account=name.near → the account's keys, its upgrade state and the commands to upgrade. */
export async function GET(req: Request) {
  const p = parseAddress(new URL(req.url).searchParams.get("account") ?? "");
  if (p.chain !== "near") {
    return NextResponse.json({ error: "Enter a NEAR account, such as yourname.near or yourname.testnet." }, { status: 400 });
  }
  try {
    const keys = await nearKeys(p);
    return NextResponse.json({ account: p.address, network: p.network, keys, state: upgradeState(keys), commands: cliCommands(p.address, p.network) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/does not exist|UNKNOWN_ACCOUNT/i.test(msg)) {
      return NextResponse.json({ error: `There is no account called ${p.address} on NEAR ${p.network}.` }, { status: 404 });
    }
    return NextResponse.json({ error: "We couldn't reach NEAR just now. Try again in a minute." }, { status: 502 });
  }
}
