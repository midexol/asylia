import Link from "next/link";

export const STEPS = [
  { label: "Scan", href: "/scan", ready: true },
  { label: "Seal", href: "/seal", ready: false },
  { label: "Upgrade NEAR", href: "/upgrade", ready: false },
  { label: "Watch", href: "/watch", ready: false },
] as const;

/** The four-step progress bar shown at the top of every screen after the landing page. */
export function Steps({ current }: { current: number }) {
  return (
    <nav aria-label="Your progress" className="steps">
      <ol>
        {STEPS.map((s, i) => {
          const state = i === current ? "now" : i < current ? "done" : "later";
          const body = (
            <>
              <span className="num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="name">{s.label}</span>
              {!s.ready && <span className="soon">Opens soon</span>}
            </>
          );
          return (
            <li key={s.label} className={state} aria-current={i === current ? "step" : undefined}>
              {s.ready && i !== current ? <Link href={s.href}>{body}</Link> : <span className="inner">{body}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
