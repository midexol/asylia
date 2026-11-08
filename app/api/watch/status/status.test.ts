import { afterEach, describe, expect, it, vi } from "vitest";
import mainnet from "@/data/canaries.json";
import { clearWatchCache } from "@/lib/watchman/cache";
import { GET } from "./route";

/** Fake mempool.space: every canary still, or the first `moved` spent to one address. */
function mempool(moved = 0) {
  const spentIds = new Set(mainnet.canaries.slice(0, moved).map((c) => c.txid));
  return vi.fn(async (url: string) => {
    if (url.endsWith("/blocks/tip/height")) return new Response("900000");
    const m = url.match(/\/tx\/([0-9a-f]{64})\/outspend\/0$/);
    if (m) {
      return new Response(JSON.stringify(spentIds.has(m[1]) ? { spent: true, txid: "f".repeat(64), status: { confirmed: true, block_height: 899_999 } } : { spent: false }));
    }
    if (url.endsWith(`/tx/${"f".repeat(64)}`)) return new Response(JSON.stringify({ fee: 40_000, weight: 800, vout: [{ scriptpubkey_address: "bc1qsame" }] }));
    return new Response("", { status: 404 });
  });
}

describe("GET /api/watch/status", () => {
  afterEach(() => {
    clearWatchCache();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is calm when no canary has moved, and checks all of them", async () => {
    const f = mempool(0);
    vi.stubGlobal("fetch", f);
    const body = await (await GET(new Request("http://x/api/watch/status"))).json();
    expect(body.assessment.level).toBe("calm");
    expect(body.canaries).toHaveLength(mainnet.canaries.length);
    expect(body.decision.release).toBe(false);
    expect(f.mock.calls.length).toBe(mainnet.canaries.length + 1);
  });

  it("releases on eight real moves", async () => {
    vi.stubGlobal("fetch", mempool(8));
    const body = await (await GET(new Request("http://x/api/watch/status"))).json();
    expect(body.assessment).toMatchObject({ level: "release", sharedDestinations: 1 });
    expect(body.decision.release).toBe(true);
  });

  it("marks a simulation and never releases from it", async () => {
    vi.stubGlobal("fetch", mempool(0));
    const body = await (await GET(new Request("http://x/api/watch/status?simulate=8"))).json();
    expect(body.simulated).toBe(true);
    expect(body.decision).toMatchObject({ release: false, wouldRelease: true });
  });

  it("says so when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await GET(new Request("http://x/api/watch/status"))).status).toBe(502);
  });

  it("serves the last good answer while the network is down", async () => {
    vi.stubGlobal("fetch", mempool(0));
    await GET(new Request("http://x/api/watch/status"));
    const down = vi.fn(async () => { throw new Error("down"); });
    vi.stubGlobal("fetch", down);
    const res = await GET(new Request("http://x/api/watch/status"));
    expect(res.status).toBe(200);
    expect((await res.json()).assessment.level).toBe("calm");
  });

  it("has no testnet canaries until the demo sets them up", async () => {
    expect((await GET(new Request("http://x/api/watch/status?network=testnet"))).status).toBe(404);
  });
});
