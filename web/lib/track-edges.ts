import "server-only";
import { sql } from "./db";
import { rebuildRatings } from "./ratings";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";

// Track edges (white lines) for drawing the track surface. ACC does not publish them, so they come
// from two edge laps: one driven with the left wheels on the white line, one with the right wheels.
// The car's position is the middle of its four tyre contact points: the edge is that line moved
// outward by half the car's width. An edge lap is taken out of rankings, ratings and corner maps
// (excluded reason "track_edges"); clearing it puts the lap back.

export type EdgeLine = { x: number[]; z: number[] };
export type Edges = { left: EdgeLine | null; right: EdgeLine | null };
export type Side = "left" | "right";

const HALF_CAR_M = 1.0;   // car centre to the outer side of the tyres (GT3: 1.78 m between tyre centres)
const STEP = 2;           // one point every 2 m
const SPAN = 4;           // m on each side to read the line's direction

/** The edge line from an edge lap's positions (1 m grid). Seen from above with z down, the
 *  driver's right is the direction (-dz, dx). */
export function edgeFromLine(x: ArrayLike<number>, z: ArrayLike<number>, side: Side): EdgeLine {
  const n = x.length, out: EdgeLine = { x: [], z: [] };
  const sign = side === "right" ? 1 : -1;
  for (let i = 0; i < n; i += STEP) {
    const a = Math.max(0, i - SPAN), b = Math.min(n - 1, i + SPAN);
    const tx = x[b] - x[a], tz = z[b] - z[a], len = Math.hypot(tx, tz) || 1;
    out.x.push(Math.round((x[i] + (sign * -tz * HALF_CAR_M) / len) * 10) / 10);
    out.z.push(Math.round((z[i] + (sign * tx * HALF_CAR_M) / len) * 10) / 10);
  }
  return out;
}

/** The track's edges; null before migration 0004 or when none is set (maps then show lines only). */
export async function trackEdges(trackId: string): Promise<Edges | null> {
  try {
    const rows = await sql<{ side: Side; points: EdgeLine }[]>`select side, points from track_edge where track_id = ${trackId}`;
    if (!rows.length) return null;
    return { left: rows.find((r) => r.side === "left")?.points ?? null, right: rows.find((r) => r.side === "right")?.points ?? null };
  } catch {
    return null;
  }
}

const restore = (lapId: string) => sql`
  update lap set excluded_reasons = array_remove(excluded_reasons, 'track_edges'),
                 comparable = cardinality(array_remove(excluded_reasons, 'track_edges')) = 0
  where id = ${lapId}`;

/** Uses a lap of the track as its left or right edge (admins), or clears that edge (lapId null).
 *  Ratings are replayed afterwards, since the lap leaves (or rejoins) the rated laps. */
export async function setEdge(trackId: string, side: Side, lapId: string | null, by: string): Promise<string | null> {
  const [current] = await sql<{ lap_id: string | null }[]>`select lap_id from track_edge where track_id = ${trackId} and side = ${side}`;
  if (lapId == null) {
    await sql`delete from track_edge where track_id = ${trackId} and side = ${side}`;
    if (current?.lap_id) await restore(current.lap_id);
    await rebuildRatings(sql);
    return null;
  }
  const [lap] = await sql<{ x: EncodedChannel | null; z: EncodedChannel | null }[]>`
    select tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z
    from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where l.id = ${lapId} and s.track_id = ${trackId}`;
  if (!lap) return "this lap is not on this track or has no trace";
  if (!lap.x || !lap.z) return "this lap has no car positions (MoTeC import): record it with the ACC Coach app";
  const [other] = await sql`select 1 from track_edge where track_id = ${trackId} and side <> ${side} and lap_id = ${lapId}`;
  if (other) return "this lap is already the other edge";
  const points = edgeFromLine(decodeStored(lap.x), decodeStored(lap.z), side);
  await sql.begin(async (tx) => {
    await tx`
      insert into track_edge (track_id, side, lap_id, points, set_by) values (${trackId}, ${side}, ${lapId}, ${tx.json(points)}, ${by})
      on conflict (track_id, side) do update set lap_id = excluded.lap_id, points = excluded.points,
                                                 set_by = excluded.set_by, set_at = now()`;
    await tx`
      update lap set comparable = false,
                     excluded_reasons = case when 'track_edges' = any(excluded_reasons) then excluded_reasons
                                             else array_append(excluded_reasons, 'track_edges') end
      where id = ${lapId}`;
  });
  if (current?.lap_id && current.lap_id !== lapId) await restore(current.lap_id);
  await rebuildRatings(sql);
  return null;
}
