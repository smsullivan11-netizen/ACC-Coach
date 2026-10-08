import "server-only";
import type postgres from "postgres";
import { adjustDefault } from "./reference-adjust";

// Reference lap times (user's choice, 2026-10-07): OhneSpeed's public "ACC race pace" spreadsheet,
// read from its published CSV pages. Per car and track: the stock-BoP qualifying time and the LFM-BoP
// top time (LFM hotlaps + BoP + 0.5 %, low fuel), with LFM's ballast and restrictor; GT3, GT4, the
// 992 Cup and the M2 (single-make: the same time for both BoPs). The pace score's 100 = time × 1.01
// for the session's BoP (lib/targets.ts). Imported automatically the first time the table is empty
// (ensureReferences), and again by an admin (Settings) when the sheet is updated. Credited on /credits.

type Sql = postgres.Sql;
export type Bop = "default" | "lfm";
export const BOPS: Bop[] = ["default", "lfm"];
export const BOP_LABELS: Record<Bop, string> = { default: "Default BoP", lfm: "LFM BoP" };
export const REFERENCE_FACTOR = 1.01;   // the 101 % rule
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSncrVjB4T_yMxl19TSF78QTRz5kdlRuHvnanFDrgOZo2Il3pJTL0sOQkiLrWGwrBPMHkq4yyfK4g0s/pubhtml";
const PUB = SHEET_URL.replace(/pubhtml$/, "pub");

type Tab = { gid: string; label: string; bop: Bop | "both"; cls: "GT3" | "GT4" | "Cup"; car?: string };
const TABS: Tab[] = [
  { gid: "690482649", label: "Race pace v1.9.6+ (stockBoP)", bop: "default", cls: "GT3" },
  { gid: "1766901750", label: "Race pace v1.9.6+ (LFMBOP)", bop: "lfm", cls: "GT3" },
  { gid: "207992541", label: "Race pace GT4 calculated (stockBoP)", bop: "default", cls: "GT4" },
  { gid: "2109333702", label: "Race pace GT4 (LFMBOP)", bop: "lfm", cls: "GT4" },
  { gid: "196004847", label: "Race pace 992 CUP", bop: "both", cls: "Cup", car: "porsche_992_gt3_cup" },
  { gid: "720411801", label: "Race pace M2", bop: "both", cls: "Cup", car: "bmw_m2_cs_racing" },
];

