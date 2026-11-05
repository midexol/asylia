import { ScanPreview } from "./ScanPreview";

// The hero's product stage: three example screens side by side. Every value is illustrative,
// and the page says so right under the stage.
const MOVED = new Set<number>(); // a calm day: no old wallet has moved

export function HeroStage() {
  return (
    <div className="stage">

      <div className="card card-left" role="img" aria-label="Example sealed escape">
        <div className="card-title">
          Escape sealed
          <span className="verdict-tag safe">Sealed</span>
        </div>
        <dl>
          <div><dt>From</dt><dd>1Bx9…q4Tz</dd></div>
          <div><dt>To</dt><dd>bc1q…n8vf</dd></div>
          <div><dt>Fee cap</dt><dd>5x today</dd></div>
          <div><dt>Opens in</dt><dd>NEAR enclave</dd></div>
        </dl>
        <span className="small">Pays only the address you chose.</span>
      </div>

      <ScanPreview />

      <div className="card card-right" role="img" aria-label="Example watchman status">
        <div className="card-title">
          Watchman
          <span className="verdict-tag safe">Calm</span>
        </div>
        <span className="big">0 of 60</span>
        <span className="small">old wallets moved today</span>
        <div className="cells" aria-hidden="true">
          {Array.from({ length: 60 }, (_, i) => (
            <span key={i} className={MOVED.has(i) ? "moved" : undefined} />
          ))}
        </div>
        <span className="small">Alarm at 3. Release at 8.</span>
      </div>
    </div>
  );
}
