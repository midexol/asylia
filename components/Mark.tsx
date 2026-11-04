/** A mast over a hull: the boat you lower when the ship goes down. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M60 22 V70" stroke="#F2EFE8" strokeWidth="9" strokeLinecap="square" />
      <path d="M22 70 H98 Q90 96 60 96 Q30 96 22 70 Z" fill="#D6AE55" />
    </svg>
  );
}
