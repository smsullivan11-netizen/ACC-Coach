import "server-only";
import type postgres from "postgres";
import { announcePromotions, currentRatings } from "./discord";
import { fuelSeconds } from "./fuel";
import { paceReference } from "./targets";

// Overall Driver Rating (0-100), updated after each uploaded session.
//
// Session score = weighted average of four parts (0-100 each; a part that cannot be measured is
// left out and the weights of the others are scaled up). The weights depend on the session type
// (WEIGHTS_BY_TYPE, user's values): the type chosen on the session page, else ACC's (hotlap and
// superpole = qualifying, hotstint = race, unknown = practice, which is also mixed running):
//  - (lap times are first corrected for the fuel load: lib/fuel.ts)
//  - pace: session best vs the reference = the faster of the car's target on the track and
//    the team's best valid lap in that car (lib/targets.ts): 0 % slower → 100, 3 % → 50, 6 % or more → 0;
//  - consistency (needs 3 valid laps): average gap of the laps to the best one, each gap capped at
//    3 % (a spin or a crash counts as one maximally inconsistent lap, no more), where on runs of 6+
//    valid laps (between pit stops) "best" follows the run's trend (lapGaps): fuel burning off, tyre
//    wear and track changes move lap times steadily over a stint, only the scatter around that
//    trend counts. Invalid flying laps count too (user's request, 2026-10-07: valid laps alone can
//    hide a big spread): in a race fully, like valid laps (nobody abandons a lap in a race); in
//    practice and qualifying at half weight and only within 3 % (beyond, the lap may have been
//    abandoned once invalid: its time says nothing). 0.1 % or less → 100, 3 % → 0;
//  - clean driving: share of flying laps not invalidated (track limits, server);
//  - smoothness: steering activity vs the team's median on the same track and class:
//    70 % of the team's → 100, the team's → 70, 170 % or more → 0.
// Rating = "current form" (user's choice, 2026-10-05): on each track, the driver's best session
// score of the last 60 days (sessions with 5+ valid laps; when none has, every session counts),
// averaged over those tracks. Learning sessions and off days do not count against a driver; a
// track not driven for 60 days drops out. Computed after each session, as of that session's date
// (one row per rated session in driver_rating: the history). Provisional until 3 sessions.
// All-time best = highest rating reached once no longer provisional (`allTimeBest`).
// Nothing is recomputed automatically when targets or old laps change (admins can replay every
// session: rebuildRatings).

type Weights = { pace: number; consistency: number; clean: number; smoothness: number };
export type RatingType = "practice" | "qualifying" | "race";
export const WEIGHTS_BY_TYPE: Record<RatingType, Weights> = {
  practice: { pace: 55, consistency: 25, clean: 10, smoothness: 10 },     // also mixed running (long and short runs); the default
  qualifying: { pace: 62, consistency: 18, clean: 10, smoothness: 10 },   // also hotlap and superpole
  race: { pace: 45, consistency: 30, clean: 15, smoothness: 10 },         // also hotstint
};
export const RATING_TYPE_LABELS: Record<RatingType, string> = {
  practice: "Practice (Mixed running)", qualifying: "Qualifying simulation", race: "Race simulation",
};
/** The four parts, in display order (their weights depend on the session type). */
export const WEIGHTS = WEIGHTS_BY_TYPE.practice;

/** Weights to use: the type chosen for the session, else ACC's session type. "mixed" (a separate
 *  type until 2026-10-07, merged into practice at the user's request) reads as practice. */
export function ratingType(chosen: string | null, acc: string | null): RatingType {
  if (chosen === "mixed") return "practice";
  if (chosen && chosen in WEIGHTS_BY_TYPE) return chosen as RatingType;
  switch (acc) {
    case "qualify": case "qualifying": case "hotlap": case "superpole": case "hotstint_superpole": return "qualifying";
    case "race": case "hotstint": return "race";
    default: return "practice";
  }
}
export const PROVISIONAL_SESSIONS = 3;
export const FORM_DAYS = 60;
export const FORM_MIN_LAPS = 5;
// Consistency scale (average gap to the session best): widened on 2026-10-05 (was 0.3 % → 100,
// 2 % → 0: too generous at the top, too harsh below). Each lap's gap is capped at the zero point;
// invalid laps outside race weigh INVALID_WEIGHT. Until 2026-10-07 it was the median gap of the
// valid laps only (checked on the team's sessions before the change: ratings moved by 1 point or less).
const CONSISTENCY_FULL = 0.001, CONSISTENCY_ZERO = 0.03;
export const INVALID_WEIGHT = 0.5;

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Sql = postgres.Sql | postgres.TransactionSql;
type LapRow = { number: number; t: number; comparable: boolean; excluded_reasons: string[]; metrics: Record<string, number> | null };

