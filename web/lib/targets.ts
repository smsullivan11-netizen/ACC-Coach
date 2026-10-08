import "server-only";
import type postgres from "postgres";
import { sourceShort } from "./reference-adjust";
import { BOP_LABELS, REFERENCE_FACTOR, type Bop } from "./references";

// Reference lap times per BoP (lib/references.ts: OhneSpeed's sheet, user's choice 2026-10-07). Two
// references, both real lap times (never fuel-corrected: a corrected lap was never driven, user's rule):
//  - ratingReference (the hidden 100 of the pace score): the sheet's time × 1.01 for the session's car,
//    track and BoP (stock BoP: the qualifying time; LFM BoP: the low-fuel top time), so a teammate
//    beating it never lowers everyone else's rating (team: within 1 % of the best = alien). Fallbacks:
//    the car's default-BoP time (a car the LFM tab lacks), its class's average on the track (GT3 and
//    GT4 only: the Cup cars differ too much), then the team's best real lap in the class;
//  - paceReference (shown on the site, coaching notes): the faster of that target and the team's best
//    valid lap in that car; without a target, the team's best in its class.

type Sql = postgres.Sql | postgres.TransactionSql;
export type PaceReference = {
  bop: Bop;
  sheet_ms: number | null;       // the sheet's time behind the target (qualifying / top time)
  target_ms: number | null;      // sheet time × 1.01
  source: string | null;         // where the target comes from
  team_best_ms: number | null;   // in the same car when it has a target, else in the same class
  reference_ms: number | null;   // the faster of the target and the team's best
  car: string | null;
};

type Refs = {
  bop: Bop; car: string | null; own: number | null; own_default: number | null; class_avg: number | null;
  own_source: string | null; own_default_source: string | null;
  class_avg_default: number | null; car_best: number | null; class_best: number | null;
};

async function references(db: Sql, sessionId: string): Promise<Refs | null> {
  const [r] = await db<Refs[]>`
    with me as (select s.track_id, lower(t.key) as track_key, c.id as car_id, c.key as car_key, c.class,
                       coalesce(s.bop_chosen, s.bop, 'default') as bop
                from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId}),
    laps as (select coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t, c.id as car_id, c.class
             from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
             where ss.track_id = (select track_id from me) and l.comparable)
    select me.bop, me.car_key as car,
      (select r.time_ms from lap_reference r where r.bop = me.bop and r.track_key = me.track_key and r.car_key = me.car_key) as own,
      (select r.source from lap_reference r where r.bop = me.bop and r.track_key = me.track_key and r.car_key = me.car_key) as own_source,
      (select r.source from lap_reference r where r.bop = 'default' and r.track_key = me.track_key and r.car_key = me.car_key) as own_default_source,
      (select r.time_ms from lap_reference r where r.bop = 'default' and r.track_key = me.track_key and r.car_key = me.car_key) as own_default,
      (select avg(r.time_ms)::float8 from lap_reference r
        where r.bop = me.bop and r.track_key = me.track_key and r.car_class = me.class and me.class in ('GT3', 'GT4')) as class_avg,
      (select avg(r.time_ms)::float8 from lap_reference r
        where r.bop = 'default' and r.track_key = me.track_key and r.car_class = me.class and me.class in ('GT3', 'GT4')) as class_avg_default,
      (select min(t) from laps where car_id = me.car_id) as car_best,
      (select min(t) from laps where class is not distinct from me.class) as class_best
    from me`;
  return r ?? null;
}

/** The sheet time behind a session's target, and where it comes from. */
function sheetTime(r: Refs): { ms: number | null; source: string | null } {
  // Older GT3s' default-BoP times are corrected estimates (lib/reference-adjust.ts): said so
  if (r.own != null) return { ms: r.own, source: `${sourceShort(r.own_source)}, ${BOP_LABELS[r.bop]}` };
  if (r.own_default != null) return { ms: r.own_default, source: `${sourceShort(r.own_default_source)}, ${BOP_LABELS.default}` };
  if (r.class_avg != null) return { ms: r.class_avg, source: `OhneSpeed, class average, ${BOP_LABELS[r.bop]}` };
  if (r.class_avg_default != null) return { ms: r.class_avg_default, source: `OhneSpeed, class average, ${BOP_LABELS.default}` };
  return { ms: null, source: null };
}

export async function paceReference(db: Sql, sessionId: string): Promise<PaceReference> {
  const r = await references(db, sessionId);
  if (!r) return { bop: "default", sheet_ms: null, target_ms: null, source: null, team_best_ms: null, reference_ms: null, car: null };
  const { ms, source } = sheetTime(r);
  const target = ms != null ? Math.round(ms * REFERENCE_FACTOR) : null;
  const teamBest = target != null ? r.car_best : r.class_best;
  const candidates = [target, teamBest].filter((x): x is number => x != null);
  return { bop: r.bop, sheet_ms: ms, target_ms: target, source, team_best_ms: teamBest,
           reference_ms: candidates.length ? Math.min(...candidates) : null, car: r.car };
}

/** The pace score's 100 for a session (see above); null without any reference or lap. */
export async function ratingReference(db: Sql, sessionId: string): Promise<number | null> {
  const r = await references(db, sessionId);
  if (!r) return null;
  const { ms } = sheetTime(r);
  return ms != null ? ms * REFERENCE_FACTOR : r.class_best;
}

/** "1:24.500" → 84500 ms (null when not a lap time between 10 s and 1 h). */
export function parseLapTime(s: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)\s*$/.exec(s);
  if (!m) return null;
  const ms = Math.round(((m[1] ? +m[1] : 0) * 60 + +m[2]) * 1000);
  return ms > 10_000 && ms < 3_600_000 ? ms : null;
}
