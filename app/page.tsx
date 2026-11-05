import Link from "next/link";
import { HeroStage } from "@/components/HeroStage";
import { Mark } from "@/components/Mark";
import { NAME, REPO, SISTER } from "@/lib/brand";

const STEPS = [
  ["Scan", `Paste your Bitcoin, Ethereum, BNB Chain or NEAR addresses. ${NAME} checks the blockchain and tells you which ones have a public key a quantum computer could use, and how much money is in them.`],
  ["Seal", "For each wallet at risk, you sign one transfer in your own wallet that sends everything to a new address you control. Your browser encrypts it, and only a secure NEAR enclave can open it."],
  ["Upgrade NEAR", `A NEAR account can keep its address and add a quantum-safe key (ML-DSA). ${NAME} checks the account live and gives you the exact commands to run on your own computer.`],
  ["Watch", "A watchman tracks 60 unspent Bitcoin wallets from 2009 whose public keys are exposed. Three moving in a day raises an alarm. Eight moving releases your transfer."],
];

const CHAINS = [
  ["Bitcoin", "Exposed after the first spend", false],
  ["Ethereum", "Exposed after the first transaction", false],
  ["BNB Chain", "Exposed after the first transaction", false],
  ["NEAR", "Fixed in place with a new key", true],
] as const;

export default function Landing() {
  return (
    <main>
      <header className="wrap topbar">
        <Link href="/" className="brand">
          <Mark />
          <span className="brand-name">{NAME}</span>
        </Link>
        <span className="made">Built at NEAR HACKATHON</span>
      </header>

      <section className="wrap hero">
        <span className="hero-tag">
          <b>New</b>Quantum-safe recovery for your crypto
        </span>
        <h1>
          Move your crypto <em>before</em> quantum computers can open it.
        </h1>
        <p className="sub">
          Find the wallets that are exposed, sign a transfer to a safe address today, and let a sealed watchman send it
          the moment old wallets start being emptied. Your coins never leave your control.
        </p>
        <div className="hero-actions">
          <Link href="/scan" className="btn">
            Check my wallets
          </Link>
          <a href="#how" className="btn btn-ghost">
            How it works
          </a>
        </div>
        <HeroStage />
        <p className="stage-note">Examples of what each screen shows. Paste your own addresses to see yours.</p>
      </section>

      <section className="wrap block">
        <div className="risk">
          <h2 className="display">Some wallets are already showing their keys.</h2>
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
        <h2 className="display">Four steps. No coins handed over.</h2>
        <ol className="how">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="n">Step {i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <p className="promise">
          {NAME} never holds your coins and never sees your private keys. <b>Your signed transfer pays only the address
          you chose.</b> If it is released early, the worst case is your coins move early to your own safe address.
        </p>
      </section>

      <section className="closing">
        <div className="wrap closing-inner">
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
