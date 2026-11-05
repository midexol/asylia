// An illustrative scan result for the landing page. It is labelled as an example on screen:
// the addresses are shortened placeholders, not real wallets.
const ROWS = [
  { chain: "Bitcoin", addr: "1Bx9…q4Tz", verdict: "Exposed", kind: "exposed", bal: "$41,200" },
  { chain: "Bitcoin", addr: "bc1q…7k2d", verdict: "Safe for now", kind: "safe", bal: "$3,180" },
  { chain: "Ethereum", addr: "0x3f…a91C", verdict: "Exposed", kind: "exposed", bal: "$12,640" },
  { chain: "NEAR", addr: "you.near", verdict: "Upgraded", kind: "upgraded", bal: "$860" },
];

export function ScanPreview() {
  return (
    <div>
      <div className="panel" role="img" aria-label="Example scan: two exposed wallets, one safe, one NEAR account upgraded">
        <div className="panel-head">
          <span>Example scan</span>
          <span>4 wallets</span>
        </div>
        {ROWS.map((r) => (
          <div className="scan-row" key={r.addr}>
            <span>{r.chain}</span>
            <span className="addr">{r.addr}</span>
            <span className={`verdict-tag ${r.kind}`}>{r.verdict}</span>
            <span className="bal">{r.bal}</span>
          </div>
        ))}
        <div className="panel-foot">
          <span>$53,840 exposed</span>
          <b>2 escapes to seal</b>
        </div>
      </div>
      <p className="panel-note">An example of what a scan shows. Paste your own addresses to see yours.</p>
    </div>
  );
}
