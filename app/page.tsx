import Link from "next/link";
import { Buoy, Mark } from "@/components/Mark";
import { NAME, REPO, SISTER, TAGLINE } from "@/lib/brand";

const STEPS = [
  ["Scan", "Paste your Bitcoin, Ethereum, BNB Chain or NEAR addresses. Lifeboat checks the blockchain and tells you which ones have a public key a quantum computer could use, and how much money is in them."],
  ["Seal", "For each wallet at risk, you sign one transfer in your own wallet that sends everything to a new address you control. Your browser encrypts it, and only a secure NEAR enclave can open it."],
  ["Upgrade NEAR", "A NEAR account can keep its address and add a quantum-safe key (ML-DSA). Lifeboat checks the account live and gives you the exact commands to run on your own computer."],
  ["Watch", "A watchman tracks 60 unspent Bitcoin wallets from 2009 whose public keys are exposed. Three moving in a day raises an alarm. Eight moving releases your transfer."],
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
            <Buoy className="buoy" />
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
            <div key={name} className={name === "NEAR" ? "safe" : "exposed"}>
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
            <li key={title} className={`step-${i + 1}`}>
              <span className="n">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <p className="promise arrive">
          {NAME} never holds your coins and never sees your private keys. Your signed transfer pays only the address you
          chose. If it is released, it can do nothing else, so the worst a bad release can do is move your coins early to
          your own safe address.
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
