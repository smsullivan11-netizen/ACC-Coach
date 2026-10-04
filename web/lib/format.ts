// Display helpers (safe on server and client).

export function lapTime(ms: number | null | undefined): string {
  if (ms == null) return "–";
  const m = Math.floor(ms / 60000);
  const s = (ms % 60000) / 1000;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function gap(ms: number | null | undefined): string {
  if (ms == null) return "";
  return ms === 0 ? "–" : `+${(ms / 1000).toFixed(3)}`;
}

const SPECIAL: Record<string, string> = {
  nurburgring_24h: "Nürburgring 24h",
  nurburgring: "Nürburgring GP",
  spa: "Spa-Francorchamps",
  red_bull_ring: "Red Bull Ring",
  cota: "Circuit of the Americas",
  mount_panorama: "Mount Panorama",
  ford_mustang_gt3: "Ford Mustang GT3",
  mclaren_720s_gt3: "McLaren 720S GT3",
  mclaren_720s_gt3_evo: "McLaren 720S GT3 Evo",
};

/** "brands_hatch" → "Brands Hatch", "ford_mustang_gt3" → "Ford Mustang GT3". */
export function prettyKey(key: string | null | undefined): string {
  if (!key) return "–";
  if (SPECIAL[key]) return SPECIAL[key];
  return key
    .split("_")
    .map((w) => (/^(gt\d|gt\d?r|amg|bmw|amr|nsx|lms|evo|ii|rc|f|m\d|mc)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const REASONS: Record<string, string> = {
  distance: "incomplete",
  server_invalid: "invalid (server)",
  game_invalid: "invalid (track limits)",
  pit_out: "out-lap",
  pit_in: "in-lap",
  track_edges: "edge lap (track map)",
};

const SHORT_CARS: Record<string, string> = {
  ford_mustang_gt3: "Ford",
  mclaren_720s_gt3_evo: "McLaren",
  mclaren_720s_gt3: "McLaren 720S (2019)",
};

/** Short car name for one-line summaries: "Ford", "McLaren"; otherwise the full name. */
export function carShortName(key: string): string {
  return SHORT_CARS[key] ?? prettyKey(key);
}
