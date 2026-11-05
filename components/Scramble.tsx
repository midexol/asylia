"use client";

import { useEffect, useState } from "react";

// Types the words in as if a key were being cracked: random hex settles into the real letters, once.
const GLYPHS = "0123456789abcdef";

export function Scramble({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const total = 26;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor((frame / total) * text.length);
      setShown(
        text
          .split("")
          .map((ch, i) => (ch === " " || i < settled ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (frame >= total) {
        window.clearInterval(id);
        setShown(text);
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <span className="scramble" aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
