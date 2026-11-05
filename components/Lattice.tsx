// A sheared lattice: the maths behind quantum-safe keys such as ML-DSA. Three cells are lit to
// show the story: an exposed key, a sealed transfer and a quantum-safe key. Lines only.
const A = 64; // step along a row
const S = 24; // shear per row
const H = 56; // row height
const ROWS = 8;
const W = 480;

function cell(i: number, k: number) {
  const x = A * i + S * k;
  const y = H * k;
  return `${x},${y} ${x + A},${y} ${x + A + S},${y + H} ${x + S},${y + H}`;
}

function centre(i: number, k: number) {
  return { x: A * i + S * k + (A + S) / 2, y: H * k + H / 2 + 4 };
}

export function Lattice() {
  const rows = Array.from({ length: ROWS + 1 }, (_, k) => k);
  const cols = Array.from({ length: 14 }, (_, j) => j - 5);
  const a = centre(1, 2);
  const b = centre(4, 5);
  const c = centre(5, 1);
  return (
    <svg className="lattice" viewBox={`0 0 ${W} ${H * ROWS}`} aria-hidden="true">
      <defs>
        <clipPath id="lattice-clip">
          <rect width={W} height={H * ROWS} rx="22" />
        </clipPath>
      </defs>
      <g clipPath="url(#lattice-clip)">
        <g className="grid">
          {rows.map((k) => (
            <line key={`r${k}`} x1={0} y1={H * k} x2={W} y2={H * k} />
          ))}
          {cols.map((j) => (
            <line key={`c${j}`} x1={A * j} y1={0} x2={A * j + S * ROWS} y2={H * ROWS} />
          ))}
        </g>
        <g className="lit lit-1">
          <polygon className="cell-a" points={cell(1, 2)} />
          <text className="tag tag-dark" x={a.x} y={a.y} textAnchor="middle">exposed</text>
        </g>
        <g className="lit lit-2">
          <polygon className="cell-c" points={cell(5, 1)} />
          <text className="tag" x={c.x} y={c.y} textAnchor="middle">new key</text>
        </g>
        <g className="lit lit-3">
          <polygon className="cell-b" points={cell(4, 5)} />
          <text className="tag tag-dark" x={b.x} y={b.y} textAnchor="middle">sealed</text>
        </g>
      </g>
    </svg>
  );
}
