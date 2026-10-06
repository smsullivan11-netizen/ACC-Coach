// The replay's cars seen from above (user's request, like Racemake): the team's five most driven
// cars with their own shape, a generic GT3 for the others. Each one is drawn from its real length
// and width, its axles, its body outline (half-width along the length, smoothed) and its cockpit
// (where the engine layout puts it: set back behind a long bonnet on the front-engined Mustang and
// M4, forward on the mid-engined 296 and 720S, centred and sloping to the engine on the 992), plus
// the details that make it recognisable. Metres, front towards +x; drawn in the driver's colour.

type Profile = [x: number, halfWidth: number][];
type Spec = {
  length: number;
  body: Profile;          // nose to tail
  cabin: Profile;         // windscreen to rear window
  screen: number;         // the windscreen ends (roof starts) here
  axles: [number, number];
  wing: { x: number; depth: number; span: number };
  details?: (color: string) => React.ReactNode;
};

/** A closed, smooth outline through the profile (right side nose to tail, then the left side back). */
function outline(profile: Profile): string {
  const pts = [...profile.map(([x, w]) => [x, w]), ...[...profile].reverse().map(([x, w]) => [x, -w])]
    .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  const n = pts.length, at = (i: number) => pts[(i + n) % n];
  let d = `M${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
  for (let i = 0; i < n; i++) {   // Catmull-Rom through every point, as cubic Béziers
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1.map((v) => v.toFixed(3)).join(" ")} ${c2.map((v) => v.toFixed(3)).join(" ")} ${p2.map((v) => v.toFixed(3)).join(" ")}`;
  }
  return `${d}Z`;
}

/** The half-width of a profile at x (linear between its points). */
function widthAt(p: Profile, x: number) {
  for (let i = 0; i + 1 < p.length; i++) {
    const [x0, w0] = p[i], [x1, w1] = p[i + 1];
    if ((x <= x0 && x >= x1) || (x >= x0 && x <= x1)) return x0 === x1 ? w0 : w0 + ((w1 - w0) * (x - x0)) / (x1 - x0);
  }
  return p[0][1];
}

const DARK = "#0b0b0d";
const slats = (x0: number, x1: number, w: number, n: number) =>
  Array.from({ length: n }, (_, k) => {
    const x = x0 + ((x1 - x0) * k) / (n - 1);
    return <rect key={`s${k}`} x={x - 0.035} y={-w} width={0.07} height={2 * w} rx={0.03} fill="#000" opacity={0.5} />;
  });

