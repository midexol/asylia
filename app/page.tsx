import Link from "next/link";
import { Mark } from "@/components/Mark";
import { NAME, REPO, SISTER, TAGLINE } from "@/lib/brand";

const STEPS = [
  ["Scan", "Paste your wallet addresses. We tell you which ones a quantum computer could open, and how much is in them."],
  ["Seal", "For each wallet at risk, you sign an escape to a fresh, safe address. It is locked away where nobody can read it, us included."],
  ["Upgrade NEAR", "NEAR accounts don't need an escape. They add a quantum-safe key to the same account, and we show you exactly how."],
  ["Watch", "A watchman keeps an eye on old wallets that would fall first. If they start moving, your escape goes out on its own."],
];

const CHAINS = [
  ["Bitcoin", "Exposed after the first spend"],
  ["Ethereum", "Exposed after the first transaction"],
  ["BNB Chain", "Exposed after the first transaction"],
  ["NEAR", "Fixed in place with a new key"],
];

export default function Landing() {
  return (
    <main>
      <section className="hero">
        <div className="hero-stage">
          <header className="wrap topbar">
            <span className="brand">
              <Mark size={22} />
              Built at NEAR HACKATHON
            </span>
          </header>
          <div className="hero-center">
            <h1 className="wordmark">{NAME.toUpperCase()}</h1>
            <p className="tagline">{TAGLINE}</p>
            <Link href="/scan" className="btn">
              Check my wallets
            </Link>
          </div>
          <div className="hero-foot">Scroll to see how it works</div>
        </div>
      </section>

      <section className="wrap block">
        <div className="risk arrive">
          <h2 className="display">Some locks are already showing their keys.</h2>
          <p>
            A big enough quantum computer can work out a wallet&apos;s private key from its public key. About{" "}
            <a href="https://thequantuminsider.com/2025/06/19/project-eleven-raises-6-million-to-secure-digital-assets-against-quantum-threats/">
              $600 billion of Bitcoin
            </a>{" "}
            sits in wallets whose public key is already on the blockchain.
          </p>
        </div>
        <div className="chains arrive">
          {CHAINS.map(([name, note]) => (
            <div key={name}>
              <b>{name}</b>
              <span>{note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <h2 className="display arrive">Four steps. No coins handed over.</h2>
        <ol className="how arrive">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="n">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <p className="promise arrive">
          {NAME} never holds your coins and never sees your private keys. The escape can only pay addresses you chose
          yourself, so even the watchman that releases it cannot send your coins anywhere else.
        </p>
      </section>

      <section className="closing">
        <div className="wrap closing-inner arrive">
          <h2 className="display">See which wallets are at risk.</h2>
          <Link href="/scan" className="btn">
            Check my wallets
          </Link>
        </div>
        <footer className="wrap footer">
          <span>
            {NAME}, built at NEAR HACKATHON, November 2026. Sister project: <a href={SISTER.url}>{SISTER.name}</a>.
          </span>
          <a href={REPO}>Source on GitHub</a>
        </footer>
      </section>
    </main>
  );
}
