import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { EngineerLap, EngineerDriver } from "@/lib/race-engineer";

export async function GET(request: Request, ctx: RouteContext<"/api/race-hq/[id]/cars/[carId]/engineer">) {
  if (!(await currentDriver())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id, carId } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(carId)) return Response.json({ error: "Car not found." }, { status: 404 });
  const [car] = await sql`select c.car_key, e.track_key from event_car c join event e on e.id = c.event_id where c.id = ${carId} and e.id = ${id}`;
  if (!car) return Response.json({ error: "Car not found in this race." }, { status: 404 });
  const [roster, cars] = await Promise.all([
    sql<EngineerDriver[]>`select r.driver_id, d.display_name from event_car_driver r join driver d on d.id = r.driver_id where r.event_id = ${id} and r.event_car_id = ${carId} order by r.sort_order, r.driver_id`,
    sql<{ key: string; name: string | null }[]>`select key, name from car where simulator = 'acc' order by key`,
  ]);
  const selected = new URL(request.url).searchParams.get("car") || car.car_key || "";
  if (selected && !cars.some((c) => c.key === selected)) return Response.json({ error: "Choose an ACC car from the list." }, { status: 400 });
  const laps = selected ? await sql<EngineerLap[]>`
    select r.driver_id, recent.* from event_car_driver r
    cross join lateral (
      select s.id::text as session_id, l.number,
        to_char(coalesce(s.recorded_at, s.uploaded_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
        coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t,
        l.comparable, l.excluded_reasons, jsonb_build_object('fuel_l', l.metrics->'fuel_l') as metrics, s.conditions
      from (select ss.* from session ss join track t on t.id = ss.track_id join car c on c.id = ss.car_id
        where ss.driver_id = r.driver_id and t.key = ${car.track_key} and t.simulator = 'acc' and c.key = ${selected} and c.simulator = 'acc'
          and coalesce(ss.recorded_at, ss.uploaded_at) > now() - interval '60 days'
          and not exists (select 1 from lap bad where bad.session_id = ss.id and 'track_edges' = any(bad.excluded_reasons))
          and lower(coalesce(ss.rating_type, ss.session_type, 'practice')) not in ('qualifying','qualify','hotlap','superpole','hotstint_superpole')
        order by coalesce(ss.recorded_at, ss.uploaded_at) desc, ss.id desc limit 20) s
      join lap l on l.session_id = s.id
      order by coalesce(s.recorded_at, s.uploaded_at) desc, s.id desc, l.number desc limit 1500
    ) recent where r.event_id = ${id} and r.event_car_id = ${carId}` : [];
  return Response.json({ roster, cars, selectedCar: selected, track: car.track_key, laps }, { headers: { "Cache-Control": "private, no-store" } });
}
