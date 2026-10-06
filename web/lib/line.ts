// Racing line through a corner, measured against the track's white lines (lib/track-edges.ts):
// where the driver turns in, how much track is left on the outside at turn-in, how close the car
// gets to the inside line at the apex (and where), and how much is left on the outside at the exit.
// Compared with the reference lap, it gives line advice for the coach (user's request: a T1
// sacrifice is almost always about the line). Distances are from the car's centre, minus half the
// car: 0 m = wheels on the white line, negative = over it (kerbs). Pure functions, no imports.

export type EdgeLine = { x: number[]; z: number[] };
export type LineLap = { x: ArrayLike<number>; z: ArrayLike<number>; steer: ArrayLike<number> | null };
/** One corner on one lap (distances along the lap in that lap's metres). */
export type CornerLine = {
  side: "left" | "right";       // the inside of the corner
  turn_in_m: number | null;      // where the steering starts to wind on
  entry_room_m: number;          // to the outside line at turn-in (or 60 m before the apex)
  apex_at_m: number;             // closest to the inside line
  apex_room_m: number;           // to the inside line there
  exit_room_m: number;           // closest to the outside line after the apex
  wide_room_m: number;           // closest to the outside line anywhere in the corner (< 0: past it)
};

const HALF_CAR_M = 1.0;      // car centre to the outer side of the tyres (as in lib/track-edges.ts)
const MIN_TURN_DEG = 12;     // a straighter corner (kink) gets no line analysis
const TURN_IN_SHARE = 0.25;  // turn-in: the steering is under this share of its peak before it
const EXIT_SPAN_M = 150;     // the exit is looked for up to this far after the apex

/** Distances from points to a polyline, following the points along it (a hint keeps each search
 *  local; the first one, or a jump, searches the whole line). */
function edgeDistance(edge: EdgeLine) {
  const n = edge.x.length;
  let hint = -1;
  const seg = (i: number, px: number, pz: number) => {
    const j = (i + 1) % n, ax = edge.x[i], az = edge.z[i], bx = edge.x[j] - ax, bz = edge.z[j] - az;
    const len2 = bx * bx + bz * bz || 1, t = Math.max(0, Math.min(1, ((px - ax) * bx + (pz - az) * bz) / len2));
    return Math.hypot(px - ax - t * bx, pz - az - t * bz);
  };
  return (px: number, pz: number) => {
    let best = -1, bd = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % n) + n) % n, d = (edge.x[i] - px) ** 2 + (edge.z[i] - pz) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    };
    if (hint < 0) scan(0, n - 1);
    else {
      scan(hint - 40, hint + 40);
      if (Math.sqrt(bd) > 40) { bd = Infinity; scan(0, n - 1); }
    }
    hint = best;
    return Math.min(seg(best, px, pz), seg((best - 1 + n) % n, px, pz));
  };
}

/** Turn-in point of a corner on a lap (1 m grid): back from the steering peak before the apex, the
 *  first point under a quarter of it. Also each corner's reference point (lib/corner-refs.ts).
 *  `from`: where the corner starts on the lap, so a corner taken flat right after another one does
 *  not pick up that one's steering. */
export function turnInAt(steer: ArrayLike<number>, apex: number, from = -Infinity): number | null {
  const n = steer.length, a = Math.round(apex);
  if (a <= 0 || a >= n) return null;
  let peak = a;
  for (let i = Math.max(0, a - 150, Math.round(from)); i <= Math.min(n - 1, a + 20); i++) if (Math.abs(steer[i]) > Math.abs(steer[peak])) peak = i;
  if (Math.abs(steer[peak]) < 0.02) return null;   // no steering to speak of
  const sign = Math.sign(steer[peak]), limit = Math.abs(steer[peak]) * TURN_IN_SHARE;
  for (let i = peak; i > Math.max(0, a - 250); i--) if (steer[i] * sign < limit) return i;
  return null;
}

/** The line through one corner of a lap, or null (kink, or no positions there). apex_m: the lap's
 *  apex (slowest point) in its metres; the lap's grid is 1 m. `side`: the inside, when already known
 *  from the other lap (both laps must be measured against the same line). */
