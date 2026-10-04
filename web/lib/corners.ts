// Corners on the site: corner maps built from the shape of the racing line, and per-corner metrics.
// cornerMetrics is a port of corners.py:corner_metrics (the app computes the same for each upload):
// keep both in step. Pure functions on 1 m grid arrays, no imports: also run by scripts/check-corners.mjs.

export type MapCorner = { id: number; name: string | null; start_m: number; apex_m: number; end_m: number; turn_deg?: number };
export type CornerMap = {
  track: string;
  length_m: number;
  version: number;
  source: string;
  method?: string;
  corners: MapCorner[];
  [key: string]: unknown;
};

// --- Per-corner metrics (port of corners.py) -------------------------------------------------

const FULL_THROTTLE = 98;    // %: full throttle
const PICKUP_THROTTLE = 10;  // %: throttle pickup
const COAST_THROTTLE = 5;    // %: below this, with no brake = coasting
const BRAKE_ON = 5;          // %: braking threshold (acc_telemetry.BRAKE_ON)
const BRAKE_GAP_S = 0.3;     // s: shorter gaps inside a braking zone are filled (acc_telemetry.BRAKE_GAP_S)

/** One lap on the 1 m grid, from its stored trace: time (s), speed (m/s), cleaned throttle and brake (%). */
export type LapChannels = { time: ArrayLike<number>; speed: ArrayLike<number>; throttle: ArrayLike<number>; brake: ArrayLike<number> };
export type CornerResult = {
  corner: number;
  time_s: number;
  entry_speed_kmh: number;
  lift_point_m: number | null;
  braking_point_m: number | null;
  brake_release_m: number | null;
  max_brake_pct: number | null;
  min_speed_kmh: number;
  apex_m: number | null;
  throttle_pickup_m: number | null;
  full_throttle_m: number | null;
  coasting_s: number;
  exit_speed_kmh: number;
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Bounds [start, end) of the run of true values containing i, or null if mask[i] is false. */
function runAround(mask: boolean[], i: number): [number, number] | null {
  if (!mask[i]) return null;
  let s = i, e = i;
  while (s > 0 && mask[s - 1]) s--;
  while (e < mask.length && mask[e]) e++;
  return [s, e];
}

/** Braking zone: cleaned brake above the threshold, gaps shorter than BRAKE_GAP_S filled. */
export function brakeZone(brake: ArrayLike<number>, time: ArrayLike<number>): boolean[] {
  const on = Array.from(brake, (b) => b > BRAKE_ON);
  const zone = [...on];
  for (let s = 0; s < on.length; s++) {
    if (on[s]) continue;
    let e = s;
    while (e < on.length && !on[e]) e++;
    if (s > 0 && e < on.length && time[e] - time[s] < BRAKE_GAP_S) zone.fill(true, s, e);
    s = e;
  }
  return zone;
}

/** Metrics of each corner for one lap (corner boundaries in the lap's metres). Distances in m from
 *  the line; null when the event does not happen (flat-out corner: no lift, no braking). */
export function cornerMetrics(lap: LapChannels, corners: MapCorner[]): CornerResult[] {
  const n = lap.time.length;
  const t = lap.time;
  const v = Array.from(lap.speed, (x) => 3.6 * x);
  const thr = lap.throttle, brk = lap.brake;
  const braking = brakeZone(brk, t);
  const partial = Array.from(thr, (x) => x < FULL_THROTTLE);
  const dt = new Float64Array(n);           // numpy.gradient
  for (let i = 0; i < n; i++)
    dt[i] = i === 0 ? t[1] - t[0] : i === n - 1 ? t[n - 1] - t[n - 2] : (t[i + 1] - t[i - 1]) / 2;
  const m = (i: number | null) => (i == null ? null : r1(Math.min(i, n - 1)));   // 1 m grid: distance = index
  const searchsorted = (x: number) => Math.min(n, Math.max(0, Math.ceil(x - 1e-9)));

  return corners.map((c) => {
    const s = searchsorted(c.start_m);
    const e = Math.min(searchsorted(c.end_m), n - 1);
    let a = s;
    for (let i = s; i <= e; i++) if (v[i] < v[a]) a = i;    // this lap's apex = minimum speed

    // Braking point: start of the main braking event before the apex (the braking run that loses
    // the most speed); may be before the corner start when the driver brakes early
    let bRun: [number, number] | null = null, drop = -Infinity;
    for (let i = s; i <= a; i++) {
      if (!braking[i] || (i > s && braking[i - 1])) continue;
      const run = runAround(braking, i)!;
      const loss = v[run[0]] - v[Math.min(run[1], a)];
      if (loss > drop) { bRun = run; drop = loss; }
    }
    const brakeOn = bRun ? bRun[0] : null, brakeOff = bRun ? bRun[1] : null;

    // Lift: partial-throttle run around the braking point; with brake/throttle overlap, the first
    // lift after it; without braking, around the apex or the last one before it
    const anchor = brakeOn ?? a;
    let run = runAround(partial, anchor);
    if (run == null && brakeOn != null) {
      for (let i = brakeOn; i <= a; i++) if (partial[i]) { run = runAround(partial, i); break; }
    } else if (run == null) {
      for (let i = anchor; i >= s; i--) if (partial[i]) { run = runAround(partial, i); break; }
    }
    const lift = run ? run[0] : null;

    let full: number | null = null, pickup: number | null = null, coast = 0;
    if (lift != null) {
      for (let i = a; i <= e; i++) if (!partial[i]) { full = i; break; }
      const from = brakeOff ?? lift;
      for (let i = from; i <= e; i++) if (thr[i] > PICKUP_THROTTLE) { pickup = i; break; }
      for (let i = lift; i < (full ?? e + 1); i++) if (thr[i] < COAST_THROTTLE && !braking[i]) coast += dt[i];
    }
    let maxBrake: number | null = null;
    if (bRun) {
      maxBrake = -Infinity;
      for (let i = bRun[0]; i < bRun[1]; i++) maxBrake = Math.max(maxBrake, brk[i]);
      maxBrake = r1(maxBrake);
    }
    return {
      corner: c.id,
      time_s: r3(t[e] - t[s]),
      entry_speed_kmh: r1(v[lift ?? s]),
      lift_point_m: m(lift),
      braking_point_m: m(brakeOn),
      brake_release_m: m(brakeOff),
      max_brake_pct: maxBrake,
      min_speed_kmh: r1(v[a]),
      apex_m: m(a),
      throttle_pickup_m: m(pickup),
      full_throttle_m: m(full),
      coasting_s: r3(coast),
      exit_speed_kmh: r1(v[e]),
    };
  });
}

/** Corner boundaries rescaled from the map's length to a lap's distance grid. */
export function scaledCorners(map: Pick<CornerMap, "length_m" | "corners">, lengthM: number): MapCorner[] {
  const k = lengthM / map.length_m;
  return map.corners.map((c) => ({ ...c, start_m: c.start_m * k, apex_m: c.apex_m * k, end_m: c.end_m * k }));
}

/** The text corners.map_hash fingerprints (sha256, first 16 hex characters): the exact output of
 *  Python's json.dumps for the same values, so the app and the site agree on a map's fingerprint. */
export function mapHashKey(map: Pick<CornerMap, "track" | "length_m" | "corners">): string {
  const f = (x: number) => Number(x).toFixed(1);
  const corners = map.corners.map((c) => `[${c.id}, "${f(c.start_m)}", "${f(c.apex_m)}", "${f(c.end_m)}"]`);
  return `[${JSON.stringify(map.track)}, "${f(map.length_m)}", [${corners.join(", ")}]]`;
}

// --- Corner maps from the racing line's shape ---------------------------------------------------

/** One lap's racing line on its 1 m grid: positions (m, game coordinates seen from above: x right,
 *  z down) and speed (m/s). */
export type LapLine = { x: ArrayLike<number>; z: ArrayLike<number>; speed: ArrayLike<number> };

export const DETAIL = {
  // Curve = curvature above `on` (radius under 1/on m), extended while above on/2; kept if it turns
  // by at least `turn` degrees. Same-direction curves closer than 30 m are one corner, unless the
  // curvature between two tighter parts drops under `split` × the smaller of their peaks (double
  // corners, esses) and both parts turn by `turn` degrees.
  fewer: { on: 1 / 120, turn: 35, split: 0 },
  normal: { on: 1 / 200, turn: 25, split: 0.25 },
  more: { on: 1 / 350, turn: 15, split: 0.5 },
} as const;
export type Detail = keyof typeof DETAIL;
const MERGE_M = 30;
const LINE_SMOOTH_M = 8;     // Gaussian sigma on positions
const CURV_SMOOTH_M = 10;    // and on curvature
const FLAT_KMH = 3;          // a corner with less speed variation is flat out: apex at the tightest point

function circularGauss(x: Float64Array, sigma: number): Float64Array {
  const n = x.length, w = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * w + 1 }, (_, j) => Math.exp(-((j - w) ** 2) / (2 * sigma * sigma)));
  const ks = k.reduce((a, b) => a + b, 0);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -w; j <= w; j++) acc += x[(((i + j) % n) + n) % n] * k[j + w];
    out[i] = acc / ks;
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Value of a lap's channel at a fraction of the lap (linear interpolation on its own grid). */
function at(ch: ArrayLike<number>, f: number): number {
  const p = f * ch.length, i = Math.min(Math.floor(p), ch.length - 1), j = Math.min(i + 1, ch.length - 1);
  return ch[i] + (ch[j] - ch[i]) * (p - i);
}