// The sheet's names → ACC's keys (the game's carModel and track strings)
const TRACKS: Record<string, string> = {
  barcelona: "barcelona", "brands hatch": "brands_hatch", cota: "cota", "donington park": "donington",
  hungaroring: "hungaroring", imola: "imola", indianapolis: "indianapolis", kyalami: "kyalami",
  "laguna seca": "laguna_seca", misano: "misano", monza: "monza", "mount panorama": "mount_panorama",
  nordschleife: "nurburgring_24h", nurburgring: "nurburgring", "oulton park": "oulton_park",
  "paul ricard": "paul_ricard", "red bull ring": "red_bull_ring", silverstone: "silverstone",
  snetterton: "snetterton", spa: "spa", suzuka: "suzuka", valencia: "valencia", "watkins glen": "watkins_glen",
  zandvoort: "zandvoort", zolder: "zolder",
};
const CARS: Record<string, string> = {
  "ford mustang gt3 (2024)": "ford_mustang_gt3",
  "bmw m4 gt3 (2021)": "bmw_m4_gt3",
  "lamborghini huracan gt3 evo 2 (2023)": "lamborghini_huracan_gt3_evo2",
  "audi r8 lms gt3 evo ii (2022)": "audi_r8_lms_evo_ii",
  "mclaren 720s gt3 evo (2023)": "mclaren_720s_gt3_evo",
  "ferrari 296 gt3 (2023)": "ferrari_296_gt3",
  "amr v8 vantage (2019)": "amr_v8_vantage_gt3",
  "mercedes-amg gt3 (2020)": "mercedes_amg_gt3_evo",
  "porsche 992 gt3 r (2023)": "porsche_992_gt3_r",
  "nissan gt-r nismo gt3 (2018)": "nissan_gt_r_gt3_2018",
  "honda nsx gt3 evo (2019)": "honda_nsx_gt3_evo",
  "bentley continental (2018)": "bentley_continental_gt3_2018",
  "lexus rc f gt3 (2016)": "lexus_rc_f_gt3",
  "ferrari 488 gt3 evo (2020)": "ferrari_488_gt3_evo",
  "porsche 991ii gt3 r (2019)": "porsche_991ii_gt3_r",
  "mclaren 720s gt3 (2019)": "mclaren_720s_gt3",
  "bmw m6 gt3 (2017)": "bmw_m6_gt3",
  "amr v12 vantage gt3 (2013)": "amr_v12_vantage_gt3",
  "reiter engineering r-ex gt3 (2017)": "lamborghini_gallardo_rex",
  "lamborghini huracan gt3 evo (2019)": "lamborghini_huracan_gt3_evo",
  "porsche 991 gt3 r (2018)": "porsche_991_gt3_r",
  "mercedes-amg gt3 (2015)": "mercedes_amg_gt3",
  "emil frey jaguar g3 (2012)": "jaguar_g3",
  "mclaren 650s gt3 (2015)": "mclaren_650s_gt3",
  "audi r8 lms evo (2019)": "audi_r8_lms_evo",
  "ferrari 488 gt3 (2018)": "ferrari_488_gt3",
  "audi r8 lms (2015)": "audi_r8_lms",
  "bentley continental (2015)": "bentley_continental_gt3_2016",
  "lamborghini huracan gt3 (2015)": "lamborghini_huracan_gt3",
  "nissan gt-r nismo gt3 (2015)": "nissan_gt_r_gt3_2017",
  "honda nsx gt3 (2017)": "honda_nsx_gt3",
  "maserati mc gt4 (2016)": "maserati_mc_gt4",
  "mercedes amg gt4 (2016)": "mercedes_amg_gt4",
  "porsche 718 cayman gt4 clubsport (2019)": "porsche_718_cayman_gt4_mr",
  "mclaren 570s gt4 (2016)": "mclaren_570s_gt4",
  "ginetta g55 gt4 (2012)": "ginetta_g55_gt4",
  "alpine a110 gt4 (2018)": "alpine_a110_gt4",
  "chevrolet camaro gt4 (2017)": "chevrolet_camaro_gt4r",
  "aston martin vantage gt4 (2018)": "amr_v8_vantage_gt4",
  "ktm x-bow gt4 (2016)": "ktm_xbow_gt4",
  "bmw m4 gt4 (2018)": "bmw_m4_gt4",
  "audi r8 lms gt4 (2018)": "audi_r8_gt4",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const trackKey = (s: string) => TRACKS[norm(s)] ?? null;

/** "01:41.93", "1:41.930", "08:02.073" → ms (null when not a lap time). */
export function parseSheetTime(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})\.(\d{1,3})$/.exec((s ?? "").trim());
  if (!m) return null;
  const ms = (+m[1] * 60 + +m[2]) * 1000 + +m[3].padEnd(3, "0");
  return ms > 10_000 && ms < 3_600_000 ? ms : null;
}

/** LFM's BoP cell: "20/-7 kg" (restrictor % / ballast kg), "-7 kg", "0". */
function parseBop(s: string | undefined): { ballast: number | null; restrictor: number | null } {
  const m = /^\s*(?:(-?\d+(?:\.\d+)?)\s*\/\s*)?(-?\d+(?:\.\d+)?)\s*(?:kg)?\s*$/i.exec(s ?? "");
  return m ? { ballast: +m[2], restrictor: m[1] != null ? +m[1] : 0 } : { ballast: null, restrictor: null };
}

/** Minimal CSV reader (quoted fields, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export type ReferenceRow = { bop: Bop; track_key: string; car_key: string; car_class: string; time_ms: number;
                             ballast_kg: number | null; restrictor_pct: number | null; source: string };

/** One tab → reference rows, plus the car titles it could not map to an ACC key. */
export function readTab(tab: Tab, rows: string[][]): { refs: ReferenceRow[]; unknown: string[]; date: string | null } {
  const refs: ReferenceRow[] = [], unknown: string[] = [];
  const dateCell = rows.slice(0, 4).flat().find((c) => /^Last updated:/i.test(c));
  const date = dateCell ? dateCell.replace(/^Last updated:\s*/i, "").trim() : null;
  const bops: Bop[] = tab.bop === "both" ? BOPS : [tab.bop];
  const add = (car: string, cells: string[], timeCol: number, bopCol: number) => {
    const track = trackKey(cells[0] ?? ""), time = parseSheetTime(cells[timeCol]);
    if (!track || !time) return;
    const b = bopCol >= 0 ? parseBop(cells[bopCol]) : { ballast: null, restrictor: null };
    for (const bop of bops)
      refs.push({ bop, track_key: track, car_key: car, car_class: tab.cls, time_ms: time,
                  ballast_kg: bop === "lfm" ? b.ballast : null, restrictor_pct: bop === "lfm" ? b.restrictor : null, source: tab.label });
  };
  if (tab.car) {
    // One car: a single table "Track | Top | 101% …"
    const h = rows.findIndex((r) => norm(r[0] ?? "") === "track");
    const timeCol = h >= 0 ? rows[h].findIndex((c) => norm(c) === "top") : -1;
    if (timeCol > 0) for (const r of rows.slice(h + 1)) add(tab.car, r, timeCol, -1);
    return { refs, unknown, date };
  }
  // Several cars: a block per car, its name on a row of its own, then a "Track" header row whose
  // time column is "Qualy" (stock BoP) or "Top time" (the others); LFM tabs add a "BoP" column
  for (let i = 0; i + 1 < rows.length; i++) {
    const title = (rows[i][0] ?? "").trim(), header = rows[i + 1];
    if (!title || norm(header[0] ?? "") !== "track" || rows[i].slice(1).some((c) => c.trim())) continue;
    const timeCol = header.findIndex((c) => norm(c) === "qualy") >= 0 ? header.findIndex((c) => norm(c) === "qualy") : header.findIndex((c) => norm(c) === "top time");
    if (timeCol < 0) continue;            // the summary tables at the top of the tab
    if (/^top\b/.test(norm(title))) continue;   // "Top car", "Top 8 car average": summary tables
    const car = CARS[norm(title)];
    if (!car) { unknown.push(title); continue; }
    const bopCol = tab.bop === "lfm" ? header.findIndex((c) => norm(c) === "bop") : -1;
    for (let j = i + 2; j < rows.length && trackKey(rows[j][0] ?? ""); j++) add(car, rows[j], timeCol, bopCol);
  }
  return { refs, unknown, date };
}