export const TREND_MIN_LAPS = 6;

/** Relative gaps of a session's valid laps to its best, for consistency. Runs are split at pit laps
 *  (tyres and fuel change there). On a run of TREND_MIN_LAPS+ valid laps the reference follows the
 *  run's trend (robust line: median of the pairwise slopes), shifted down to the lap furthest below
 *  it: a steady drift from fuel burn or tyre wear (ACC does not publish tyre wear) is not counted.
 *  Shorter runs (hotlaps, qualifying runs) use a flat line: the gap to the run's best lap. The
 *  reference lap of each run is left out, like the best lap before. Invalid flying laps
 *  (`invalid`) are measured against the same line (either side: an invalid lap can be faster than
 *  the best valid one) and weighted as the consistency rules say (`race`: like valid laps). Each
 *  gap comes with its weight and is capped at the scale's zero. */
export function lapGaps(laps: { number: number; t: number; valid: boolean; invalid?: boolean; pit: boolean }[], race = false) {
  const runs: { n: number; t: number; valid: boolean }[][] = [[]];
  for (const l of [...laps].sort((a, b) => a.number - b.number)) {
    if (l.pit) { if (runs.at(-1)!.length) runs.push([]); continue; }
    if (l.valid || l.invalid) runs.at(-1)!.push({ n: l.number, t: l.t, valid: l.valid });
  }
  const best = Math.min(...laps.filter((l) => l.valid).map((l) => l.t));
  const gaps: { gap: number; weight: number }[] = [];
  for (const run of runs) {
    const valid = run.filter((l) => l.valid);
    if (!valid.length) continue;
    let slope = 0;
    if (valid.length >= TREND_MIN_LAPS) {
      const slopes: number[] = [];
      for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) slopes.push((valid[j].t - valid[i].t) / (valid[j].n - valid[i].n));
      slope = median(slopes);
    }
    const d = valid.map((l) => l.t - slope * l.n);
    const base = Math.min(...d);
    const k = d.indexOf(base);
    d.forEach((x, i) => { if (i !== k) gaps.push({ gap: Math.min(CONSISTENCY_ZERO, (x - base) / best), weight: 1 }); });
    for (const l of run) {
      if (l.valid) continue;
      const gap = Math.abs(l.t - slope * l.n - base) / best;
      if (race) gaps.push({ gap: Math.min(CONSISTENCY_ZERO, gap), weight: 1 });
      else if (gap <= CONSISTENCY_ZERO) gaps.push({ gap, weight: INVALID_WEIGHT });
    }
  }
  return gaps;
}