const SPECS: Record<string, Spec> = {
  // Front engine, long bonnet with louvres, cabin set back, long fastback rear window
  mustang: {
    length: 4.9,
    body: [[2.45, 0], [2.43, 0.55], [2.3, 0.86], [2.0, 0.99], [1.45, 1.02], [0.95, 0.92], [0.2, 0.86], [-0.65, 0.92], [-1.27, 1.02], [-1.9, 0.99], [-2.36, 0.86], [-2.45, 0.6], [-2.45, 0]],
    cabin: [[0.2, 0.6], [-0.4, 0.6], [-1.1, 0.55], [-1.75, 0.42]],
    screen: -0.32,
    axles: [1.45, -1.27],
    wing: { x: -2.22, depth: 0.3, span: 1.96 },
    details: () => (
      <>
        {slats(0.85, 1.55, 0.36, 6)}
        <rect x={1.7} y={-0.16} width={0.55} height={0.32} rx={0.06} fill="#000" opacity={0.35} />
      </>
    ),
  },
  // Front engine, the longest: square nose with the two kidney grilles, cabin set back, short rear glass
  m4: {
    length: 5.02,
    body: [[2.51, 0], [2.5, 0.72], [2.42, 0.95], [2.05, 1.02], [1.55, 1.02], [1.05, 0.94], [0.2, 0.88], [-0.65, 0.93], [-1.35, 1.02], [-2.0, 1.0], [-2.45, 0.92], [-2.51, 0.7], [-2.51, 0]],
    cabin: [[0.4, 0.62], [-0.25, 0.61], [-1.0, 0.58], [-1.45, 0.5]],
    screen: -0.1,
    axles: [1.55, -1.35],
    wing: { x: -2.35, depth: 0.3, span: 1.98 },
    details: () => (
      <>
        <rect x={2.28} y={-0.42} width={0.2} height={0.33} rx={0.07} fill={DARK} />
        <rect x={2.28} y={0.09} width={0.2} height={0.33} rx={0.07} fill={DARK} />
        {slats(1.0, 1.75, 0.3, 5)}
      </>
    ),
  },
  // Mid engine: short nose with a big central vent, cabin forward, slatted engine cover behind it
  f296: {
    length: 4.59,
    body: [[2.3, 0], [2.27, 0.55], [2.12, 0.88], [1.75, 1.01], [1.35, 1.0], [0.85, 0.86], [0.1, 0.85], [-0.6, 0.97], [-1.25, 1.03], [-1.85, 1.0], [-2.22, 0.88], [-2.3, 0.6], [-2.3, 0]],
    cabin: [[0.95, 0.55], [0.25, 0.56], [-0.35, 0.5], [-0.75, 0.36]],
    screen: 0.4,
    axles: [1.35, -1.25],
    wing: { x: -2.12, depth: 0.3, span: 1.94 },
    details: () => (
      <>
        <path d="M2.0 -0.32L1.45 -0.22L1.45 0.22L2.0 0.32Z" fill="#000" opacity={0.45} />
        {slats(-0.95, -1.65, 0.42, 6)}
      </>
    ),
  },
  // Rear engine: round headlights on bulging front wings, cabin centred and sloping to the engine,
  // wide rear haunches, big swan-neck wing
  p992: {
    length: 4.62,
    body: [[2.31, 0], [2.28, 0.5], [2.15, 0.84], [1.85, 1.0], [1.42, 1.0], [0.85, 0.84], [0.1, 0.84], [-0.6, 0.98], [-1.15, 1.04], [-1.8, 1.02], [-2.22, 0.9], [-2.31, 0.6], [-2.31, 0]],
    cabin: [[0.75, 0.55], [0.1, 0.57], [-0.55, 0.5], [-1.1, 0.36]],
    screen: 0.2,
    axles: [1.42, -1.15],
    wing: { x: -1.95, depth: 0.38, span: 1.96 },
    details: () => (
      <>
        {[-1, 1].map((s) => <ellipse key={s} cx={1.95} cy={s * 0.62} rx={0.2} ry={0.15} fill="#e4e4e7" stroke="#000" strokeWidth={0.04} />)}
        {[-1, 1].map((s) => <path key={`c${s}`} d={`M2.2 ${s * 0.42}Q1.2 ${s * 0.48} 0.8 ${s * 0.56}`} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={0.05} />)}
        {slats(-1.35, -1.75, 0.38, 4)}
      </>
    ),
  },
  // Mid engine: narrow teardrop canopy forward, "eye socket" headlights, deep side intakes
  m720s: {
    length: 4.65,
    body: [[2.33, 0], [2.29, 0.6], [2.1, 0.92], [1.7, 1.02], [1.35, 1.0], [0.8, 0.82], [0.0, 0.84], [-0.7, 0.98], [-1.32, 1.03], [-1.95, 1.0], [-2.28, 0.86], [-2.33, 0.55], [-2.33, 0]],
    cabin: [[1.0, 0.5], [0.45, 0.55], [-0.2, 0.52], [-0.8, 0.38], [-1.3, 0.18]],
    screen: 0.4,
    axles: [1.35, -1.32],
    wing: { x: -2.15, depth: 0.3, span: 1.96 },
    details: () => (
      <>
        {[-1, 1].map((s) => <path key={s} d={`M2.15 ${s * 0.5}Q2.05 ${s * 0.85} 1.8 ${s * 0.82}Q1.85 ${s * 0.6} 2.15 ${s * 0.5}Z`} fill={DARK} />)}
        {[-1, 1].map((s) => <path key={`i${s}`} d={`M0.5 ${s * 0.78}L-0.4 ${s * 0.8}L-0.4 ${s * 0.62}L0.35 ${s * 0.6}Z`} fill={DARK} opacity={0.8} />)}
      </>
    ),
  },
};

