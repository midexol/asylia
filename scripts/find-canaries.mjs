// Find canary coins: the earliest Bitcoin block rewards, paid to bare public keys (P2PK) and
// never spent. Their keys have been public since 2009, so they are the first coins a quantum
// computer could take. If many of them start moving at once, that is the alarm.
// Run in GitHub Actions (needs mempool.space): node scripts/find-canaries.mjs [maxHeight] [wanted]
const API = "https://mempool.space/api";
const maxHeight = Number(process.argv[2] ?? 400);
const wanted = Number(process.argv[3] ?? 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, json = true) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API + path);
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return json ? res.json() : (await res.text()).trim();
  }
  throw new Error(`${path}: rate limited`);
}

const canaries = [];
for (let h = 1; h <= maxHeight && canaries.length < wanted; h++) {
  const hash = await get(`/block-height/${h}`, false);
  const txid = await get(`/block/${hash}/txid/0`, false);
  const tx = await get(`/tx/${txid}`);
  const out = tx.vout[0];
  const spend = await get(`/tx/${txid}/outspend/0`);
  if (out.scriptpubkey_type === "p2pk" && !spend.spent) {
    canaries.push({ height: h, txid, vout: 0, sats: out.value });
  }
  await sleep(250);
}
console.log(`found ${canaries.length} unspent P2PK block rewards`);
console.log("CANARIES_JSON " + JSON.stringify(canaries));
