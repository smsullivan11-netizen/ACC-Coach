import "server-only";
import type postgres from "postgres";

// Laps too fast to be real (user's rule, 2026-10-07): more than 0.5 % faster than the best ever for
// the car on that track: the reference time of the session's BoP (lib/references.ts, OhneSpeed's
// sheet: stock-BoP qualifying or LFM-BoP top time) × 0.995, i.e. about 1.5 % under the 101 % target.
// ACC usually invalidates real cuts already; this catches the rest (servers with track limits off,
// game glitches). Such a lap gets the excluded reason "too_fast", so it is treated like an invalid lap
// everywhere: no pace, leaderboards, records, corner maps or track outline; clean driving counts it as
// invalid, consistency like the other invalid laps. A car without a reference of its own uses its
// default-BoP one, then its class's average on the track (GT3, GT4); none, no check. An admin can
// clear a lap ("not a cut": lap.metrics.too_fast_ok), which then stays cleared.

type Sql = postgres.Sql | postgres.TransactionSql;
export const TOO_FAST = "too_fast";
export const TOO_FAST_FACTOR = 0.995;   // × the reference time (the best ever), not the 101 % target

/** Flags or clears "too_fast" on the laps of a session, a track, one lap, or all of them. Only laps
 *  that are otherwise valid flying laps are concerned. Returns the drivers whose laps changed (their
 *  ratings need a replay, except right after an upload where the session is rated next). */
export async function flagTooFast(db: Sql, where: { sessionId?: string; trackKey?: string; lapId?: string } = {}) {
  const filter = where.lapId ? db`l.id = ${where.lapId}`
    : where.sessionId ? db`l.session_id = ${where.sessionId}`
    : where.trackKey ? db`lower(t.key) = lower(${where.trackKey})`
    : db`true`;
  const rows = await db<{ driver_id: string }[]>`
    with cand as (
      select l.id, s.driver_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as ms,
             coalesce((l.metrics->>'too_fast_ok')::boolean, false) as cleared, l.excluded_reasons as reasons,
             lower(t.key) as track_key, c.key as car_key, c.class, coalesce(s.bop_chosen, s.bop, 'default') as bop
      from lap l join session s on s.id = l.session_id join track t on t.id = s.track_id left join car c on c.id = s.car_id
      where ${filter} and cardinality(array_remove(l.excluded_reasons, ${TOO_FAST})) = 0),
    judged as (
      select id, driver_id, reasons, cleared, ms,
             coalesce(
               (select r.time_ms from lap_reference r where r.bop = cand.bop and r.track_key = cand.track_key and r.car_key = cand.car_key),
               (select r.time_ms from lap_reference r where r.bop = 'default' and r.track_key = cand.track_key and r.car_key = cand.car_key),
               (select avg(r.time_ms) from lap_reference r where r.bop = cand.bop and r.track_key = cand.track_key
                  and r.car_class = cand.class and cand.class in ('GT3', 'GT4'))) as ref_ms
      from cand)
    update lap l set excluded_reasons = case when j.too_fast then array[${TOO_FAST}]::text[] else '{}'::text[] end,
                     comparable = not j.too_fast
    from (select id, driver_id, reasons, (ref_ms is not null and not cleared and ms < ref_ms * ${TOO_FAST_FACTOR}) as too_fast from judged) j
    where l.id = j.id and (${TOO_FAST} = any(j.reasons)) is distinct from j.too_fast
    returning j.driver_id`;
  return [...new Set(rows.map((r) => r.driver_id))];
}
