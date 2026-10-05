import "server-only";
import { sql } from "./db";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";
import tumftm from "./track-data/tumftm.json";

// Automatic track surface (white lines), so nobody has to drive edge laps. ACC does not publish the
// track edges; the team's laps show where the track is, and touch its edges at turn-in, apex and
// exit. Everything happens in the frame of the team's mean line (1 m grid, normal pointing to the
// driver's right): `lo`/`hi` = how far left/right any valid lap went (car centre ± 1 m to the outer
// side of the tyres). A first guess of the track (centre `c0`, half width `h0`) is then shifted
// locally, as little as possible, until every lap fits inside, and smoothed:
// - tracks of the TUM racetrack database (lib/track-data, satellite widths, LGPL-3.0): its centre
//   line and widths, aligned to the game's coordinates automatically (reflection, rotation, scale,
//   position matched to the team's line); kept only if it needs small corrections (the data has
//   local errors of 1-3 m, corrected by the laps);
// - any other track: centre = the middle of the laps' band averaged over ±60 m, width = the 90th
//   percentile of the width the laps need (9-16 m), wider wherever the laps need more.

export type EdgeLine = { x: number[]; z: number[] };
export type Outline = { left: EdgeLine; right: EdgeLine; source: "laps" | "tumftm"; laps: number };
type Pt = [number, number];

const HALF_CAR_M = 1.0;
const MAX_LAPS = 80;
const OUT_STEP = 2;          // m between output points
const VERSION = 2;           // bump when the method changes: stored outlines are then recomputed

// --- small numeric helpers (circular arrays: the lap is a loop) ---------------------------------

function rollMean(a: Float64Array, k: number) {
  const n = a.length, out = new Float64Array(n);
  let s = 0;
  for (let j = -k; j <= k; j++) s += a[(j + n) % n];
  for (let i = 0; i < n; i++) {
    out[i] = s / (2 * k + 1);
    s += a[(i + k + 1) % n] - a[(i - k + n) % n];
  }
  return out;
}

function rollMax(a: Float64Array, k: number) {
  const n = a.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = -k; j <= k; j++) m = Math.max(m, a[(i + j + n) % n]);
    out[i] = m;
  }
  return out;
}

