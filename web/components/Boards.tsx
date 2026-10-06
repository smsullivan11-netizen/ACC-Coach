// Virtual distance boards before corners (user's request: like a track's 50/100/150 m boards, they
// count down to the corner's reference point, lib/corner-refs.ts), drawn on the track maps in map
// units: white boards with black numbers, as on most circuits.

/** A board: where it stands on the lap's grid (d) and on the map (x, z). */
export type Board = { corner: number; label: string; d: number; x: number; z: number };

export default function Boards({ boards, size, from = -Infinity, to = Infinity }: {
  boards: Board[];
  size: number;          // the boards' text height (map metres)
  from?: number;         // only the boards in this part of the lap (metres)
  to?: number;
}) {
  return (
    <g pointerEvents="none">
      {boards.filter((b) => b.d >= from && b.d <= to).map((b) => {
        const w = size * (0.62 * b.label.length + 0.5), h = size * 1.35;
        return (
          <g key={`${b.corner}-${b.label}`}>
            <rect x={b.x - w / 2} y={b.z - h / 2} width={w} height={h} rx={size * 0.18} fill="#f4f4f5" stroke="#18181b" strokeWidth={size * 0.12} />
            <text x={b.x} y={b.z} fontSize={size} fontWeight={800} fill="#18181b" textAnchor="middle" dominantBaseline="central">{b.label}</text>
          </g>
        );
      })}
    </g>
  );
}
