import "server-only";
import { sql } from "./db";
import { decodeChannel, type EncodedChannel } from "./trace";

// The ACC tracks: full names and countries (flags in public/flags/) and their photos
// (public/tracks/<key>.jpg: the team's ACC screenshots; credits in track-photo-credits.json). Every track listed here has a photo; the
// outline (from the team's best lap with car positions) is only for other tracks.

export const TRACKS: Record<string, { name: string; country: string }> = {
  barcelona: { name: "Circuit de Barcelona-Catalunya", country: "es" },
  brands_hatch: { name: "Brands Hatch", country: "gb" },
  cota: { name: "Circuit of the Americas", country: "us" },
  donington: { name: "Donington Park", country: "gb" },
  hungaroring: { name: "Hungaroring", country: "hu" },
  imola: { name: "Imola", country: "it" },
  indianapolis: { name: "Indianapolis", country: "us" },
  kyalami: { name: "Kyalami", country: "za" },
  laguna_seca: { name: "Laguna Seca", country: "us" },
  misano: { name: "Misano", country: "it" },
  monza: { name: "Monza", country: "it" },
  mount_panorama: { name: "Mount Panorama", country: "au" },
  nurburgring: { name: "Nürburgring GP", country: "de" },
  nurburgring_24h: { name: "Nürburgring Nordschleife", country: "de" },
  oulton_park: { name: "Oulton Park", country: "gb" },
  paul_ricard: { name: "Paul Ricard", country: "fr" },
  red_bull_ring: { name: "Red Bull Ring", country: "at" },
  silverstone: { name: "Silverstone", country: "gb" },
  snetterton: { name: "Snetterton", country: "gb" },
  spa: { name: "Spa-Francorchamps", country: "be" },
  suzuka: { name: "Suzuka", country: "jp" },
  valencia: { name: "Valencia (Ricardo Tormo)", country: "es" },
  watkins_glen: { name: "Watkins Glen", country: "us" },
  zandvoort: { name: "Zandvoort", country: "nl" },
  zolder: { name: "Zolder", country: "be" },
};

/** Whether public/tracks/<key>.jpg exists (every ACC track in TRACKS has one). */
export const hasPhoto = (key: string) => key in TRACKS;

/** SVG path of each track's outline, scaled into a 100 × 60 box (keys: track keys). */
export async function trackOutlines(): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; x: EncodedChannel; z: EncodedChannel }[]>`
    select distinct on (t.key) t.key, tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z
    from lap l join session s on s.id = l.session_id join track t on t.id = s.track_id join lap_trace tr on tr.lap_id = l.id
    where tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m'
    order by t.key, l.comparable desc, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)`;
  const out: Record<string, string> = {};
  for (const r of rows) {
    const x = decodeChannel(r.x), z = decodeChannel(r.z);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < x.length; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); z0 = Math.min(z0, z[i]); z1 = Math.max(z1, z[i]); }
    const k = Math.min(92 / (x1 - x0), 52 / (z1 - z0));             // fit into 100 × 60 with a margin
    const ox = (100 - (x1 - x0) * k) / 2, oz = (60 - (z1 - z0) * k) / 2;
    const step = Math.max(1, Math.floor(x.length / 400));
    let d = "";
    for (let i = 0; i < x.length; i += step) d += `${d ? "L" : "M"}${(ox + (x[i] - x0) * k).toFixed(1)},${(oz + (z[i] - z0) * k).toFixed(1)}`;
    out[r.key] = d + "Z";
  }
  return out;
}