const percentile = (a: ArrayLike<number>, p: number) => {
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

/** Nearest-point queries on a fixed point set (uniform grid). */
class Grid {
  private cells = new Map<number, number[]>();
  private static key = (x: number, y: number) => (x + 1e5) * 2e5 + (y + 1e5);
  constructor(readonly pts: Pt[], private cell = 10) {
    pts.forEach((p, i) => {
      const key = Grid.key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
      (this.cells.get(key) ?? this.cells.set(key, []).get(key)!).push(i);
    });
  }
  private visit(x: number, y: number, q: Pt, best: { i: number; d: number }) {
    const ids = this.cells.get(Grid.key(x, y));
    if (ids) for (const i of ids) {
      const dx = this.pts[i][0] - q[0], dy = this.pts[i][1] - q[1], d = dx * dx + dy * dy;
      if (d < best.d) { best.d = d; best.i = i; }
    }
  }
  nearest(q: Pt): { i: number; d: number } {
    const cx = Math.floor(q[0] / this.cell), cy = Math.floor(q[1] / this.cell);
    const best = { i: -1, d: Infinity };   // squared distance while searching
    for (let r = 0; r < 400; r++) {
      if (best.i >= 0 && ((r - 1) * this.cell) ** 2 > best.d) break;   // ring r is at least (r - 1) cells away
      if (r === 0) { this.visit(cx, cy, q, best); continue; }
      for (let k = -r; k <= r; k++) {      // ring r only
        this.visit(cx + k, cy - r, q, best); this.visit(cx + k, cy + r, q, best);
        if (k > -r && k < r) { this.visit(cx - r, cy + k, q, best); this.visit(cx + r, cy + k, q, best); }
      }
    }
    return { i: best.i, d: Math.sqrt(best.d) };
  }
}

// --- the team's laps ------------------------------------------------------------------------

type Frame = { mx: Float64Array; mz: Float64Array; nx: Float64Array; nz: Float64Array; lo: Float64Array; hi: Float64Array };

/** Mean line, its right-hand normals and the band the laps use. Laps share the 1 m grid. */
function frame(laps: { x: Float64Array; z: Float64Array }[]): Frame {
  const n = Math.min(...laps.map((l) => l.x.length)), K = laps.length;
  const mx = new Float64Array(n), mz = new Float64Array(n);
  for (const l of laps) for (let i = 0; i < n; i++) { mx[i] += l.x[i] / K; mz[i] += l.z[i] / K; }
  // A lap starts where the previous one ended, not where it ends itself: the loop has a small jump
  // at the line, spread over the 50 m on each side of it
  const jx = mx[0] - (2 * mx[n - 1] - mx[n - 2]), jz = mz[0] - (2 * mz[n - 1] - mz[n - 2]);
  for (let i = 0; i < 50; i++) {
    const w = 0.5 * (1 - i / 50);
    mx[i] -= jx * w; mz[i] -= jz * w;
    mx[n - 1 - i] += jx * w; mz[n - 1 - i] += jz * w;
  }
  const sx = rollMean(mx, 5), sz = rollMean(mz, 5);
  const nx = new Float64Array(n), nz = new Float64Array(n);
  for (let i = 0; i < n; i++) {   // driver's right with z down: (-tz, tx)
    const a = (i - 6 + n) % n, b = (i + 6) % n;
    const tx = sx[b] - sx[a], tz = sz[b] - sz[a], len = Math.hypot(tx, tz) || 1;
    nx[i] = -tz / len; nz[i] = tx / len;
  }
  // Band: extreme offsets (the 2nd most extreme with 6+ laps: one lap's moment off the line does not widen the track)
  const lo = new Float64Array(n), hi = new Float64Array(n), skip = K >= 6 ? 1 : 0;
  const off = new Float64Array(K);
  for (let i = 0; i < n; i++) {
    laps.forEach((l, k) => { off[k] = (l.x[i] - mx[i]) * nx[i] + (l.z[i] - mz[i]) * nz[i]; });
    const s = Float64Array.from(off).sort();
    lo[i] = s[skip] - HALF_CAR_M;
    hi[i] = s[K - 1 - skip] + HALF_CAR_M;
  }
  return { mx, mz, nx, nz, lo, hi };
}

/** Shifts the guessed track (c0, h0) as little as possible so the band fits, then smooths it. */
function fit(f: Frame, c0: Float64Array, h0: Float64Array) {
  const n = c0.length, h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = Math.max(h0[i], (f.hi[i] - f.lo[i]) / 2);
  const clamp = (c: Float64Array) => c.map((v, i) => Math.min(f.lo[i] + h[i], Math.max(f.hi[i] - h[i], v)));
  let c = clamp(c0);
  for (let it = 0; it < 30; it++) c = clamp(rollMean(c, 12));
  const hs = rollMean(h, 12);
  for (let i = 0; i < n; i++) hs[i] = Math.max(hs[i], f.hi[i] - c[i], c[i] - f.lo[i]);
  return { c, h: hs };
}

function lapsGuess(f: Frame) {
  const n = f.lo.length, mid = new Float64Array(n);
  for (let i = 0; i < n; i++) mid[i] = (f.lo[i] + f.hi[i]) / 2;
  const c0 = rollMean(mid, 60), need = new Float64Array(n);
  for (let i = 0; i < n; i++) need[i] = 2 * Math.max(f.hi[i] - c0[i], c0[i] - f.lo[i]);
  const width = Math.min(16, Math.max(9, percentile(need, 90)));
  const h0 = new Float64Array(n).fill(width / 2);
  return { c0, h0: rollMean(rollMax(h0, 15), 15) };
}

// --- TUM racetrack database ------------------------------------------------------------------

type Similarity = { s: number; cos: number; sin: number; refl: boolean; tx: number; tz: number };
const apply = (t: Similarity, p: Pt): Pt => {
  const y = t.refl ? -p[1] : p[1];
  return [t.s * (t.cos * p[0] - t.sin * y) + t.tx, t.s * (t.sin * p[0] + t.cos * y) + t.tz];
};

/** Reflection, rotation, scale and position mapping the TUM centre line onto the team's line. */
function align(M: Pt[], T: Pt[]): Similarity {
  const mean = (P: Pt[]): Pt => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  const m0 = mean(M), t0 = mean(T);
  const Mc = M.filter((_, i) => i % Math.max(1, Math.floor(M.length / 300)) === 0).map((p): Pt => [p[0] - m0[0], p[1] - m0[1]]);
  const Tc = T.map((p): Pt => [p[0] - t0[0], p[1] - t0[1]]);
  // Coarse: every 2°, both reflections; the team's points are turned back onto the fixed TUM grid
  let best = { cost: Infinity, refl: false, a: 0 };
  for (const refl of [false, true]) {
    const grid = new Grid(Tc.map((p): Pt => [p[0], refl ? -p[1] : p[1]]), 15);
    for (let deg = 0; deg < 360; deg += 2) {
      const a = (deg * Math.PI) / 180, c = Math.cos(-a), s = Math.sin(-a);
      let cost = 0;
      for (const p of Mc) cost += grid.nearest([c * p[0] - s * p[1], s * p[0] + c * p[1]]).d;
      if (cost < best.cost) best = { cost, refl, a };
    }
  }
  const t: Similarity = { s: 1, cos: Math.cos(best.a), sin: Math.sin(best.a), refl: best.refl, tx: 0, tz: 0 };
  [t.tx, t.tz] = (() => { const p = apply({ ...t, tx: 0, tz: 0 }, t0); return [m0[0] - p[0], m0[1] - p[1]] as Pt; })();
  // Fine: ICP (each team point ↔ nearest TUM point), closed-form 2D similarity, reflection kept
  const Md = M.filter((_, i) => i % 3 === 0);
  const Tr = T.map((p): Pt => [p[0], t.refl ? -p[1] : p[1]]);
  for (let it = 0; it < 40; it++) {
    const grid = new Grid(Tr.map((p) => apply({ ...t, refl: false }, p)), 10);
    const A = Md.map((p) => Tr[grid.nearest(p).i]), B = Md;
    const ma = mean(A), mb = mean(B);
    let sxx = 0, sxy = 0, va = 0;
    A.forEach((a, k) => {
      const ax = a[0] - ma[0], ay = a[1] - ma[1], bx = B[k][0] - mb[0], by = B[k][1] - mb[1];
      sxx += ax * bx + ay * by; sxy += ax * by - ay * bx; va += ax * ax + ay * ay;
    });
    const ang = Math.atan2(sxy, sxx);
    t.cos = Math.cos(ang); t.sin = Math.sin(ang);
    t.s = Math.min(1.03, Math.max(0.97, Math.hypot(sxx, sxy) / va));
    t.tx = mb[0] - t.s * (t.cos * ma[0] - t.sin * ma[1]);
    t.tz = mb[1] - t.s * (t.sin * ma[0] + t.cos * ma[1]);
  }
  return t;
}

/** The TUM edges as offsets along the team frame's normals, or null when the data does not match. */
function tumGuess(f: Frame, key: string) {
  const data = (tumftm as Record<string, { xywrwl: number[] }>)[key];
  if (!data) return null;
  const v = data.xywrwl, T: Pt[] = [], wr: number[] = [], wl: number[] = [];
  for (let i = 0; i < v.length; i += 4) { T.push([v[i], v[i + 1]]); wr.push(v[i + 2]); wl.push(v[i + 3]); }
  const n = f.mx.length, M: Pt[] = Array.from({ length: n }, (_, i) => [f.mx[i], f.mz[i]]);
  const t = align(M, T);
  // Edge points in game coordinates, densified to ≤ 1 m
  const edge = (side: 1 | -1) => {
    const out: Pt[] = [];
    const P = T.map((p, i): Pt => {
      const a = T[(i - 1 + T.length) % T.length], b = T[(i + 1) % T.length];
      const tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
      const w = side === 1 ? wr[i] : wl[i];   // right of travel with y up: (ty, -tx)
      return apply(t, [p[0] + (side * ty * w) / len, p[1] - (side * tx * w) / len]);
    });
    P.forEach((p, i) => {
      const q = P[(i + 1) % P.length], k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])));
      for (let j = 0; j < k; j++) out.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k]);
    });
    return new Grid(out, 8);
  };
  const g1 = edge(1), g2 = edge(-1);
  const offset = (g: Grid, i: number) => {
    const { i: j } = g.nearest(M[i]);
    const p = g.pts[j];
    return (p[0] - f.mx[i]) * f.nx[i] + (p[1] - f.mz[i]) * f.nz[i];
  };
  const c0 = new Float64Array(n), h0 = new Float64Array(n), shift = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = offset(g1, i), b = offset(g2, i);
    c0[i] = (a + b) / 2; h0[i] = Math.abs(a - b) / 2;
    const h = Math.max(h0[i], (f.hi[i] - f.lo[i]) / 2);
    shift[i] = Math.abs(Math.min(f.lo[i] + h, Math.max(f.hi[i] - h, c0[i])) - c0[i]);
  }
  // Brands Hatch needs median 0 m, 95th percentile 1.8 m: a wrong match needs far more
  if (percentile(shift, 50) > 1 || percentile(shift, 95) > 3.5 || percentile(h0, 50) < 3) return null;
  return { c0, h0 };
}

