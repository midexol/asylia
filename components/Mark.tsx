/** A mast over a hull: the boat you lower when the ship goes down. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M60 22 V70" stroke="#F2EFE8" strokeWidth="9" strokeLinecap="square" />
      <path d="M22 70 H98 Q90 96 60 96 Q30 96 22 70 Z" fill="#E58363" />
    </svg>
  );
}

/** A lifebuoy: ivory ring, eight coral bands. Flat colours only. */
export function Buoy({ className }: { className?: string }) {
  const r = 74;
  const c = 2 * Math.PI * r;
  return (
    <svg className={className} viewBox="-8 -8 216 216" aria-hidden="true">
      <circle cx="100" cy="100" r={r} fill="none" stroke="#F2EFE8" strokeWidth="44" />
      <circle
        cx="100" cy="100" r={r} fill="none" stroke="#E58363" strokeWidth="44"
        strokeDasharray={`${c / 8} ${c / 8}`} transform="rotate(-22.5 100 100)"
      />
      <circle cx="100" cy="100" r="96" fill="none" stroke="#000" strokeWidth="3" />
      <circle cx="100" cy="100" r="52" fill="none" stroke="#000" strokeWidth="3" />
      <circle cx="100" cy="100" r="106" fill="none" stroke="#F2EFE8" strokeOpacity="0.28" strokeWidth="1" />
    </svg>
  );
}