export type Proposal = {
  length_m: number;
  corners: MapCorner[];
  line: { x: number[]; z: number[] };       // averaged racing line, every 4 m (display)
};

/** Corners from the averaged racing line of several clean laps (median position at each fraction
 *  of the lap). A corner runs from the speed peak before it to the speed peak after it (between two
 *  corners without a real speed peak, such as a chicane: halfway between the two curves), so corner
 *  times add up to the lap time. Laps must share the track's distance grid (lengths within ~1 %). */
export function buildFromLines(laps: LapLine[], detail: Detail = "normal"): Proposal {
  const lengths = laps.map((l) => l.x.length);
  const n = Math.round(median(lengths));
  const pick = (get: (l: LapLine) => ArrayLike<number>) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = median(laps.map((l) => at(get(l), i / n)));
    return out;
  };
  const x = circularGauss(pick((l) => l.x), LINE_SMOOTH_M);
  const z = circularGauss(pick((l) => l.z), LINE_SMOOTH_M);
  const v = Array.from(pick((l) => l.speed), (s) => s * 3.6);

  // Signed curvature (rad/m): heading change per metre; positive = turning right on the map
  const k = 3, ds = 1;
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n, b = (i + k) % n;
    heading[i] = Math.atan2(z[b] - z[a], x[b] - x[a]);
  }
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let d = heading[(i + 1) % n] - heading[i];
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    raw[i] = d / ds;
  }
  const kappa = circularGauss(raw, CURV_SMOOTH_M);

  // Curves: above `on`, extended while above on/2 with the same sign
  const { on, turn, split: splitRatio } = DETAIL[detail];
  type Curve = { s: number; e: number; sign: number };
  let curves: Curve[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(kappa[i]) < on || curves.some((c) => i >= c.s && i <= c.e)) continue;
    const sign = Math.sign(kappa[i]);
    let s = i, e = i;
    while (s > 0 && Math.sign(kappa[s - 1]) === sign && Math.abs(kappa[s - 1]) >= on / 2) s--;
    while (e < n - 1 && Math.sign(kappa[e + 1]) === sign && Math.abs(kappa[e + 1]) >= on / 2) e++;
    curves.push({ s, e, sign });
  }
  curves.sort((a, b) => a.s - b.s);
  curves = curves.reduce<Curve[]>((acc, c) => {
    const last = acc.at(-1);
    if (last && last.sign === c.sign && c.s - last.e <= MERGE_M) last.e = Math.max(last.e, c.e);
    else acc.push({ ...c });
    return acc;
  }, []);
  const angle = (c: Curve) => {
    let sum = 0;
    for (let i = c.s; i <= c.e; i++) sum += kappa[i] * ds;
    return (sum * 180) / Math.PI;
  };
  const peak = (s: number, e: number) => {
    let p = 0;
    for (let i = s; i <= e; i++) p = Math.max(p, Math.abs(kappa[i]));
    return p;
  };
  const split = (c: Curve): Curve[] => {
    let best = -1, bestRatio: number = splitRatio;
    for (let i = c.s + 1; i < c.e; i++) {
      const k = Math.abs(kappa[i]);
      if (k > Math.abs(kappa[i - 1]) || k > Math.abs(kappa[i + 1])) continue;   // local minimum only
      const ratio = k / Math.min(peak(c.s, i), peak(i, c.e));
      if (ratio < bestRatio) { bestRatio = ratio; best = i; }
    }
    if (best < 0) return [c];
    const a = { ...c, e: best }, b = { ...c, s: best + 1 };
    if (Math.abs(angle(a)) < turn || Math.abs(angle(b)) < turn) return [c];
    return [...split(a), ...split(b)];
  };
  const kept = curves.flatMap(split).filter((c) => Math.abs(angle(c)) >= turn);

  // Apex: slowest point of the curve, or its tightest point when it is taken flat out
  const apexes = kept.map((c) => {
    let slow = c.s, fast = c.s, tight = c.s;
    for (let i = c.s; i <= c.e; i++) {
      if (v[i] < v[slow]) slow = i;
      if (v[i] > v[fast]) fast = i;
      if (Math.abs(kappa[i]) > Math.abs(kappa[tight])) tight = i;
    }
    return v[fast] - v[slow] >= FLAT_KMH ? slow : tight;
  });
  // Boundaries between consecutive corners
  const bounds: number[] = [0];
  for (let j = 0; j + 1 < kept.length; j++) {
    const a = apexes[j], b = apexes[j + 1];
    let peak = a;
    for (let i = a; i <= b; i++) if (v[i] > v[peak]) peak = i;
    const realPeak = v[peak] - Math.max(v[a], v[b]) > 2 && peak > a && peak < b;
    bounds.push(realPeak ? peak : Math.round((kept[j].e + kept[j + 1].s) / 2));
  }
  bounds.push(n);

  const step = 1; // grid of n points over the lap: point i is i metres from the line
  const corners: MapCorner[] = kept.map((c, j) => ({
    id: j + 1,
    name: null,
    start_m: r1(bounds[j] * step),
    apex_m: r1(apexes[j] * step),
    end_m: r1(Math.min(bounds[j + 1], n - 1) * step),
    turn_deg: Math.round(angle(c)),
  }));
  if (corners.length) corners[corners.length - 1].end_m = r1((n - 1) * step);
  const line = { x: [] as number[], z: [] as number[] };
  for (let i = 0; i < n; i += 4) { line.x.push(r1(x[i])); line.z.push(r1(z[i])); }
  return { length_m: r1(n * step), corners, line };
}

/** Names of the old map's corners carried to the new one when the apex moved by less than 30 m. */
export function carryNames(next: MapCorner[], old: MapCorner[] | null | undefined, k = 1): MapCorner[] {
  return next.map((c) => {
    const near = (old ?? []).filter((o) => o.name && Math.abs(o.apex_m * k - c.apex_m) < 30);
    return near.length ? { ...c, name: near[0].name } : c;
  });
}