// --- outline --------------------------------------------------------------------------------

export async function computeOutline(trackId: string, key: string): Promise<(Outline & { lastLapId: string }) | null> {
  const rows = await sql<{ id: string; x: EncodedChannel; z: EncodedChannel }[]>`
    select l.id, tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z
    from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${trackId} and l.comparable and tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m'
    order by l.id desc limit ${MAX_LAPS}`;
  if (!rows.length) return null;
  const seen = new Set<string>();
  let laps = rows.filter((r) => !seen.has(r.x.data) && seen.add(r.x.data))
    .map((r) => ({ x: decodeStored(r.x), z: decodeStored(r.z) }));
  // Same layout only: the most common trace length (± 1 %)
  const lengths = laps.map((l) => l.x.length).sort((a, b) => a - b), typical = lengths[Math.floor(lengths.length / 2)];
  laps = laps.filter((l) => Math.abs(l.x.length - typical) <= typical * 0.01);
  if (laps.length === 0 || typical < 500) return null;

  const f = frame(laps);
  const tum = tumGuess(f, key);
  const { c0, h0 } = tum ?? lapsGuess(f);
  const { c, h } = fit(f, c0, h0);
  const left: EdgeLine = { x: [], z: [] }, right: EdgeLine = { x: [], z: [] };
  const r = (v: number) => Math.round(v * 10) / 10;
  for (let i = 0; i < c.length; i += OUT_STEP) {
    left.x.push(r(f.mx[i] + f.nx[i] * (c[i] - h[i]))); left.z.push(r(f.mz[i] + f.nz[i] * (c[i] - h[i])));
    right.x.push(r(f.mx[i] + f.nx[i] * (c[i] + h[i]))); right.z.push(r(f.mz[i] + f.nz[i] * (c[i] + h[i])));
  }
  return { left, right, source: tum ? "tumftm" : "laps", laps: laps.length, lastLapId: rows[0].id };
}

