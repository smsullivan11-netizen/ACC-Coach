import "server-only";
import { sql } from "./db";
import { buildOutline, type EdgeLine } from "./outline-core";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";

// Automatic track surface (white lines): the team's laps from the database → lib/outline-core.ts
// (the computation, checkable offline), stored in track_outline and recomputed after uploads.

export type { EdgeLine };
export type Outline = { left: EdgeLine; right: EdgeLine; source: "laps" | "tumftm"; laps: number; cuts?: number };

const MAX_LAPS = 80;
// Laps the outline is made of: valid ones, and ones invalidated only for track limits whose trace
// says where (the app's "valid" channel, 0.2.0+: only their part before the first cut counts)
const outlineLaps = () => sql`(l.comparable or (l.excluded_reasons = array['game_invalid']::text[] and tr.channels ? 'valid'))`;
const VERSION = 4;           // bump when the method changes (lib/outline-core.ts): stored outlines are then recomputed

export async function computeOutline(trackId: string, key: string): Promise<(Outline & { lastLapId: string }) | null> {
  const rows = await sql<{ id: string; x: EncodedChannel; z: EncodedChannel; valid: EncodedChannel | null }[]>`
    select l.id, tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z,
           case when l.comparable then null else tr.channels->'valid' end as valid
    from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${trackId} and ${outlineLaps()} and tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m'
    order by l.id desc limit ${MAX_LAPS}`;
  if (!rows.length) return null;
  const seen = new Set<string>();
  const laps = rows.filter((r) => !seen.has(r.x.data) && seen.add(r.x.data))
    .map((r) => ({ x: decodeStored(r.x), z: decodeStored(r.z), valid: r.valid ? decodeStored(r.valid) : null }));
  const o = buildOutline(laps, key);
  return o && { ...o, lastLapId: rows[0].id };
}

/** Stored outline, recomputed when a newer valid lap exists. Before migration 0009 it is computed
 *  on each call (slower, not stored). */
export async function trackOutline(trackId: string, key: string): Promise<Outline | null> {
  const [newest] = await sql<{ id: string | null }[]>`
    select max(l.id) as id from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${trackId} and ${outlineLaps()} and tr.channels ? 'pos_x_m'`;
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