export function cornerLine(lap: LineLap, edges: { left: EdgeLine; right: EdgeLine }, apex_m: number, end_m: number,
                           known?: "left" | "right"): CornerLine | null {
  const n = Math.min(lap.x.length, lap.z.length);
  const a = Math.round(apex_m);
  if (a < 30 || a > n - 30) return null;
  // Inside of the corner: the way the heading turns from 25 m before the apex to 25 m after it
  const t1x = lap.x[a] - lap.x[a - 25], t1z = lap.z[a] - lap.z[a - 25];
  const t2x = lap.x[a + 25] - lap.x[a], t2z = lap.z[a + 25] - lap.z[a];
  const cross = t1x * t2z - t1z * t2x, angle = Math.abs(Math.atan2(cross, t1x * t2x + t1z * t2z)) * 180 / Math.PI;
  if (!known && angle < MIN_TURN_DEG) return null;
  const side = known ?? (cross > 0 ? "right" : "left");
  const inside = edgeDistance(edges[side]), outside = edgeDistance(edges[side === "right" ? "left" : "right"]);

  const turnIn = lap.steer ? turnInAt(lap.steer, a) : null;
  const from = turnIn ?? Math.max(0, a - 60);
  const to = Math.min(n - 1, a + 60 + EXIT_SPAN_M, Math.max(end_m, a + 100));
  // Signed room to each line (wheels inside the track > 0): the distances alone cannot tell a car
  // past a line from one inside it, but off the track the two add up to more than the track's width
  // (their usual sum through the corner), and the car is past the nearer line
  const dIn: number[] = [], dOut: number[] = [];
  for (let i = from; i <= to; i++) { dIn.push(inside(lap.x[i], lap.z[i])); dOut.push(outside(lap.x[i], lap.z[i])); }
  const sums = dIn.map((d, j) => d + dOut[j]).sort((p, q) => p - q), width = sums[sums.length >> 1];
  const roomIn = dIn.map((d, j) => (d + dOut[j] > width + 1 && d < dOut[j] ? -d : d) - HALF_CAR_M);
  const roomOut = dOut.map((d, j) => (d + dIn[j] > width + 1 && d < dIn[j] ? -d : d) - HALF_CAR_M);
  const entry = roomOut[0];
  // Apex: closest to the inside line before the exit; where it is = the middle of the stretch within
  // 0.3 m of that (a car hugging the inside of a hairpin for 40 m has its apex in the middle)
  const last = Math.min(roomIn.length - 1, a + 60 - from);
  const apexRoom = Math.min(...roomIn.slice(0, last + 1));
  let s = roomIn.indexOf(apexRoom), e = s;
  while (s > 0 && roomIn[s - 1] <= apexRoom + 0.3) s--;
  while (e < last && roomIn[e + 1] <= apexRoom + 0.3) e++;
  const apexAt = from + Math.round((s + e) / 2);
  const exitEnd = Math.min(roomOut.length - 1, apexAt - from + EXIT_SPAN_M, Math.max(end_m, apexAt + 40) - from);
  const exitRoom = Math.min(...roomOut.slice(apexAt - from, exitEnd + 1));
  return { side, turn_in_m: turnIn, entry_room_m: entry, apex_at_m: apexAt, apex_room_m: apexRoom, exit_room_m: exitRoom,
           wide_room_m: Math.min(...roomOut.slice(0, exitEnd + 1)) };
}

const APEX_TOUCH_M = 1.2;   // where the apex is only matters when both cars get this close to the inside

/** Line advice for a corner, weighted (heavier first): the driver's line against the reference's.
 *  `k` turns the driver's metres into the reference's (both laps on one distance grid). The white
 *  lines are estimated from laps unless edge laps were set, so distances to them can be off by a
 *  metre or two: the advice only states the difference between the two cars (measured against the
 *  same lines, the error cancels out), with margins. */
export function lineAdvice(you: CornerLine, ref: CornerLine, refName: string, k = 1): [number, string][] {
  const out: [number, string][] = [];
  const m = (x: number) => `${x.toFixed(1)} m`;
  // Off the track on the outside (the whole car past the line): a mistake, first. The rest compares
  // lines, which means little when either car left the track (the reference's line is no model then)
  const offYou = you.wide_room_m < -2 * HALF_CAR_M, offRef = ref.wide_room_m < -2 * HALF_CAR_M;
  if (offYou && you.wide_room_m < ref.wide_room_m - 1.5)
    out.push([10, `You run wide: the car goes about ${m(-you.wide_room_m - HALF_CAR_M)} past the outside white line. Brake a touch earlier or wait a little longer with the throttle, so the car stays on the track.`]);
  if (you.turn_in_m != null && ref.turn_in_m != null) {
    const d = you.turn_in_m / k - ref.turn_in_m;
    if (d < -8) out.push([-d / 8, `You turn in ${Math.round(-d)} m earlier than ${refName}: wait a little longer before turning.`]);
  }
  if (offYou || offRef) return out.sort((x, y) => y[0] - x[0]);
  const entry = you.entry_room_m - ref.entry_room_m;
  if (entry > 1.2)
    out.push([entry, `Use more track on entry: you turn in ${m(entry)} further from the outside white line than ${refName}.`]);
  const apex = you.apex_room_m - ref.apex_room_m;
  if (apex > 0.8)
    out.push([apex * 1.5, `Your apex is ${m(apex)} wider than ${refName}'s: get the car closer to the inside line.`]);
  if (you.apex_room_m < APEX_TOUCH_M && ref.apex_room_m < APEX_TOUCH_M) {
    const at = you.apex_at_m / k - ref.apex_at_m;
    if (at < -10 && at > -40)   // further apart: not the same apex (double-apex corners)
      out.push([-at / 10, `You reach the apex ${Math.round(-at)} m earlier than ${refName}: a later apex lets you straighten the car and get on the throttle sooner.`]);
  }
  const exit = you.exit_room_m - ref.exit_room_m;
  if (exit > 1.2)
    out.push([exit, `On the exit you leave ${m(exit)} more track on the outside than ${refName}: let the car run out to the white line and carry more speed.`]);
  return out.sort((x, y) => y[0] - x[0]);
}
