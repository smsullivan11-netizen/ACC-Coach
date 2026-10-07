import "server-only";
import type postgres from "postgres";
import { latestMap, recomputeCornerResults } from "./corner-maps";
import { decodeChannel, type EncodedChannel } from "./trace";
import { decodeStored, encodeChannel, packChannel } from "./trace-store";
import { repairTraceTime } from "./trace-time";

// Repairs trace clocks from apps before 0.3 (lib/trace-time.ts): at upload, and once for the laps
// already stored (Settings, admins). A lap without a game or server time is left as it is (its
// time comes from the trace itself: nothing to check it against).

type Sql = postgres.Sql;
const lapSeconds = (official: number | null | undefined, game: number | null | undefined) => {
  const ms = official ?? game;
  return ms ? ms / 1000 : null;
};

/** Upload: repairs a bundle lap's time channel in place. True when it changed (the corner results
 *  the app computed on the faulty clock are then recomputed by the site, lib/corner-maps.ts). */
export function repairBundleLap(l: { official_lap_time_ms: number | null; game_lap_time_ms?: number | null;
                                     trace?: { step_m: number; channels: Record<string, unknown> } | null }): boolean {
  const ch = l.trace?.channels as Record<string, EncodedChannel> | undefined;
  const lapS = lapSeconds(l.official_lap_time_ms, l.game_lap_time_ms);
  if (!ch?.time_s || !ch.speed_ms || !lapS) return false;
  const fixed = repairTraceTime(decodeChannel(ch.time_s), decodeChannel(ch.speed_ms), l.trace!.step_m, lapS);
  if (!fixed) return false;
  ch.time_s = encodeChannel(fixed, ch.time_s.scale);
  return true;
}

/** Once (Settings): every stored lap whose trace clock disagrees with its lap time is repaired, then
 *  the corner results of those sessions are recomputed with the track's latest map. */
export async function repairStoredTraces(sql: Sql) {
  const rows = await sql<{ id: string; session_id: string; track_id: string; official: number | null; game: number | null;
                           step_m: number; time: EncodedChannel; speed: EncodedChannel }[]>`
    select l.id, l.session_id, s.track_id, l.official_lap_time_ms as official, l.game_lap_time_ms as game, tr.step_m,
           tr.channels->'time_s' as time, tr.channels->'speed_ms' as speed
    from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where tr.channels ? 'time_s' and tr.channels ? 'speed_ms'
      and coalesce(l.official_lap_time_ms, l.game_lap_time_ms) is not null`;
  const repaired: string[] = [];
  const sessions = new Map<string, string>();   // session → track
  for (const r of rows) {
    const time = decodeStored(r.time);
    const fixed = repairTraceTime(time, decodeStored(r.speed), r.step_m, lapSeconds(r.official, r.game)!);
    if (!fixed) continue;
    const packed = packChannel(encodeChannel(fixed, r.time.scale));
    await sql`update lap_trace set channels = jsonb_set(channels, '{time_s}', ${sql.json(packed as never)}) where lap_id = ${r.id}`;
    repaired.push(r.id);
    sessions.set(r.session_id, r.track_id);
  }
  for (const [sessionId, trackId] of sessions) {
    const map = await latestMap(sql, trackId);
    if (map?.definition) await sql.begin((tx) => recomputeCornerResults(tx, map.id, map.definition!, trackId, sessionId));
  }
  return { checked: rows.length, repaired: repaired.length, sessions: sessions.size };
}
