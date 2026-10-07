import "server-only";
import type postgres from "postgres";

// Laps too fast to be real (user's rule, 2026-10-07): more than 0.5 % faster than LFM's all-time best
// for the car on that track. Targets are LFM's 101 % times, so the limit is target × 0.995 / 1.01
// (about 1.5 % under the target). ACC usually invalidates real cuts already; this catches the rest
// (servers with track limits off, game glitches). Such a lap gets the excluded reason "too_fast", so
// it is treated like an invalid lap everywhere: no pace, leaderboards, records, corner maps or track
// outline; clean driving counts it as invalid, consistency like the other invalid laps. A car without
// a target of its own uses its class's targets on that track (their average); no target, no check.
// An admin can clear a lap ("not a cut": lap.metrics.too_fast_ok), which then stays cleared.

type Sql = postgres.Sql | postgres.TransactionSql;
export const TOO_FAST = "too_fast";
export const TOO_FAST_FACTOR = 0.995 / 1.01;

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
             coalesce(
               (select ct.target_ms from car_target ct where ct.track_key = lower(t.key) and ct.car_key = c.key),
               (select avg(ct.target_ms) from car_target ct join car cc on cc.key = ct.car_key
                 where ct.track_key = lower(t.key) and cc.class is not distinct from c.class)) as target_ms
      from lap l join session s on s.id = l.session_id join track t on t.id = s.track_id left join car c on c.id = s.car_id
      where ${filter} and cardinality(array_remove(l.excluded_reasons, ${TOO_FAST})) = 0),
    judged as (
      select id, driver_id, reasons,
             (target_ms is not null and not cleared and ms < target_ms * ${TOO_FAST_FACTOR}) as too_fast
      from cand)
    update lap l set excluded_reasons = case when j.too_fast then array[${TOO_FAST}]::text[] else '{}'::text[] end,
                     comparable = not j.too_fast
    from judged j
    where l.id = j.id and (${TOO_FAST} = any(j.reasons)) is distinct from j.too_fast
    returning j.driver_id`;
  return [...new Set(rows.map((r) => r.driver_id))];
}
