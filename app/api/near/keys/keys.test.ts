import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const rpc = (result: unknown, error?: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(error ? { jsonrpc: "2.0", id: 1, error } : { jsonrpc: "2.0", id: 1, result })));
const get = (q: string) => GET(new Request(`http://x/api/near/keys?account=${q}`));

describe("GET /api/near/keys", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says an account with only classic keys needs the upgrade, and gives its testnet commands", async () => {
    vi.stubGlobal("fetch", rpc({ keys: [{ public_key: "ed25519:abc", access_key: { permission: "FullAccess" } }] }));
    const body = await (await get("alice.testnet")).json();
    expect(body).toMatchObject({ account: "alice.testnet", network: "testnet", state: "needs-upgrade" });
    expect(body.commands.addKey).toContain("add-key alice.testnet grant-full-access autogenerate-new-keypair --signature-scheme ml-dsa-65");
  });

  it("recognises an upgraded account", async () => {
    vi.stubGlobal(
      "fetch",
      rpc({
        keys: [
          { public_key: "ed25519:abc", access_key: { permission: "FullAccess" } },
          { public_key: "ml-dsa-65-hash:xyz", access_key: { permission: "FullAccess" } },
        ],
      }),
    );
    expect((await (await get("lifeboat.testnet")).json()).state).toBe("upgraded");
  });

  it("explains a missing account", async () => {
    vi.stubGlobal("fetch", rpc(null, { code: -32000, message: "Server error", cause: { name: "UNKNOWN_ACCOUNT" }, data: "account nobody.near does not exist while viewing" }));
    const res = await get("nobody.near");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no account called nobody.near/);
  });

  it("asks for a NEAR account", async () => {
    expect((await get("0x1234")).status).toBe(400);
  });
});
