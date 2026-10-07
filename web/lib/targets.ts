import "server-only";
import type postgres from "postgres";
import { fuelSeconds } from "./fuel";

// Target lap times per track and car (car_target, migration 0005; seeded with LFM's 101 % times
// for the team's main cars). The pace reference of a session is the faster of its car's target and
// the team's best valid lap in that car; for a car without a target, the team's best lap in its
// class (the team's choice: "a fixed target first, then whoever beats it").

type Sql = postgres.Sql | postgres.TransactionSql;
export type PaceReference = {
  target_ms: number | null;
  source: string | null;
  team_best_ms: number | null;   // in the same car when it has a target, else in the same class
  reference_ms: number | null;
  car: string | null;
};

/** `fuelCorrected` (the rating, user's request 2026-10-07): the team's best laps with their fuel
 *  cost removed (lib/fuel.ts), like the session's own laps, so both sides are compared on minimum
 *  fuel. Targets are hotlap times: never corrected. Without it (coaching notes): real times. */
export async function paceReference(db: Sql, sessionId: string, { fuelCorrected = false } = {}): Promise<PaceReference> {
  const [r] = await db<{ target_ms: number | null; source: string | null; car_best: number | null; class_best: number | null; car: string | null; track_key: string }[]>`
    with me as (select s.track_id, t.key as track_key, c.id as car_id, c.key as car_key, c.class
                from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId}),
    laps as (select coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t, c.id as car_id, c.class
             from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
             where ss.track_id = (select track_id from me) and l.comparable)
    select ct.target_ms, ct.source, me.car_key as car, me.track_key,
           (select min(t) from laps where car_id = me.car_id) as car_best,
           (select min(t) from laps where class is not distinct from me.class) as class_best
    from me left join car_target ct on ct.track_key = lower(me.track_key) and ct.car_key = me.car_key`;
  if (!r) return { target_ms: null, source: null, team_best_ms: null, reference_ms: null, car: null };
  if (fuelCorrected) {
    const laps = await db<{ t: number; fuel_l: number | null; same_car: boolean; same_class: boolean }[]>`
      with me as (select s.track_id, s.car_id, c.class from session s left join car c on c.id = s.car_id where s.id = ${sessionId})
      select coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t, (l.metrics->>'fuel_l')::float as fuel_l,
             ss.car_id is not distinct from me.car_id as same_car, c.class is not distinct from me.class as same_class
      from me join session ss on ss.track_id = me.track_id join lap l on l.session_id = ss.id left join car c on c.id = ss.car_id
      where l.comparable`;
    const best = (pick: (l: (typeof laps)[number]) => boolean) => {
      const ts = laps.filter(pick).map((l) => l.t - 1000 * fuelSeconds(r.track_key, l.fuel_l));
      return ts.length ? Math.min(...ts) : null;
    };
    r.car_best = best((l) => l.same_car);
    r.class_best = best((l) => l.same_class);
  }
  const teamBest = r.target_ms != null ? r.car_best : r.class_best;
  const candidates = [r.target_ms, teamBest].filter((x): x is number => x != null);
  return { target_ms: r.target_ms, source: r.source, team_best_ms: teamBest, reference_ms: candidates.length ? Math.min(...candidates) : null, car: r.car };
}

/** "1:24.500" → 84500 ms (null when not a lap time between 10 s and 1 h). */
export function parseLapTime(s: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)\s*$/.exec(s);
  if (!m) return null;
  const ms = Math.round(((m[1] ? +m[1] : 0) * 60 + +m[2]) * 1000);
  return ms > 10_000 && ms < 3_600_000 ? ms : null;
}
