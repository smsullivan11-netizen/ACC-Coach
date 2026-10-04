import "server-only";
import { sql } from "./db";

// Sessions for lists (dashboard, sessions page): who, where, best valid lap, and whether that lap is
// the driver's current personal best on the track (it is in lap_ranking) or the team's best (P1).

export type SessionRow = {
  id: string;
  at: Date;
  driver_id: string;
  driver: string;
  avatar_url: string | null;
  track: string;
  car: string | null;
  session_type: string | null;
  laps: number;
  valid_laps: number;
  best_lap_id: string | null;
  best_ms: number | null;
  position: number | null;   // position of the best lap on the track's leaderboard, when it is the driver's PB
};

export async function recentSessions({ driverId, limit }: { driverId?: string; limit: number }) {
  return sql<SessionRow[]>`
    select s.id, coalesce(s.recorded_at, s.uploaded_at) as at, d.id as driver_id, d.display_name as driver, d.avatar_url,
           t.key as track, c.key as car, s.session_type,
           (select count(*) from lap where session_id = s.id)::int as laps,
           (select count(*) from lap where session_id = s.id and comparable)::int as valid_laps,
           b.lap_id as best_lap_id, b.t as best_ms, r.position::int as position
    from session s
    join driver d on d.id = s.driver_id
    join track t on t.id = s.track_id
    left join car c on c.id = s.car_id
    left join lateral (
      select l.id as lap_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t
      from lap l where l.session_id = s.id and l.comparable order by 2 limit 1) b on true
    left join lap_ranking r on r.lap_id = b.lap_id
    where ${driverId ? sql`s.driver_id = ${driverId}` : sql`true`}
      and not exists (select 1 from lap l where l.session_id = s.id and 'track_edges' = any(l.excluded_reasons))
    order by coalesce(s.recorded_at, s.uploaded_at) desc
    limit ${limit}`;
}

/** "Today", "Yesterday", "Saturday 4 October". */
export function dayLabel(d: Date, now = new Date()) {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export const timeOfDay = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
