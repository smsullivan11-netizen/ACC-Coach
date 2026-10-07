import "server-only";
import type postgres from "postgres";

// Target lap times per track and car (car_target, migration 0005; seeded with LFM's 101 % times
// for the team's main cars). Two references, both real lap times (never fuel-corrected: a corrected
// lap was never driven, user's rule 2026-10-07):
//  - paceReference (shown on the site, coaching notes): the faster of the car's target and the
//    team's best valid lap in that car; for a car without a target, the team's best in its class
//    (the team's choice: "a fixed target first, then whoever beats it");
//  - ratingReference (the hidden 100 of the pace score): the LFM 101 % target only, so a teammate
//    beating it never lowers everyone else's rating (team: within 1 % of LFM's best = alien).

type Sql = postgres.Sql | postgres.TransactionSql;
export type PaceReference = {
  target_ms: number | null;
  source: string | null;
  team_best_ms: number | null;   // in the same car when it has a target, else in the same class
  reference_ms: number | null;
  car: string | null;
};

export async function paceReference(db: Sql, sessionId: string): Promise<PaceReference> {
  const [r] = await db<{ target_ms: number | null; source: string | null; car_best: number | null; class_best: number | null; car: string | null }[]>`
    with me as (select s.track_id, t.key as track_key, c.id as car_id, c.key as car_key, c.class
                from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId}),
    laps as (select coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t, c.id as car_id, c.class
             from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
             where ss.track_id = (select track_id from me) and l.comparable)
    select ct.target_ms, ct.source, me.car_key as car,
           (select min(t) from laps where car_id = me.car_id) as car_best,
           (select min(t) from laps where class is not distinct from me.class) as class_best
    from me left join car_target ct on ct.track_key = lower(me.track_key) and ct.car_key = me.car_key`;
  if (!r) return { target_ms: null, source: null, team_best_ms: null, reference_ms: null, car: null };
  const teamBest = r.target_ms != null ? r.car_best : r.class_best;
  const candidates = [r.target_ms, teamBest].filter((x): x is number => x != null);
  return { target_ms: r.target_ms, source: r.source, team_best_ms: teamBest, reference_ms: candidates.length ? Math.min(...candidates) : null, car: r.car };
}

/** The pace score's 100 for a session: its car's LFM 101 % target on the track; a car without one
 *  takes its class's (the average of the class's targets there: still an LFM time); a track with no
 *  target at all, the team's best real lap in the class (null without any). */
export async function ratingReference(db: Sql, sessionId: string): Promise<number | null> {
  const [r] = await db<{ own: number | null; class_avg: number | null; class_best: number | null }[]>`
    with me as (select s.track_id, lower(t.key) as track_key, c.key as car_key, c.class
                from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId})
    select (select ct.target_ms from car_target ct where ct.track_key = me.track_key and ct.car_key = me.car_key) as own,
           (select avg(ct.target_ms)::float8 from car_target ct join car c on c.key = ct.car_key
             where ct.track_key = me.track_key and c.class is not distinct from me.class) as class_avg,
           (select min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms))
              from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
             where ss.track_id = me.track_id and l.comparable and c.class is not distinct from me.class) as class_best
    from me`;
  return r ? r.own ?? r.class_avg ?? r.class_best : null;
}

/** "1:24.500" → 84500 ms (null when not a lap time between 10 s and 1 h). */
export function parseLapTime(s: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)\s*$/.exec(s);
  if (!m) return null;
  const ms = Math.round(((m[1] ? +m[1] : 0) * 60 + +m[2]) * 1000);
  return ms > 10_000 && ms < 3_600_000 ? ms : null;
}
