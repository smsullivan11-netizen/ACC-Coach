import { driverFromRequest } from "@/lib/auth";
import { cornerRefs } from "@/lib/corner-refs";
import { sql } from "@/lib/db";
import { trackEdges } from "@/lib/track-edges";
import { unpackChannels } from "@/lib/trace-store";

// One lap for the lap page: header, trace (1 m grid, encoded channels), corner results and the
// track's edges (white lines: edge laps, else the automatic outline) for the map. Corners come from the lap's corner map, or the
// track's latest one for laps without corner results; their boundaries are scaled to the lap's own
// distance grid (its trace length; the track's stored length only without a trace: a first session
// with a broken lap once stored 13.8 km for Hungaroring and pushed every corner past the line).
export async function GET(request: Request, ctx: RouteContext<"/api/laps/[id]">) {
  if (!(await driverFromRequest(request))) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });

  const [lap] = await sql`
    select l.id, l.number, l.session_id, l.comparable, l.excluded_reasons,
           coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as time_ms,
           d.display_name as driver, t.id as track_id, t.key as track, t.length_m as track_length_m, c.key as car,
           s.source_kind, s.conditions, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date,
           coalesce(l.corner_map_id,
                    (select m.id from corner_map m where m.track_id = t.id order by m.version desc limit 1))
             as corner_map_id,
           tr.step_m, tr.length, tr.channels
    from lap l
    join session s on s.id = l.session_id
    join driver d on d.id = s.driver_id
    join track t on t.id = s.track_id
    left join car c on c.id = s.car_id
    left join lap_trace tr on tr.lap_id = l.id
    where l.id = ${id}`;
  if (!lap) return Response.json({ error: "not found" }, { status: 404 });

  const rows = lap.corner_map_id
    ? await sql<{ number: number; scale: number }[]>`
        select k.number, k.name, t.k as scale,
               k.start_m * t.k as start_m, k.apex_m * t.k as apex_m, k.end_m * t.k as end_m,
               r.time_s, r.entry_speed_kmh, r.lift_point_m, r.braking_point_m, r.brake_release_m,
               r.max_brake_pct, r.min_speed_kmh, r.apex_m as lap_apex_m, r.throttle_pickup_m,
               r.full_throttle_m, r.coasting_s, r.exit_speed_kmh
        from corner k
        join corner_map m on m.id = k.corner_map_id
        cross join lateral (select ${lap.length && lap.step_m ? lap.length * lap.step_m : lap.track_length_m}::real / m.length_m as k) t
        left join corner_result r on r.lap_id = ${id} and r.corner_map_id = k.corner_map_id
                                 and r.corner_number = k.number
        where k.corner_map_id = ${lap.corner_map_id}
        order by k.number`
    : [];
  // Each corner's reference point (lib/corner-refs.ts) on this lap's grid: distances before the
  // corner and the virtual boards (brakes: the team brakes there; brake_m: its usual braking distance)
  const refs = await cornerRefs(lap.corner_map_id);
  const corners = rows.map(({ scale, ...c }) => {
    const r = refs.find((x) => x.corner_number === c.number);
    return { ...c, zero_m: r ? r.zero_m * scale : null, brakes: r?.brakes ?? false, brake_m: r?.brake_m ?? null };
  });

  const { step_m, length, channels, track_id, ...header } = lap;
  const edges = await trackEdges(track_id, lap.track);
  return Response.json(
    { ...header, trace: channels ? { step_m, length, channels: unpackChannels(channels) } : null, corners, edges },
    { headers: { "Cache-Control": "private, max-age=60" } },   // short: maps and edges can change
  );
}
