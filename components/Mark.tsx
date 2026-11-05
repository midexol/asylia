/** A neutral mark: two cells of a sheared lattice, one filled. It carries no theme, so the name can change freely. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="2,19 7,5 15,5 10,19" fill="#4C8DFF" />
      <polygon points="10,19 15,5 23,5 18,19" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
    </svg>
  );
}
