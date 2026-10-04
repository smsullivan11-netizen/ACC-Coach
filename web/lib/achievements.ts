import "server-only";
import type postgres from "postgres";
import { sql } from "./db";
import { lapTime } from "./format";
import { trackInfo } from "./tracks";

// Achievements (rating levels are ranks instead: lib/ranks.ts): checked after each upload (and replayed for every session by `rebuildAchievements`).
// Each check looks at the driver's data as of that session and returns what is earned; the table
// keeps the first time, so re-checking never duplicates. Icons are lucide-react names.

type Sql = postgres.Sql | postgres.TransactionSql;
export type AchievementDef = { code: string; title: string; description: string; icon: string; tier: "bronze" | "silver" | "gold"; perTrack?: boolean };

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "first_session", title: "Welcome aboard", description: "Upload your first session", icon: "Flag", tier: "bronze" },
  { code: "first_valid", title: "On the board", description: "Drive your first valid lap", icon: "Timer", tier: "bronze" },
  { code: "clean_10", title: "Clean sheet", description: "10 valid laps in a row in one session", icon: "ShieldCheck", tier: "silver" },
  { code: "metronome", title: "Metronome", description: "5 valid laps in a row within 0.3 s of each other", icon: "Activity", tier: "gold" },
  { code: "laps_100", title: "Centurion", description: "100 valid laps in total", icon: "Repeat", tier: "silver" },
  { code: "laps_500", title: "Mileage monster", description: "500 valid laps in total", icon: "Gauge", tier: "gold" },
  { code: "explorer", title: "Globetrotter", description: "Valid laps on 5 different tracks", icon: "Globe", tier: "silver" },
  { code: "long_run", title: "Endurance", description: "45 minutes of driving in one stint", icon: "Hourglass", tier: "silver" },
  { code: "team_best", title: "Team record", description: "Set the team's fastest lap on a track", icon: "Crown", tier: "gold", perTrack: true },
  { code: "target_beaten", title: "Target hunter", description: "Beat the car's target lap time on a track", icon: "Target", tier: "gold", perTrack: true },
  { code: "track_master", title: "Track master", description: "Hold the team record on 3 tracks at once", icon: "Trophy", tier: "gold" },
];
export const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

export type Earned = { code: string; scope: string; detail: string | null };

/** What the session's driver has earned with this session (all checks, as of now). */
async function check(db: Sql, sessionId: string): Promise<Earned[]> {
  const [s] = await db<{ driver_id: string; track_id: string; track: string; car_class: string | null }[]>`
    select s.driver_id, s.track_id, t.key as track, c.class as car_class
    from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id where s.id = ${sessionId}`;
  if (!s) return [];
  const laps = await db<{ id: string; t: number; comparable: boolean; edge: boolean }[]>`
    select id, coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms) as t, comparable,
           'track_edges' = any(excluded_reasons) as edge
    from lap where session_id = ${sessionId} order by number`;
  if (laps.length && laps.every((l) => l.edge)) return [];
  const out: Earned[] = [{ code: "first_session", scope: "", detail: null }];
  const valid = laps.filter((l) => l.comparable);
  if (valid.length) out.push({ code: "first_valid", scope: "", detail: null });

  // Runs of consecutive valid laps
  let run: number[] = [];
  let clean = 0, metronome = false;
  for (const l of laps) {
    if (!l.comparable) { run = []; continue; }
    run.push(l.t);
    clean = Math.max(clean, run.length);
    const last5 = run.slice(-5);
    if (last5.length === 5 && Math.max(...last5) - Math.min(...last5) <= 300) metronome = true;
  }
  if (clean >= 10) out.push({ code: "clean_10", scope: "", detail: `${clean} valid laps in a row` });
  if (metronome) out.push({ code: "metronome", scope: "", detail: "5 laps within 0.3 s" });
  const minutes = laps.reduce((a, l) => a + l.t, 0) / 60000;
  if (minutes >= 45) out.push({ code: "long_run", scope: "", detail: `${Math.round(minutes)} min in one stint` });

  // Career totals up to this session (uploads in order)
  const [tot] = await db<{ laps: number; tracks: number }[]>`
    select count(*)::int as laps, count(distinct s2.track_id)::int as tracks
    from lap l join session s2 on s2.id = l.session_id
    where s2.driver_id = ${s.driver_id} and l.comparable and s2.id <= ${sessionId}`;
  if (tot.laps >= 100) out.push({ code: "laps_100", scope: "", detail: null });
  if (tot.laps >= 500) out.push({ code: "laps_500", scope: "", detail: null });
  if (tot.tracks >= 5) out.push({ code: "explorer", scope: "", detail: null });

  if (valid.length) {
    const best = Math.min(...valid.map((l) => l.t));
    const name = trackInfo(s.track)?.name ?? s.track;
    // Team record: no faster valid lap in the class on this track, from any earlier session
    const [faster] = await db`
      select 1 from lap l join session s2 on s2.id = l.session_id left join car c on c.id = s2.car_id
      where s2.track_id = ${s.track_id} and c.class is not distinct from ${s.car_class} and l.comparable
        and s2.id < ${sessionId} and coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) <= ${best} limit 1`;
    if (!faster) out.push({ code: "team_best", scope: s.track.toLowerCase(), detail: `${name}: ${lapTime(best)}` });
    const [target] = await db<{ target_ms: number }[]>`
      select ct.target_ms from session ss join car c on c.id = ss.car_id
      join car_target ct on ct.car_key = c.key and ct.track_key = ${s.track.toLowerCase()} where ss.id = ${sessionId}`;
    if (target && best <= target.target_ms)
      out.push({ code: "target_beaten", scope: s.track.toLowerCase(), detail: `${name}: ${lapTime(best)} (target ${lapTime(target.target_ms)})` });
  }
  // Records held right now
  const [held] = await db<{ n: number }[]>`select count(distinct track_id)::int as n from lap_ranking where driver_id = ${s.driver_id} and position = 1`;
  if (held.n >= 3) out.push({ code: "track_master", scope: "", detail: `${held.n} team records` });
  return out;
}

/** Checks a session and stores what is new. Returns the newly earned achievements. */
export async function awardAchievements(sessionId: string, db: Sql = sql): Promise<(Earned & AchievementDef)[]> {
  const earned = await check(db, sessionId);
  if (!earned.length) return [];
  const [s] = await db<{ driver_id: string; at: Date }[]>`select driver_id, coalesce(recorded_at, uploaded_at) as at from session where id = ${sessionId}`;
  const added = await db<{ code: string; scope: string; detail: string | null }[]>`
    insert into achievement ${db(earned.map((e) => ({ driver_id: s.driver_id, code: e.code, scope: e.scope, session_id: sessionId, detail: e.detail, earned_at: s.at })))}
    on conflict do nothing returning code, scope, detail`;
  return added.map((a) => ({ ...ACHIEVEMENT_BY_CODE.get(a.code)!, ...a }));
}

/** Replays every session in upload order (after adding achievements, or changing a rule). */
export async function rebuildAchievements() {
  await sql`delete from achievement`;
  const sessions = await sql<{ id: string }[]>`select id from session order by uploaded_at, id`;
  let n = 0;
  for (const s of sessions) n += (await awardAchievements(s.id)).length;
  return { sessions: sessions.length, achievements: n };
}
