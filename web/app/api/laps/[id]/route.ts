import { driverFromRequest } from "@/lib/auth";
import { sql } from "@/lib/db";
import { trackEdges } from "@/lib/track-edges";

// One lap for the lap page: header, trace (1 m grid, encoded channels), corner results and the
// track's edges (white lines, when set) for the map. Corners come from the lap's corner map, or the
// track's latest one for laps without corner results; their boundaries are scaled to the track
// length used for the lap's distance grid.
export async function GET(request: Request, ctx: RouteContext<"/api/laps/[id]">) {
  if (!(await driverFromRequest(request))) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });

  const [lap] = await sql`
    select l.id, l.number, l.session_id, l.comparable, l.excluded_reasons,
           coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as time_ms,
           d.display_name as driver, t.id as track_id, t.key as track, t.length_m as track_length_m, c.key as car,
           s.source_kind, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date,
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

  const corners = lap.corner_map_id
    ? await sql`
        select k.number, k.name,
               k.start_m * t.k as start_m, k.apex_m * t.k as apex_m, k.end_m * t.k as end_m,
               r.time_s, r.entry_speed_kmh, r.lift_point_m, r.braking_point_m, r.brake_release_m,
               r.max_brake_pct, r.min_speed_kmh, r.apex_m as lap_apex_m, r.throttle_pickup_m,
               r.full_throttle_m, r.coasting_s, r.exit_speed_kmh
        from corner k
        join corner_map m on m.id = k.corner_map_id
        cross join lateral (select ${lap.track_length_m}::real / m.length_m as k) t
        left join corner_result r on r.lap_id = ${id} and r.corner_map_id = k.corner_map_id
                                 and r.corner_number = k.number
        where k.corner_map_id = ${lap.corner_map_id}
        order by k.number`
    : [];

  const { step_m, length, channels, track_id, ...header } = lap;
  const edges = await trackEdges(track_id);
  return Response.json(
    { ...header, trace: channels ? { step_m, length, channels } : null, corners, edges },
    { headers: { "Cache-Control": "private, max-age=60" } },   // short: maps and edges can change
  );
}
