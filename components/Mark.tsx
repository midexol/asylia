/** The Asylia mark, same as the favicon: an A on indigo with an ember crossbar. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" rx="26" fill="#16123A" />
      <polygon points="20,98 50,22 66,22 36,98" fill="#FFFFFF" />
      <polygon points="54,22 70,22 100,98 84,98" fill="#FFFFFF" />
      <polygon points="44,70 76,70 81,82 39,82" fill="#FFB38F" />
    </svg>
  );
}
