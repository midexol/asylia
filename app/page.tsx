import Link from "next/link";
import { HeroCheck } from "@/components/HeroCheck";
import { HeroStage } from "@/components/HeroStage";
import { LiveWatch } from "@/components/LiveWatch";
import { Mark } from "@/components/Mark";
import { Paint } from "@/components/Paint";
import { Scramble } from "@/components/Scramble";
import { NAME, REPO, SISTER } from "@/lib/brand";

const STEPS = [
  ["Scan your wallets", `Paste your Bitcoin, Ethereum, BNB Chain or NEAR addresses. ${NAME} checks the blockchain and tells you which ones have a public key a quantum computer could use, and how much is in them.`],
  ["Seal an escape", "For each wallet at risk, you sign one transfer in your own wallet that sends everything to a new address you control. Your browser encrypts it, and only a secure NEAR enclave can open it."],
  ["Upgrade NEAR", `A NEAR account keeps its address and adds a quantum-safe key (ML-DSA). ${NAME} checks the account live and gives you the exact commands to run on your own computer.`],
  ["Let the watchman wait", "It tracks 60 unspent Bitcoin wallets from 2009 whose keys are public. Three moving in a day raises an alarm. Eight moving releases your transfer."],
];

const CHAINS = [
  ["Bitcoin", "Exposed after the first spend", false],
  ["Ethereum", "Exposed after the first transaction", false],
  ["BNB Chain", "Exposed after the first transaction", false],
  ["NEAR", "Fixed in place with a new key", true],
] as const;

function Arrow() {
  return (
    <span className="arrow" aria-hidden="true">
      <svg viewBox="0 0 12 12">
        <path d="M3 9 L9 3 M4 3 H9 V8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Landing() {
  return (
    <main>
      <header className="wrap topbar">
        <Link href="/" className="brand">
          <Mark />
          <span className="brand-name">{NAME}</span>
        </Link>
        <nav className="nav" aria-label="Sections">
          <a href="#see">What you see</a>
          <a href="#risk">The risk</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="top-right">
          <a className="icon-btn" href={REPO} aria-label="Source on GitHub">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <Link href="/scan" className="btn">
            Open the app <Arrow />
          </Link>
        </div>
      </header>

      <div className="wrap">
        <section className="hero">
          <Paint />
          <div className="hero-inner">
            <h1>
              Move your crypto before a quantum computer can <Scramble text="open it." />
            </h1>
            <p className="sub">
              Find the wallets with exposed keys, sign a transfer to a safe address today, and let a sealed watchman send
              it the moment old wallets start being emptied. Your coins never leave your control.
            </p>
            <HeroCheck />
          </div>
          <LiveWatch />
        </section>
      </div>

      <section className="wrap block" id="see">
        <div className="split-head">
          <div>
            <p className="section-label">What you see</p>
            <h2 className="display">One page per job, nothing to install</h2>
          </div>
          <p>
            Scan shows what is exposed. Seal locks away a signed transfer. The watchman shows how close an attack is.
            These are examples; paste your own addresses to see yours.
          </p>
        </div>
        <HeroStage />
      </section>

      <section className="wrap block" id="risk">
        <div className="split-head">
          <div>
            <p className="section-label">The risk</p>
            <h2 className="display">Some wallets are already showing their keys</h2>
          </div>
          <p>
            A big enough quantum computer can work out a wallet&apos;s private key from its public key. About{" "}
            <a href="https://thequantuminsider.com/2025/06/19/project-eleven-raises-6-million-to-secure-digital-assets-against-quantum-threats/">
              $600 billion of Bitcoin
            </a>{" "}
            sits in wallets whose public key is already on the blockchain.
          </p>
        </div>
        <div className="chains">
          {CHAINS.map(([name, note, safe]) => (
            <div key={name} className={safe ? "safe" : undefined}>
              <b>{name}</b>
              <span>{note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block" id="how">
        <div className="split-head">
          <div>
            <p className="section-label">How it works</p>
            <h2 className="display">Four steps, no coins handed over</h2>
          </div>
          <p>
            {NAME} never holds your coins and never sees your private keys. Your signed transfer pays only the address
            you chose, so the worst an early release can do is move your coins to your own safe address.
          </p>
        </div>
        <ol className="how">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="n">0{i + 1}.</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap closing">
        <div className="closing-inner">
          <Paint seed={23} id="paint-close" />
          <h2 className="display">See which of your wallets are at risk</h2>
          <Link href="/scan" className="btn">
            Check my wallets <Arrow />
          </Link>
        </div>
        <footer className="footer">
          <span>
            {NAME}, built at NEAR HACKATHON, November 2026. Sister project: <a href={SISTER.url}>{SISTER.name}</a>.
          </span>
          <a href={REPO}>Source on GitHub</a>
        </footer>
      </section>
    </main>
  );
}
