import "server-only";
import { sql } from "./db";

// Events (races the team enters): sign-ups, each driver's readiness on the event's track, and a
// suggested endurance line-up (stints). Everything here is advice: admins edit and save the plan.

export type EventRow = {
  id: string; title: string; track_key: string; car_class: string; starts_at: Date; duration_min: number;
  kind: "sprint" | "endurance"; league: string | null; server: string | null; notes: string | null;
  min_pit_stops: number; max_stint_min: number | null;
};

export type Readiness = {
  driver_id: string; driver: string; avatar_url: string | null; status: "yes" | "maybe" | "no"; car_key: string | null; note: string | null;
  rating: number | null;
  laps_30d: number;            // valid laps on the track in the last 30 days
  best_ms: number | null;      // best valid lap on the track (class)
  pace_ms: number | null;      // average of their 5 best valid laps in the last 60 days: race pace estimate
  target_ms: number | null;    // target of the car they drive (or of their best lap's car)
  level: "ready" | "building" | "none";
};

export async function getEvent(id: string) {
  const [e] = await sql<EventRow[]>`select * from event where id = ${id}`;
  return e ?? null;
}

/** Sign-ups with each driver's practice and pace on the event's track. */
export async function readiness(e: EventRow): Promise<Readiness[]> {
  const rows = await sql<Omit<Readiness, "level">[]>`
    with t as (select id from track where lower(key) = ${e.track_key}),
    laps as (
      select s.driver_id, c.key as car, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as ms, s.uploaded_at
      from lap l join session s on s.id = l.session_id left join car c on c.id = s.car_id
      where s.track_id in (select id from t) and l.comparable and c.class is not distinct from ${e.car_class})
    select d.id as driver_id, d.display_name as driver, d.avatar_url, en.status, en.car_key, en.note,
           (select rating from driver_rating where driver_id = d.id order by id desc limit 1) as rating,
           (select count(*) from laps where driver_id = d.id and uploaded_at > now() - interval '30 days')::int as laps_30d,
           (select min(ms) from laps where driver_id = d.id) as best_ms,
           (select avg(ms)::int from (select ms from laps where driver_id = d.id and uploaded_at > now() - interval '60 days'
                                      order by ms limit 5) b) as pace_ms,
           (select ct.target_ms from car_target ct where ct.track_key = ${e.track_key}
              and ct.car_key = coalesce(en.car_key, (select car from laps where driver_id = d.id order by ms limit 1))) as target_ms
    from event_entry en join driver d on d.id = en.driver_id
    where en.event_id = ${e.id}
    order by case en.status when 'yes' then 0 when 'maybe' then 1 else 2 end, d.display_name`;
  return rows.map((r) => {
    const ref = r.target_ms;
    const close = r.best_ms != null && (ref == null || r.best_ms <= ref * 1.02);
    return { ...r, level: r.laps_30d >= 20 && close ? "ready" : r.laps_30d > 0 || r.best_ms != null ? "building" : "none" };
  });
}

export type StintPlan = { driver_id: string | null; minutes: number }[];

/** Suggested stints: enough for the pit stops and the stint limit, and in an endurance race at least
 *  one per driver. Drivers in order of race pace; with a spare stint, the fastest also finishes. */
export function suggestLineup(e: EventRow, drivers: Readiness[]): StintPlan {
  const order = drivers.filter((d) => d.status === "yes")
    .sort((a, b) => (a.pace_ms ?? a.best_ms ?? Infinity) - (b.pace_ms ?? b.best_ms ?? Infinity))
    .map((d) => d.driver_id);
  const k = order.length;
  let n = Math.max(e.min_pit_stops + 1, e.max_stint_min ? Math.ceil(e.duration_min / e.max_stint_min) : 1);
  if (e.kind === "endurance") n = Math.max(n, k);
  const seq: (string | null)[] = [];
  for (let i = 0; i < n; i++) seq.push(k ? order[i % k] : null);
  if (k > 1 && n > k) seq[n - 1] = order[0];   // the fastest finishes when the rotation would not end on them
  const base = Math.floor(e.duration_min / n), extra = e.duration_min - base * n;
  return seq.map((driver_id, i) => ({ driver_id, minutes: base + (i < extra ? 1 : 0) }));
}

export async function savedLineup(eventId: string): Promise<StintPlan> {
  return sql<{ driver_id: string | null; minutes: number }[]>`
    select driver_id, minutes from event_stint where event_id = ${eventId} order by n`;
}

/** Results attached to the event: each session with its classification. */
export async function eventResults(eventId: string) {
  const sessions = await sql<{ id: string; session_type: string | null; file_name: string; server_name: string; ended_at: Date | null }[]>`
    select id, session_type, file_name, server_name, ended_at from server_session where event_id = ${eventId} order by ended_at nulls last, id`;
  const lines = sessions.length ? await sql<{
    server_session_id: string; position: number; car_number_id: number; race_number: number | null; car_model: number | null;
    team_name: string | null; drivers: { name: string; steam_id: string | null; driver_id: string | null }[]; laps: number;
    best_lap_ms: number | null; total_time_ms: number | null;
  }[]>`select * from server_result where server_session_id in ${sql(sessions.map((s) => s.id))} order by server_session_id, position` : [];
  // Team drivers' laps: race pace (median valid lap) and consistency
  const pace = sessions.length ? await sql<{ server_session_id: string; driver_id: string; laps: number; valid: number; median_ms: number | null; spread_ms: number | null }[]>`
    with laps as (
      select server_session_id, driver_id, lap_time_ms, valid,
             min(lap_time_ms) filter (where valid) over (partition by server_session_id, driver_id) as best
      from official_lap where server_session_id in ${sql(sessions.map((s) => s.id))} and driver_id is not null and lap_index > 1)
    -- Race pace on racing laps only: valid and within 5 % of the driver's best (no pit, out- or incident laps)
    select server_session_id, driver_id, count(*)::int as laps, count(*) filter (where valid)::int as valid,
           percentile_cont(0.5) within group (order by lap_time_ms) filter (where valid and lap_time_ms <= best * 1.05)::int as median_ms,
           stddev_samp(lap_time_ms) filter (where valid and lap_time_ms <= best * 1.05)::int as spread_ms
    from laps group by server_session_id, driver_id` : [];
  return { sessions, lines, pace };
}
