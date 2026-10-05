import "server-only";
import type postgres from "postgres";
import { paceReference } from "./targets";

// Overall Driver Rating (0-100), updated after each uploaded session.
//
// Session score = weighted average of four parts (0-100 each; a part that cannot be measured is
// left out and the weights of the others are scaled up):
//  - pace (50 %): session best vs the reference = the faster of the car's target on the track and
//    the team's best valid lap in that car (lib/targets.ts): 0 % slower → 100, 3 % → 50, 6 % or more → 0;
//  - consistency (25 %, needs 3 valid laps): median gap of the other valid laps to the session best:
//    0.3 % or less → 100, 2 % or more → 0;
//  - clean driving (15 %): share of flying laps not invalidated (track limits, server);
//  - smoothness (10 %): steering activity vs the team's median on the same track and class:
//    70 % of the team's → 100, the team's → 70, 170 % or more → 0.
// Rating = "current form" (user's choice, 2026-10-05): on each track, the driver's best session
// score of the last 60 days (sessions with 5+ valid laps; when none has, every session counts),
// averaged over those tracks. Learning sessions and off days do not count against a driver; a
// track not driven for 60 days drops out. Computed after each session, as of that session's date
// (one row per rated session in driver_rating: the history). Provisional until 3 sessions.
// All-time best = highest rating reached once no longer provisional (`allTimeBest`).
// Nothing is recomputed automatically when targets or old laps change (admins can replay every
// session: rebuildRatings).

export const WEIGHTS = { pace: 50, consistency: 25, clean: 15, smoothness: 10 } as const;
export const PROVISIONAL_SESSIONS = 3;
export const FORM_DAYS = 60;
export const FORM_MIN_LAPS = 5;

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Sql = postgres.Sql | postgres.TransactionSql;
type LapRow = { t: number; comparable: boolean; excluded_reasons: string[]; metrics: Record<string, number> | null };

export async function rateSession(tx: Sql, sessionId: string) {
  const [s] = await tx<{ driver_id: string; track_id: string; car_class: string | null }[]>`
    select s.driver_id, s.track_id, c.class as car_class
    from session s left join car c on c.id = s.car_id where s.id = ${sessionId}`;
  if (!s) return null;
  const laps = await tx<LapRow[]>`
    select coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms) as t, comparable, excluded_reasons, metrics
    from lap where session_id = ${sessionId}`;
  const valid = laps.filter((l) => l.comparable).map((l) => l.t).sort((a, b) => a - b);
  if (!valid.length) return null;                        // nothing to judge: no valid flying lap

  const reference = (await paceReference(tx, sessionId)).reference_ms!;   // this session's valid laps count: never null here
  const best = valid[0];
  const pace = clamp(100 * (1 - (best - reference) / reference / 0.06));

  const consistency = valid.length >= 3
    ? clamp(100 * (1 - (median(valid.slice(1).map((t) => (t - best) / best)) - 0.003) / (0.02 - 0.003)))
    : null;

  const flying = laps.filter((l) => !l.excluded_reasons.some((r) => r.startsWith("pit_") || r === "distance" || r === "track_edges"));
  const clean = flying.length ? (100 * valid.length) / flying.length : null;

  // Steering activity in °/s when the steering lock is known, else in % of lock per second: only
  // compared with laps measured the same way
  const comparable = laps.filter((l) => l.comparable && l.metrics);
  const key = comparable.some((l) => l.metrics!.steering_rate_deg_s != null) ? "steering_rate_deg_s" : "steering_rate_pct_s";
  const mine = comparable.map((l) => l.metrics![key]).filter((x) => x != null);
  let smoothness: number | null = null;
  if (mine.length) {
    const [team] = await tx<{ med: number | null }[]>`
      select percentile_cont(0.5) within group (order by (l.metrics->>${key})::float) as med
      from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
      where ss.track_id = ${s.track_id} and c.class is not distinct from ${s.car_class}
        and l.comparable and l.metrics ? ${key}`;
    if (team.med) smoothness = clamp(100 - (median(mine) / team.med - 0.7) * 100);
  }

  const parts = { pace, consistency, clean, smoothness };
  let total = 0, weight = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    const v = parts[k as keyof typeof parts];
    if (v != null) {
      total += v * w;
      weight += w;
    }
  }
  const score = total / weight;

  const [row] = await tx<{ id: string }[]>`
    insert into driver_rating (driver_id, session_id, rating, session_score, pace, consistency, clean, smoothness, laps)
    values (${s.driver_id}, ${sessionId}, ${score}, ${score}, ${pace}, ${consistency}, ${clean}, ${smoothness}, ${valid.length})
    returning id`;
  const form = await formSessions(tx, s.driver_id, row.id);
  const rating = form.reduce((a, f) => a + f.session_score, 0) / form.length;
  await tx`update driver_rating set rating = ${rating} where id = ${row.id}`;
  return { rating, score, ...parts, laps: valid.length };
}

export type FormSession = {
  id: string; track_id: string; session_score: number; laps: number;
  pace: number | null; consistency: number | null; clean: number | null; smoothness: number | null;
};

/** The sessions the rating is made of: the best one per track in the FORM_DAYS before the driver's
 *  latest session (up to rating row `upToId`, for the history). */
export async function formSessions(tx: Sql, driverId: string, upToId: string | null = null) {
  return tx<FormSession[]>`
    with mine as (
      select r.id, r.session_score, r.pace, r.consistency, r.clean, r.smoothness, r.laps, s.track_id,
             coalesce(s.recorded_at, s.uploaded_at) as at
      from driver_rating r join session s on s.id = r.session_id
      where r.driver_id = ${driverId} and ${upToId ? tx`r.id <= ${upToId}` : tx`true`}),
    win as (select * from mine where at > (select max(at) from mine) - make_interval(days => ${FORM_DAYS})),
    pool as (select * from win where laps >= ${FORM_MIN_LAPS} or not exists (select 1 from win where laps >= ${FORM_MIN_LAPS}))
    select distinct on (track_id) id, track_id, session_score, laps, pace, consistency, clean, smoothness
    from pool order by track_id, session_score desc, id desc`;
}

/** Average parts of the sessions the rating is made of (rating breakdown, driving style). */
export async function formParts(tx: Sql, driverId: string) {
  const rows = await formSessions(tx, driverId);
  const avg = (k: "pace" | "consistency" | "clean" | "smoothness") => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { pace: avg("pace"), consistency: avg("consistency"), clean: avg("clean"), smoothness: avg("smoothness"),
           sessions: rows.length, laps: rows.reduce((a, r) => a + r.laps, 0) };
}

/** Highest rating each driver reached once no longer provisional (from their 3rd rated session). */
export async function allTimeBest(tx: Sql) {
  const rows = await tx<{ driver_id: string; best: number }[]>`
    select driver_id, max(rating) as best
    from (select driver_id, rating, row_number() over (partition by driver_id order by id) as n from driver_rating) x
    where n >= ${PROVISIONAL_SESSIONS} group by driver_id`;
  return new Map(rows.map((r) => [r.driver_id, r.best]));
}

/** Replays every session in upload order (after changing the formula, or for sessions uploaded
 *  before ratings existed). Uses today's targets and team bests for all of them. */
export async function rebuildRatings(sql: postgres.Sql) {
  return sql.begin(async (tx) => {
    await tx`delete from driver_rating`;
    const sessions = await tx<{ id: string }[]>`select id from session order by uploaded_at, id`;
    let rated = 0;
    for (const s of sessions) if (await rateSession(tx, s.id)) rated++;
    return { sessions: sessions.length, rated };
  });
}