/** Stored outline, recomputed when a newer valid lap exists. Before migration 0009 it is computed
 *  on each call (slower, not stored). */
export async function trackOutline(trackId: string, key: string): Promise<Outline | null> {
  const [newest] = await sql<{ id: string | null }[]>`
    select max(l.id) as id from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${trackId} and l.comparable and tr.channels ? 'pos_x_m'`;
  let stored: { source: Outline["source"]; laps: number; last_lap_id: string | null; points: { left: EdgeLine; right: EdgeLine; v?: number } } | undefined;
  try {
    [stored] = await sql`select source, laps, last_lap_id, points from track_outline where track_id = ${trackId}`;
  } catch {
    const o = await computeOutline(trackId, key);
    return o && { left: o.left, right: o.right, source: o.source, laps: o.laps };
  }
  if (stored && stored.points.v === VERSION && (!newest?.id || stored.last_lap_id === newest.id))
    return { left: stored.points.left, right: stored.points.right, source: stored.source, laps: stored.laps };
  const o = await computeOutline(trackId, key);
  if (!o) return null;
  await sql`
    insert into track_outline (track_id, source, laps, last_lap_id, points)
    values (${trackId}, ${o.source}, ${o.laps}, ${o.lastLapId}, ${sql.json({ left: o.left, right: o.right, v: VERSION })})
    on conflict (track_id) do update set source = excluded.source, laps = excluded.laps, last_lap_id = excluded.last_lap_id,
                                         points = excluded.points, computed_at = now()`;
  return { left: o.left, right: o.right, source: o.source, laps: o.laps };
}

/** After an upload: brings the session's track outline up to date, so the next viewer does not wait. */
export async function refreshOutlineForSession(sessionId: string) {
  const [t] = await sql<{ id: string; key: string }[]>`
    select t.id, t.key from session s join track t on t.id = s.track_id where s.id = ${sessionId}`;
  if (t) await trackOutline(t.id, t.key);
}
