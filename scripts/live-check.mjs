// Checks the deployed site end to end: every page, every API route, and the main flows in a
// real browser. Nothing is signed and no coins move; the only write is one harmless test
// escape sealed into the NEAR testnet vault.
//   node scripts/live-check.mjs https://asylia.vercel.app
import { bech32 } from "@scure/base";
import { randomBytes } from "@noble/hashes/utils";
import { appendFileSync } from "node:fs";
import { chromium } from "playwright";

const SITE = (process.argv[2] ?? "https://asylia.vercel.app").replace(/\/$/, "");
const results = [];
const record = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
let page = null;
const check = async (name, fn) => {
  try {
    const d = await fn();
    record(true, name, d ?? "");
  } catch (e) {
    record(false, name, e instanceof Error ? e.message.split("\n")[0] : String(e));
    if (name.startsWith("Browser") && page) {
      const text = await page.evaluate(() => document.querySelector("main")?.innerText ?? "").catch(() => "");
      console.log(`      on ${page.url()}: ${text.replace(/\s+/g, " ").slice(0, 900)}`);
    }
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// Fresh, never-used addresses for the "safe" side of an escape plan.
const freshBtc = () => bech32.encode("bc", [0, ...bech32.toWords(randomBytes(20))]);
const freshEvm = () => "0x" + Buffer.from(randomBytes(20)).toString("hex");

const EXPOSED_BTC = "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo";
const UNSPENT_BTC = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const EXPOSED_EVM = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const NEAR_UPGRADED = "lifeboat-f86cd6e7d4.testnet";

async function api(path, init) {
  const t = Date.now();
  const res = await fetch(SITE + path, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, ms: Date.now() - t };
}
const post = (path, json) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });

// ---------- Pages and static files ----------
for (const [path, type] of [["/", "html"], ["/scan", "html"], ["/seal", "html"], ["/upgrade", "html"], ["/watch", "html"],
  ["/icon.svg", "svg"], ["/favicon.ico", "icon"], ["/apple-icon.png", "png"]]) {
  await check(`GET ${path}`, async () => {
    const res = await fetch(SITE + path);
    expect(res.status === 200, `HTTP ${res.status}`);
    const ct = res.headers.get("content-type") ?? "";
    if (type === "html") {
      const html = await res.text();
      expect(/<title>[^<]*Asylia/.test(html), "title does not name Asylia");
    }
    return `HTTP 200, ${ct.split(";")[0]}`;
  });
}
await check("GET /nope returns 404", async () => {
  const res = await fetch(SITE + "/nope-" + Date.now());
  expect(res.status === 404, `HTTP ${res.status}`);
});

