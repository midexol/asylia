"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Hands the address to the scan screen through sessionStorage, never the URL, so it stays out of logs.
export const HANDOFF_KEY = "scan-handoff";

export function HeroCheck() {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      className="hero-check"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (value.trim()) sessionStorage.setItem(HANDOFF_KEY, value.trim());
        } catch {
          // Storage can be blocked; the scan screen still opens empty.
        }
        router.push("/scan");
      }}
    >
      <label htmlFor="hero-address" className="sr-only">
        A wallet address
      </label>
      <input
        id="hero-address"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a Bitcoin, Ethereum, BNB or NEAR address"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="btn">
        Check it
        <span className="arrow" aria-hidden="true">
          <svg viewBox="0 0 12 12">
            <path d="M3 9 L9 3 M4 3 H9 V8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </form>
  );
}
