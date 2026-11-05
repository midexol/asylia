// A painted backdrop drawn in the browser: SVG fractal noise, cut into flat bands of indigo with ember streaks.
// No image files, no gradients, and nothing tied to the product name.
export function Paint({ seed = 7, id = "paint" }: { seed?: number; id?: string }) {
  return (
    <svg className="paint" aria-hidden="true" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 700">
      <defs>
        <filter id={`${id}-a`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0014 0.0048" numOctaves="5" seed={seed} result="n" />
          <feTurbulence type="turbulence" baseFrequency="0.02 0.06" numOctaves="2" seed={seed + 3} result="brush" />
          <feDisplacementMap in="n" in2="brush" scale="26" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feColorMatrix in="d" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.36  0 0 0 0 0.86  1.7 0 0 0 -0.5" />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0.08 0.16 0.26 0.38 0.52 0.66 0.8" />
          </feComponentTransfer>
        </filter>
        <filter id={`${id}-b`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.009" numOctaves="4" seed={seed + 11} result="n" />
          <feTurbulence type="turbulence" baseFrequency="0.03 0.08" numOctaves="2" seed={seed + 5} result="brush" />
          <feDisplacementMap in="n" in2="brush" scale="18" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feColorMatrix in="d" type="matrix" values="0 0 0 0 1  0 0 0 0 0.52  0 0 0 0 0.36  2.2 0 0 0 -1.25" />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0 0 0.22 0.4 0.58" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect width="1200" height="700" fill="#16123A" />
      <rect width="1200" height="700" filter={`url(#${id}-a)`} />
      <rect width="1200" height="700" filter={`url(#${id}-b)`} />
      <rect width="1200" height="700" fill="#0b0920" opacity="0.3" />
    </svg>
  );
}