export async function rateSession(tx: Sql, sessionId: string) {
  const [s] = await tx<{ driver_id: string; track_id: string; track: string; car_class: string | null; session_type: string | null; rating_type: string | null }[]>`
    select s.driver_id, s.track_id, t.key as track, c.class as car_class, s.session_type,
           to_jsonb(s) ->> 'rating_type' as rating_type   -- null before migration 0010
    from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId}`;
  if (!s) return null;
  const laps = await tx<LapRow[]>`
    select number, coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms) as t, comparable, excluded_reasons, metrics
    from lap where session_id = ${sessionId}`;
  // Lap times with the cost of the fuel above minimum fuel removed (lib/fuel.ts; laps from app 0.1.6+)
  const corrected = laps.map((l) => ({ ...l, t: l.t - 1000 * fuelSeconds(s.track, l.metrics?.fuel_l) }));
  const valid = corrected.filter((l) => l.comparable).map((l) => l.t).sort((a, b) => a - b);
  if (!valid.length) return null;                        // nothing to judge: no valid flying lap

  // Fuel-corrected team best, like this session's laps (this session's valid laps count: never null here)
  const reference = (await paceReference(tx, sessionId, { fuelCorrected: true })).reference_ms!;
  const best = valid[0];
  const pace = clamp(100 * (1 - (best - reference) / reference / 0.06));

  const isFlying = (l: LapRow) => !l.excluded_reasons.some((r) => r.startsWith("pit_") || r === "distance" || r === "track_edges");
  const type = ratingType(s.rating_type, s.session_type);
  const gaps = lapGaps(corrected.map((l) => ({ number: l.number, t: l.t, valid: l.comparable, invalid: !l.comparable && isFlying(l),
                                             pit: l.excluded_reasons.some((r) => r.startsWith("pit_")) })), type === "race");
  const gapWeight = gaps.reduce((a, g) => a + g.weight, 0);
  const consistency = valid.length >= 3 && gapWeight
    ? clamp(100 * (1 - (gaps.reduce((a, g) => a + g.gap * g.weight, 0) / gapWeight - CONSISTENCY_FULL) / (CONSISTENCY_ZERO - CONSISTENCY_FULL)))
    : null;

  const flying = laps.filter(isFlying);
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
  for (const [k, w] of Object.entries(WEIGHTS_BY_TYPE[type])) {
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

type PartKey = "pace" | "consistency" | "clean" | "smoothness";
export type HistoryPoint = {
  id: string; session_id: string; at: string; track: string; rating: number; session_score: number;
  pace: number | null; consistency: number | null; clean: number | null; smoothness: number | null;   // current form after it
};

/** The rating after each rated session, with the sub-ratings of the current form at that moment:
 *  formSessions replayed row by row (same 60-day window, 5+ valid laps, best session per track). */
export async function ratingHistory(tx: Sql, driverId: string): Promise<HistoryPoint[]> {
  const rows = await tx<(Omit<FormSession, "id"> & { id: string; session_id: string; rating: number; at: Date; track: string })[]>`
    select r.id, r.session_id, r.rating, r.session_score, r.pace, r.consistency, r.clean, r.smoothness, r.laps, s.track_id, t.key as track,
           coalesce(s.recorded_at, s.uploaded_at) as at
    from driver_rating r join session s on s.id = r.session_id join track t on t.id = s.track_id
    where r.driver_id = ${driverId} order by r.id`;
  return rows.map((row, k) => {
    const mine = rows.slice(0, k + 1);
    const last = Math.max(...mine.map((r) => new Date(r.at).getTime()));
    const win = mine.filter((r) => new Date(r.at).getTime() > last - FORM_DAYS * 86_400_000);
    const pool = win.some((r) => r.laps >= FORM_MIN_LAPS) ? win.filter((r) => r.laps >= FORM_MIN_LAPS) : win;
    const best = new Map<string, (typeof rows)[number]>();
    for (const r of pool) {
      const b = best.get(r.track_id);
      if (!b || r.session_score > b.session_score || (r.session_score === b.session_score && Number(r.id) > Number(b.id))) best.set(r.track_id, r);
    }
    const form = [...best.values()];
    const avg = (key: PartKey) => {
      const v = form.map((r) => r[key]).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return { id: String(row.id), session_id: String(row.session_id), at: new Date(row.at).toISOString(), track: row.track,
             rating: row.rating, session_score: row.session_score,
             pace: avg("pace"), consistency: avg("consistency"), clean: avg("clean"), smoothness: avg("smoothness") };
  });
}

/** Highest rating each driver reached once no longer provisional (from their 3rd rated session). */
export async function allTimeBest(tx: Sql) {
  const rows = await tx<{ driver_id: string; best: number }[]>`
    select driver_id, max(rating) as best
    from (select driver_id, rating, row_number() over (partition by driver_id order by id) as n from driver_rating) x
    where n >= ${PROVISIONAL_SESSIONS} group by driver_id`;
  return new Map(rows.map((r) => [r.driver_id, r.best]));
}

/** Replays one driver's sessions in upload order (after their session type was changed). */
export async function rebuildDriverRatings(sql: postgres.Sql, driverId: string) {
  const before = await currentRatings();
  await sql.begin(async (tx) => {
    await tx`delete from driver_rating where driver_id = ${driverId}`;
    const sessions = await tx<{ id: string }[]>`select id from session where driver_id = ${driverId} order by uploaded_at, id`;
    for (const s of sessions) await rateSession(tx, s.id);
  });
  await announcePromotions(before).catch((e) => console.error("discord promotions", e));
}

/** Replays every session in upload order (after changing the formula, or for sessions uploaded
 *  before ratings existed). Uses today's targets and team bests for all of them. */
export async function rebuildRatings(sql: postgres.Sql) {
  const before = await currentRatings();
  const result = await sql.begin(async (tx) => {
    await tx`delete from driver_rating`;
    const sessions = await tx<{ id: string }[]>`select id from session order by uploaded_at, id`;
    let rated = 0;
    for (const s of sessions) if (await rateSession(tx, s.id)) rated++;
    return { sessions: sessions.length, rated };
  });
  // Rank promotions caused by the replay are posted like after an upload (user's request)
  await announcePromotions(before).catch((e) => console.error("discord promotions", e));
  return result;
}
