import "server-only";
import { sql } from "./db";
import { sectionsOf, type SectionLap } from "./sections";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";

// Sections (lib/sections.ts) in the database: the coach and the head to head.

/** SQL tables of the sections: sec(corner_number, s) with s the section's index, size(s, n), and
 *  lapsec(lap_id, s, t): each comparable lap's time through each section it covers entirely (the
 *  sum of its corner times: corners tile the lap). */
export const sectionTables = (groups: number[][], mapId: string) => sql`
  sec as (select * from unnest(${groups.flat()}::int[], ${groups.flatMap((g, i) => g.map(() => i))}::int[]) as x(corner_number, s)),
  size as (select s, count(*) as n from sec group by s),
  lapsec as (
    select cr.lap_id, sec.s, sum(cr.time_s) as t
    from corner_result cr join sec using (corner_number) join lap l on l.id = cr.lap_id
    where cr.corner_map_id = ${mapId} and l.comparable
    group by cr.lap_id, sec.s
    having count(*) = (select n from size where size.s = sec.s))`;

/** A corner map's sections from laps on it (their time traces and corner results): corners linked
 *  on any of them. Laps without a trace or results on the map are skipped. */
export async function sectionsFromLaps(mapId: string, lapIds: string[]): Promise<number[][]> {
  const corners = await sql<{ number: number }[]>`select number from corner where corner_map_id = ${mapId} order by number`;
  if (!lapIds.length) return corners.map((c) => [c.number]);
  const laps = await sql<{ time: EncodedChannel; results: SectionLap["corners"] | null }[]>`
    select tr.channels->'time_s' as time,
           (select json_agg(json_build_object('corner_number', cr.corner_number, 'lift_point_m', cr.lift_point_m,
                                              'full_throttle_m', cr.full_throttle_m, 'apex_m', cr.apex_m, 'time_s', cr.time_s))
            from corner_result cr where cr.lap_id = l.id and cr.corner_map_id = ${mapId}) as results
    from lap l join lap_trace tr on tr.lap_id = l.id
    where l.id in ${sql(lapIds)} and tr.channels ? 'time_s'`;
  return sectionsOf(corners.map((c) => c.number),
    laps.flatMap((l) => (l.results ? [{ time: decodeStored(l.time), corners: l.results }] : [])));
}