/** Reads every tab and replaces the table. Returns what was read, per tab. */
export async function importReferences(sql: Sql) {
  const all: ReferenceRow[] = [], report: { tab: string; rows: number; unknown: string[] }[] = [];
  let date: string | null = null;
  for (const tab of TABS) {
    const res = await fetch(`${PUB}?gid=${tab.gid}&single=true&output=csv`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${tab.label}: HTTP ${res.status}`);
    const read = readTab(tab, parseCsv(await res.text()));
    all.push(...read.refs);
    report.push({ tab: tab.label, rows: read.refs.length, unknown: read.unknown });
    date ??= read.date;
  }
  if (all.length < 500) throw new Error(`only ${all.length} references read: the sheet's layout may have changed`);
  // The same car and track can appear twice (a tab per class): the first one stays
  const seen = new Set<string>();
  const rows = all.filter((r) => { const k = `${r.bop}|${r.track_key}|${r.car_key}`; return !seen.has(k) && seen.add(k); })
    .map((r) => ({ ...r, sheet_date: date }));
  // The older GT3s' times and some single tracks are not usable as they are (lib/reference-adjust.ts)
  const adjusted = adjustDefault(rows);
  await sql.begin(async (tx) => {
    await tx`delete from lap_reference`;
    for (let i = 0; i < rows.length; i += 500) await tx`insert into lap_reference ${tx(rows.slice(i, i + 500))}`;
  });
  return { references: rows.length, sheetDate: date, tabs: report, adjusted };
}

/** The references, imported once when the table is still empty (first upload or rating after the
 *  deploy). Never throws: without them the rating falls back to the team's best lap. */
export async function ensureReferences(sql: Sql) {
  try {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from lap_reference`;
    if (n === 0) await importReferences(sql);
  } catch (e) {
    console.error("references import", e);
  }
}

/** BoP detected from what the app saw: offline = the game's default BoP; online on an LFM server
 *  (ACC's log names it "lowfuelmotorsport.com | …") = LFM; any other server = default (the team
 *  mostly races default-BoP championships; the session page can change it). */
export function detectBop(serverName: string | null | undefined): Bop {
  return serverName && /lowfuelmotorsport\.com/i.test(serverName) ? "lfm" : "default";
}

/** The session's ballast and restrictor: what the game says the server gave the car (app 0.4+, ACC's
 *  log, migration 0015), else for an LFM session LFM's figures for the car and track as they are now
 *  (LFM changes its BoP over time: old laps keep theirs); none for a default-BoP session without them. */
export async function snapshotBop(db: Sql | postgres.TransactionSql, sessionId: string) {
  // effective BoP = coalesce(bop_chosen, bop, 'default') (migration 0014)
  await db`
    update session s set
      bop_ballast_kg = case when s.game_ballast_kg is not null or s.game_restrictor_pct is not null then s.game_ballast_kg
                            when coalesce(s.bop_chosen, s.bop, 'default') = 'lfm' then r.ballast_kg end,
      bop_restrictor_pct = case when s.game_ballast_kg is not null or s.game_restrictor_pct is not null then s.game_restrictor_pct
                                when coalesce(s.bop_chosen, s.bop, 'default') = 'lfm' then r.restrictor_pct end
    from session s2 join track t on t.id = s2.track_id left join car c on c.id = s2.car_id
    left join lap_reference r on r.bop = 'lfm' and r.track_key = lower(t.key) and r.car_key = c.key
    where s.id = ${sessionId} and s2.id = s.id`;
}
