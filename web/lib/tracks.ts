import "server-only";
import { sql } from "./db";
import type { EncodedChannel } from "./trace";
import { decodeStored } from "./trace-store";
import { TRACKS } from "./track-catalog";
export { TRACKS } from "./track-catalog";

// The ACC tracks: full names and countries (flags in public/flags/) and their photos
// (public/tracks/<key>.jpg: the team's ACC screenshots; credits in track-photo-credits.json). Every track listed here has a photo; the
// outline (from the team's best lap with car positions) is only for other tracks.

// ACC names some tracks with capitals ("Zolder", "Paul_Ricard", "Barcelona") and others in lowercase:
// every lookup goes through the lowercase key.
export const trackKey = (key: string) => key.toLowerCase();
export const trackInfo = (key: string) => TRACKS[trackKey(key)];

/** Whether public/tracks/<key>.jpg exists (every ACC track in TRACKS has one). */
export const hasPhoto = (key: string) => trackKey(key) in TRACKS;

/** The track's photo; ?v= changes when photos are replaced, so browsers do not keep the old one. */
export const photoUrl = (key: string) => `/tracks/${trackKey(key)}.jpg?v=3`;

/** SVG path of each track's outline, scaled into a 100 × 60 box (keys: track keys). */
export async function trackOutlines(): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; x: EncodedChannel; z: EncodedChannel }[]>`
    select distinct on (t.key) t.key, tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z
    from lap l join session s on s.id = l.session_id join track t on t.id = s.track_id join lap_trace tr on tr.lap_id = l.id
    where tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m'
    order by t.key, l.comparable desc, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)`;
  const out: Record<string, string> = {};
  for (const r of rows) {
    const x = decodeStored(r.x), z = decodeStored(r.z);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < x.length; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); z0 = Math.min(z0, z[i]); z1 = Math.max(z1, z[i]); }
    const k = Math.min(92 / (x1 - x0), 52 / (z1 - z0));             // fit into 100 × 60 with a margin
    const ox = (100 - (x1 - x0) * k) / 2, oz = (60 - (z1 - z0) * k) / 2;
    const step = Math.max(1, Math.floor(x.length / 400));
    let d = "";
    for (let i = 0; i < x.length; i += step) d += `${d ? "L" : "M"}${(ox + (x[i] - x0) * k).toFixed(1)},${(oz + (z[i] - z0) * k).toFixed(1)}`;
    out[trackKey(r.key)] = d + "Z";
  }
  return out;
}
