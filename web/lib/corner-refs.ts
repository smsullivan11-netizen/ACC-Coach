import "server-only";
import { sql } from "./db";
import { turnInAt } from "./line";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";

// Each corner's reference point (user's request): distances are given before it ("brake 118 m before
// T1") and the virtual 50/100/150 m boards count down to it, like real tracks' boards. It is the
// team's median turn-in point on the corner map (lib/line.ts turnInAt, from the steering), so it
// works from the first session and gets more precise with every upload; it only moves when the new
// median is more than MOVE_M away, so distances stay put from one day to the next. Comparisons
// between two laps use the same point for both: their difference never depends on it.

const MOVE_M = 2;
const MAX_LAPS = 150;   // the latest valid laps on the map

export type CornerRef = { corner_number: number; zero_m: number; brakes: boolean; brake_m: number | null; laps: number };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Recomputes a corner map's reference points from the team's valid laps on it (map metres). */
export async function refreshCornerRefs(mapId: string): Promise<void> {
  const [map] = await sql<{ length_m: number }[]>`select length_m from corner_map where id = ${mapId}`;
  if (!map) return;
  const laps = await sql<{ len: number; steer: EncodedChannel; res: { n: number; start: number; apex: number | null; brk: number | null }[] | null }[]>`
    select tr.length * tr.step_m as len, tr.channels->'steering_norm' as steer,
           (select json_agg(json_build_object('n', cr.corner_number, 'start', k.start_m, 'apex', cr.apex_m, 'brk', cr.braking_point_m))
            from corner_result cr join corner k on k.corner_map_id = cr.corner_map_id and k.number = cr.corner_number
            where cr.lap_id = l.id and cr.corner_map_id = ${mapId}) as res
    from lap l join lap_trace tr on tr.lap_id = l.id
    where l.comparable and l.corner_map_id = ${mapId} and tr.channels ? 'steering_norm'
    order by l.id desc limit ${MAX_LAPS}`;
  const per = new Map<number, { zero: number[]; brake: number[] }>();
  for (const lap of laps) {
    if (!lap.res) continue;
    const steer = decodeStored(lap.steer), k = map.length_m / lap.len;
    for (const c of lap.res) {
      // The corner's own part of the lap only (the map's start is in map metres: k back to the lap's)
      const t = c.apex == null ? null : turnInAt(steer, c.apex, c.start / k);
      if (t == null) continue;
      const e = per.get(c.n) ?? { zero: [], brake: [] };
      e.zero.push(t * k);
      if (c.brk != null && c.brk < t) e.brake.push((t - c.brk) * k);
      per.set(c.n, e);
    }
  }
  if (!per.size) return;
  const old = await sql<{ corner_number: number; zero_m: number }[]>`
    select corner_number, zero_m from corner_ref where corner_map_id = ${mapId}`;
  const rows = [...per].map(([n, e]) => {
    const zero = median(e.zero), was = old.find((o) => o.corner_number === n)?.zero_m;
    return {
      corner_map_id: mapId, corner_number: n,
      zero_m: was != null && Math.abs(was - zero) < MOVE_M ? was : Math.round(zero * 10) / 10,
      brakes: e.brake.length >= e.zero.length / 2, brake_m: e.brake.length ? Math.round(median(e.brake)) : null, laps: e.zero.length,
    };
  });
  await sql`
    insert into corner_ref ${sql(rows)}
    on conflict (corner_map_id, corner_number) do update
      set zero_m = excluded.zero_m, brakes = excluded.brakes, brake_m = excluded.brake_m, laps = excluded.laps, updated_at = now()`;
}

/** A corner map's reference points, computed on first use (maps from before this existed). Empty
 *  when there is no lap with steering on the map, or before migration 0012 (then distances stay
 *  in metres from the line, as before). */
export async function cornerRefs(mapId: string | null): Promise<CornerRef[]> {
  if (!mapId) return [];
  const read = () => sql<CornerRef[]>`
    select corner_number, zero_m, brakes, brake_m, laps from corner_ref where corner_map_id = ${mapId}`;
  try {
    let rows = await read();
    if (!rows.length) {
      await refreshCornerRefs(mapId);
      rows = await read();
    }
    return rows;
  } catch {
    return [];
  }
}

/** After an upload: the reference points of the maps its laps use. */
export async function refreshCornerRefsForSession(sessionId: string) {
  const maps = await sql<{ id: string }[]>`
    select distinct corner_map_id as id from lap where session_id = ${sessionId} and corner_map_id is not null`;
  for (const m of maps) await refreshCornerRefs(m.id).catch((e) => console.error("corner refs", e));
}
