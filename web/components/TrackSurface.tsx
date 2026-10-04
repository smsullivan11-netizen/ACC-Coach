// The track surface (asphalt between the two white lines) for SVG track maps, drawn under the
// racing lines. Edges come from edge laps (lib/track-edges.ts); nothing is drawn without them.
// Works in server and client components (no hooks).

export type EdgeLine = { x: number[]; z: number[] };
export type Edges = { left: EdgeLine | null; right: EdgeLine | null } | null;

const path = (e: EdgeLine) => {
  let d = "";
  for (let i = 0; i < e.x.length; i++) d += `${i ? "L" : "M"}${e.x[i]},${e.z[i]}`;
  return d + "Z";
};

export default function TrackSurface({ edges }: { edges: Edges }) {
  if (!edges || (!edges.left && !edges.right)) return null;
  const lines = [edges.left, edges.right].filter((e): e is EdgeLine => e !== null);
  return (
    <g>
      {edges.left && edges.right && (
        // Two closed loops filled even-odd: the ring between them is the track
        <path d={path(edges.left) + path(edges.right)} fill="#2b2b30" fillRule="evenodd" />
      )}
      {lines.map((e, k) => (
        <path key={k} d={path(e)} fill="none" stroke="#e4e4e7" strokeOpacity={0.55} strokeWidth={1}
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </g>
  );
}