/** The ACC car key → its drawing (null: the generic GT3). */
function specFor(car: string | null | undefined): Spec | null {
  const k = car ?? "";
  if (k.startsWith("ford_mustang")) return SPECS.mustang;
  if (k.startsWith("bmw_m4_gt3")) return SPECS.m4;
  if (k.startsWith("ferrari_296")) return SPECS.f296;
  if (k === "porsche_992_gt3_r") return SPECS.p992;
  if (k.startsWith("mclaren_720s")) return SPECS.m720s;
  return null;
}

/** Where the ABS light goes: the front of the car. */
export const noseOf = (car: string | null | undefined) => (specFor(car)?.length ?? 4.6) / 2;

export default function CarShape({ car, color }: { car?: string | null; color: string }) {
  const s = specFor(car);
  if (!s) return <GenericGT3 color={color} />;
  const tyre = (x: number) => [-1, 1].map((side) => {
    const w = widthAt(s.body, x);
    return <rect key={`${x}${side}`} x={x - 0.36} y={side > 0 ? w - 0.2 : -w - 0.06} width={0.72} height={0.26} rx={0.08} fill={DARK} />;
  });
  const glass = [...s.cabin.filter(([x]) => x > s.screen), [s.screen, widthAt(s.cabin, s.screen)] as [number, number]];
  const { wing } = s;
  return (
    <g>
      {tyre(s.axles[0])}
      {tyre(s.axles[1])}
      <path d={outline(s.body)} fill={color} stroke="#000" strokeWidth={0.06} strokeLinejoin="round" />
      <path d={outline(s.cabin)} fill={DARK} opacity={0.82} />
      <path d={outline(glass)} fill="#94a3b8" opacity={0.55} />
      {s.details?.(color)}
      <rect x={wing.x - wing.depth / 2} y={-wing.span / 2} width={wing.depth} height={wing.span} rx={0.06} fill="#111" />
      <rect x={wing.x - wing.depth / 2 - 0.05} y={-wing.span / 2 - 0.04} width={wing.depth + 0.12} height={0.09} fill="#111" />
      <rect x={wing.x - wing.depth / 2 - 0.05} y={wing.span / 2 - 0.05} width={wing.depth + 0.12} height={0.09} fill="#111" />
    </g>
  );
}

/** The generic GT3 (every other car), 4.6 × 2.0 m. */
function GenericGT3({ color }: { color: string }) {
  const body = "M2.3 0C2.3 -0.45 2.2 -0.8 1.95 -0.9Q1.4 -1.02 0.95 -0.94Q0.1 -0.86 -0.75 -0.94Q-1.35 -1.03 -2 -0.96Q-2.3 -0.93 -2.3 -0.7"
    + "L-2.3 0.7Q-2.3 0.93 -2 0.96Q-1.35 1.03 -0.75 0.94Q0.1 0.86 0.95 0.94Q1.4 1.02 1.95 0.9C2.2 0.8 2.3 0.45 2.3 0Z";
  return (
    <g>
      {[[1.05, 1.75], [-1.75, -0.95]].map(([a, b]) => [-1, 1].map((s) => (
        <rect key={`${a}${s}`} x={a} y={s > 0 ? 0.8 : -1.06} width={b - a} height={0.26} rx={0.08} fill={DARK} />
      )))}
      <path d={body} fill={color} stroke="#000" strokeWidth={0.1} strokeLinejoin="round" />
      <path d="M0.78 -0.56L-0.75 -0.5L-1.2 -0.4L-1.2 0.4L-0.75 0.5L0.78 0.56Q0.95 0 0.78 -0.56Z" fill={DARK} opacity={0.82} />
      <path d="M0.78 -0.56Q0.95 0 0.78 0.56L0.32 0.5Q0.42 0 0.32 -0.5Z" fill="#94a3b8" opacity={0.55} />
      <rect x={1.25} y={-0.42} width={0.42} height={0.12} rx={0.05} fill="#000" opacity={0.45} />
      <rect x={1.25} y={0.3} width={0.42} height={0.12} rx={0.05} fill="#000" opacity={0.45} />
      <rect x={-2.36} y={-1.0} width={0.28} height={2.0} rx={0.06} fill="#111" />
      <rect x={-2.4} y={-1.04} width={0.42} height={0.09} fill="#111" />
      <rect x={-2.4} y={0.95} width={0.42} height={0.09} fill="#111" />
    </g>
  );
}