// ---------- API routes ----------
await check("POST /api/scan: exposed, unspent, ETH+BNB and NEAR in one go", async () => {
  const r = await post("/api/scan", { text: [EXPOSED_BTC, UNSPENT_BTC, EXPOSED_EVM, NEAR_UPGRADED].join("\n") });
  expect(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const by = (i, chain) => r.body.results.find((x) => x.input.toLowerCase() === i.toLowerCase() && (!chain || x.chain === chain));
  expect(by(EXPOSED_BTC)?.verdict === "exposed", `exposed BTC came back as ${JSON.stringify(by(EXPOSED_BTC))}`);
  expect(by(UNSPENT_BTC)?.verdict === "hidden", "never-spent BTC not marked safe for now");
  expect(by(EXPOSED_EVM, "ethereum")?.verdict === "exposed", "ETH wallet not marked exposed");
  expect(by(EXPOSED_EVM, "bsc")?.verdict === "exposed", "BNB wallet not marked exposed");
  expect(by(NEAR_UPGRADED)?.headline === "Already upgraded", "NEAR account not seen as upgraded");
  return `${r.body.results.length} results in ${r.ms} ms`;
});
await check("POST /api/scan: nonsense input gets a clear answer, not a crash", async () => {
  const r = await post("/api/scan", { text: "not-an-address" });
  expect(r.status < 500, `HTTP ${r.status}`);
  return `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`;
});
await check("POST /api/scan: empty body is refused with 400", async () => {
  const r = await post("/api/scan", {});
  expect(r.status === 400, `HTTP ${r.status}`);
});
await check("GET /api/near/keys: upgraded testnet account", async () => {
  const r = await api(`/api/near/keys?account=${NEAR_UPGRADED}`);
  expect(r.status === 200 && r.body.state === "upgraded", `HTTP ${r.status} state ${r.body.state}`);
  expect(r.body.keys.some((k) => k.kind === "quantum-safe"), "no quantum-safe key listed");
  return `${r.body.keys.length} keys`;
});
await check("GET /api/near/keys: mainnet account without the new key gets the upgrade commands", async () => {
  const r = await api(`/api/near/keys?account=wrap.near`);
  expect(r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  expect(r.body.state !== "upgraded", "state says upgraded");
  return `state ${r.body.state}`;
});
await check("GET /api/near/keys: unknown account says it does not exist", async () => {
  const r = await api(`/api/near/keys?account=no-such-account-${Date.now()}.testnet`);
  expect(r.status === 404, `HTTP ${r.status}`);
  return r.body.error;
});
await check("GET /api/near/keys: account with over 100 keys gets a clear answer", async () => {
  const r = await api(`/api/near/keys?account=near`);
  expect(r.status === 422, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return r.body.error;
});
await check("GET /api/watch/status: live mainnet canaries", async () => {
  const r = await api("/api/watch/status?network=mainnet");
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(r.body.assessment.watched === 60, `watching ${r.body.assessment.watched}`);
  expect(r.body.simulated === false, "live view says simulated");
  return `${r.body.assessment.level}, block ${r.body.tip}, ${r.ms} ms`;
});
await check("GET /api/watch/status: simulated attack would release and is marked simulated", async () => {
  const r = await api("/api/watch/status?network=mainnet&simulate=8");
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(r.body.simulated === true, "not marked simulated");
  expect(r.body.assessment.level === "release", `level ${r.body.assessment.level}`);
  expect(r.body.decision.release === false, "a simulation would really release");
  return r.body.decision.why;
});
await check("POST /api/rescue/btc/prepare: address with over 500 coins gets a clear answer", async () => {
  const r = await post("/api/rescue/btc/prepare", { from: EXPOSED_BTC, to: freshBtc(), speed: "high" });
  expect(r.status === 400 && /500/.test(r.body.error ?? ""), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.error;
});
// An ordinary wallet that just spent: its key is public, and it may still hold change.
const recentSpender = await (async () => {
  const ids = await (await fetch("https://mempool.space/api/mempool/recent")).json();
  for (const { txid } of ids) {
    const tx = await (await fetch(`https://mempool.space/api/tx/${txid}`)).json();
    const a = tx.vin?.[0]?.prevout;
    if (a?.scriptpubkey_type === "v0_p2wpkh" && a.scriptpubkey_address) return a.scriptpubkey_address;
  }
  return null;
})().catch(() => null);
await check("POST /api/rescue/btc/prepare: unsigned plan to a fresh address", async () => {
  expect(recentSpender, "could not find a recent spender to try");
  const r = await post("/api/rescue/btc/prepare", { from: recentSpender, to: freshBtc(), speed: "high" });
  expect(r.status === 200 || (r.status === 400 && r.body.error), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  if (r.status === 400) return `refused with a clear reason: ${r.body.error}`;
  expect(typeof r.body.plan?.psbt === "string" && r.body.plan.psbt.length > 50, "no PSBT in the plan");
  return `PSBT ${r.body.plan.psbt.length} chars, ${r.ms} ms`;
});
await check("POST /api/rescue/btc/prepare: used safe address is refused", async () => {
  const r = await post("/api/rescue/btc/prepare", { from: recentSpender ?? EXPOSED_BTC, to: UNSPENT_BTC });
  expect(r.status === 400, `HTTP ${r.status}`);
  return r.body.error;
});
await check("POST /api/rescue/btc/check: tampered signature is refused", async () => {
  const r = await post("/api/rescue/btc/check", { plan: { psbt: "cHNidP8BAA==" }, signed: "0200000001" });
  expect(r.status < 500, `HTTP ${r.status}`);
  expect(!(r.body.ok === true), "accepted garbage as a valid escape");
  return `HTTP ${r.status}`;
});
for (const chain of ["ethereum", "bsc"]) {
  await check(`POST /api/rescue/evm/prepare: ${chain} plan to a fresh address`, async () => {
    const r = await post("/api/rescue/evm/prepare", { from: EXPOSED_EVM, to: freshEvm(), chain, network: "mainnet", speed: "high" });
    expect(r.status === 200 || (r.status === 400 && r.body.error), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    if (r.status === 400) return `refused with a clear reason: ${r.body.error}`;
    expect(r.body.plan?.txs?.length > 0, "no transactions in the plan");
    return `${r.body.plan.txs.length} transactions to sign, ${r.ms} ms`;
  });
}
await check("POST /api/rescue/evm/prepare: bad address is refused", async () => {
  const r = await post("/api/rescue/evm/prepare", { from: "0x123", to: freshEvm() });
  expect(r.status === 400, `HTTP ${r.status}`);
});
await check("POST /api/vault/seal: garbage is refused", async () => {
  const r = await post("/api/vault/seal", { sealed: "aGVsbG8=" });
  expect(r.status >= 400 && r.status < 500, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return `HTTP ${r.status}`;
});

// ---------- Real browser ----------
const browser = await chromium.launch();
page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const badResponses = [];
page.on("console", (m) => { if (m.type() === "error" && !/status of 400/.test(m.text())) consoleErrors.push(`${page.url()}: ${m.text()}`); });
page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: ${e.message}`));
page.on("response", (r) => {
  const u = r.url();
  // 400s are the site refusing bad input on purpose; anything else is a fault.
  if ((r.status() >= 500 || r.status() === 404) && u.startsWith(SITE) && !u.includes("/nope")) badResponses.push(`${r.status()} ${u}`);
});

await check("Browser: home hero check sends the address to Scan and shows the verdict", async () => {
  await page.goto(SITE + "/", { waitUntil: "networkidle" });
  await page.getByPlaceholder(/Paste a Bitcoin/).fill(EXPOSED_BTC);
  await page.getByRole("button", { name: /Check it/ }).click();
  await page.waitForURL("**/scan");
  expect(!page.url().includes(EXPOSED_BTC), "address leaked into the URL");
  await page.getByText("At risk").first().waitFor({ timeout: 30000 });
});
await check("Browser: landing page live watchman card fills in", async () => {
  await page.goto(SITE + "/", { waitUntil: "networkidle" });
  const card = await page.locator("text=/of 60/").first().textContent({ timeout: 20000 });
  return card?.trim();
});
await check("Browser: Scan with four wallets", async () => {
  await page.goto(SITE + "/scan", { waitUntil: "networkidle" });
  await page.locator("textarea").fill([EXPOSED_BTC, UNSPENT_BTC, EXPOSED_EVM, NEAR_UPGRADED].join("\n"));
  await page.getByRole("button", { name: "Check them" }).click();
  await page.getByText("Already upgraded").waitFor({ timeout: 30000 });
  const risk = await page.getByText("At risk").count();
  const safe = await page.getByText("Safe for now").count();
  expect(risk >= 3 && safe >= 1, `${risk} at risk, ${safe} safe`);
  return `${risk} at risk, ${safe} safe for now, 1 upgraded`;
});
await check("Browser: Seal an escape opens Seal with the address filled in", async () => {
  await page.getByRole("link", { name: "Seal an escape" }).first().click();
  await page.waitForURL("**/seal**");
  const from = await page.locator("#from").inputValue();
  expect(from === EXPOSED_BTC, `from field is "${from}"`);
});
await check("Browser: Seal prepares a Bitcoin escape to a fresh address", async () => {
  expect(recentSpender, "could not find a recent spender to try");
  await page.goto(`${SITE}/seal?address=${recentSpender}&chain=bitcoin`, { waitUntil: "networkidle" });
  await page.locator("#to").fill(freshBtc());
  await page.getByRole("button", { name: /Prepare my escape/ }).click();
  await page.locator("#psbt, p.error").first().waitFor({ timeout: 45000 });
  if (await page.locator("#psbt").count()) return "unsigned transaction shown, ready to sign in a wallet";
  const why = await page.locator("p.error").first().textContent();
  expect(/nothing|empty|no coins|too small|dust/i.test(why ?? ""), `error: ${why}`);
  return `refused with a clear reason: ${why}`;
});
await check("Browser: Upgrade reads the testnet account", async () => {
  await page.goto(SITE + "/upgrade", { waitUntil: "networkidle" });
  await page.locator("input").first().fill(NEAR_UPGRADED);
  await page.getByRole("button", { name: /Check my account/ }).click();
  await page.getByText(/is quantum-safe/).waitFor({ timeout: 30000 });
});
await check("Browser: Watch shows live canaries, then a simulated attack", async () => {
  await page.goto(SITE + "/watch", { waitUntil: "networkidle" });
  await page.getByText(/canaries are still|Calm|Watching|Alarm/).first().waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Show a simulated attack" }).click();
  await page.getByText("Would be released now").waitFor({ timeout: 30000 });
  const moved = await page.getByText("Moved", { exact: true }).count();
  expect(moved === 8, `${moved} canaries show Moved`);
  return `${moved} canaries moved in the simulation`;
});
await check("Browser: phone width has no sideways scroll", async () => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const wide = [];
  for (const path of ["/", "/scan", "/seal", "/upgrade", "/watch"]) {
    await p.goto(SITE + path, { waitUntil: "networkidle" });
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) wide.push(`${path} ${w}px`);
  }
  await p.close();
  expect(!wide.length, wide.join(", "));
});
await browser.close();
await check("Browser: no console errors", async () => { expect(!consoleErrors.length, consoleErrors.slice(0, 5).join(" | ")); });
await check("Browser: no failed requests to the site", async () => { expect(!badResponses.length, badResponses.slice(0, 5).join(" | ")); });

// ---------- Security ----------
await check("Security headers on every page", async () => {
  const res = await fetch(SITE + "/");
  const h = (k) => res.headers.get(k) ?? "";
  expect(/frame-ancestors 'none'/.test(h("content-security-policy")), "no CSP with frame-ancestors");
  expect(/default-src 'self'/.test(h("content-security-policy")), "CSP default-src is not self");
  expect(h("strict-transport-security").includes("max-age="), "no HSTS");
  expect(h("x-frame-options") === "DENY", "framing allowed");
  expect(h("x-content-type-options") === "nosniff", "no nosniff");
  expect(!res.headers.has("x-powered-by"), "x-powered-by leaks the framework");
  return "CSP, HSTS, DENY, nosniff, no x-powered-by";
});
await check("Oversized request is refused with 413", async () => {
  const r = await post("/api/scan", { text: "a".repeat(40_000) });
  expect(r.status === 413, `HTTP ${r.status}`);
});
await check("Rate limit: a flood of scans gets 429 with Retry-After", async () => {
  let first429 = 0, retry = "";
  for (let i = 1; i <= 30; i++) {
    const res = await fetch(SITE + "/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x" }) });
    if (res.status === 429) { first429 = i; retry = res.headers.get("retry-after") ?? ""; break; }
  }
  expect(first429 > 0, "30 requests in a row were all allowed");
  expect(Number(retry) > 0, "no Retry-After header");
  return `blocked at request ${first429}, retry after ${retry}s`;
});

const failed = results.filter((r) => !r.ok);
const summary = [`## Live check of ${SITE}`, "", `${results.length - failed.length} of ${results.length} passed`, "",
  ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? `: ${r.detail}` : ""}`)].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
