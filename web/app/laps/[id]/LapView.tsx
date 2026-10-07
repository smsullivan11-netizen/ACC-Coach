"use client";

import { GitCompareArrows, Maximize2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import Boards, { type Board } from "@/components/Boards";
import Conditions, { type SessionConditions } from "@/components/Conditions";
import TrackSurface, { type Edges } from "@/components/TrackSurface";
import { Segmented, ZONE_OPTIONS } from "@/components/ui";
import { lapTime, prettyKey, REASONS } from "@/lib/format";
import { labelPoint } from "@/lib/geometry";
import { sectionsOf, zoneMode, type ZoneMode } from "@/lib/sections";
import { withSteeringDeg } from "@/lib/steering";
import { decodeTrace, smoothGear, type EncodedTrace, type Trace } from "@/lib/trace";
import Replay from "./Replay";

export type Candidate = { id: string; label: string };

type CornerRow = {
  number: number;
  name: string | null;
  start_m: number;
  apex_m: number;
  end_m: number;
  time_s: number | null;
  entry_speed_kmh: number | null;
  lift_point_m: number | null;
  braking_point_m: number | null;
  min_speed_kmh: number | null;
  lap_apex_m: number | null;
  throttle_pickup_m: number | null;
  full_throttle_m: number | null;
  coasting_s: number | null;
  exit_speed_kmh: number | null;
  zero_m: number | null;      // the corner's reference point (team turn-in, lib/corner-refs.ts)
  brakes: boolean;            // the team brakes for it: virtual boards
  brake_m: number | null;     // its usual braking distance: boards every 50 m, or 100 m for long ones
};
// Virtual distance boards (components/Boards.tsx): a few metres outside the line, on the corner's outside
const BOARD_OFFSET_M = 7;

function boardsOf(c: CornerRow, x: ArrayLike<number>, z: ArrayLike<number>): Board[] {
  if (!c.brakes || c.zero_m == null) return [];
  const n = Math.min(x.length, z.length), a = Math.round(c.apex_m);
  if (a < 26 || a > n - 26) return [];
  // The corner's outside: opposite to the way the line turns around its apex
  const cross = (x[a] - x[a - 25]) * (z[a + 25] - z[a]) - (z[a] - z[a - 25]) * (x[a + 25] - x[a]);
  const out = cross > 0 ? -1 : 1;   // right turn → boards on the left (seen from above, z down)
  const step = (c.brake_m ?? 0) >= 150 ? 100 : 50;
  return [1, 2, 3].flatMap((k) => {
    const d = c.zero_m! - k * step, i = Math.round(d);
    if (i < 3 || i > n - 4) return [];
    const tx = x[i + 3] - x[i - 3], tz = z[i + 3] - z[i - 3], len = Math.hypot(tx, tz) || 1;
    // the driver's right is (-dz, dx)
    return [{ corner: c.number, label: String(k * step), d, x: x[i] + (out * -tz * BOARD_OFFSET_M) / len, z: z[i] + (out * tx * BOARD_OFFSET_M) / len }];
  });
}
/** What the Turn buttons, the replay's checkpoints and the table work on: one corner, or a section
 *  (corners driven as one, lib/sections.ts). */
export type Zone = { key: string; label: string; numbers: number[]; name: string | null; start_m: number; end_m: number;
                     from_m: number };   // where the replay and the charts start: LEAD_S before its braking zone
const ZONES_KEY = "acc-coach:zones";   // the viewer's last choice (this browser only)
type LapData = {
  id: string;
  number: number;
  comparable: boolean;
  excluded_reasons: string[];
  time_ms: number;
  driver: string;
  track: string;
  car: string | null;
  date: string;
  trace: EncodedTrace | null;
  corners: CornerRow[];
  edges: Edges;
  conditions: SessionConditions;
};
type Loaded = LapData & { t: Trace | null };
type Range = [number, number] | null;

const COLORS = ["#ffd200", "#d4d4d8"]; // this lap: team yellow; reference: light grey

/** Chart zoom on a corner or section: from its view start (LEAD_S before the braking zone) to 30 m after it. */
const cornerRange = (c: { from_m: number; end_m: number }): [number, number] => [c.from_m, c.end_m + 30];

// How early the replay checkpoints and the corner zoom start (user's request, 2026-10-07: they began
// too close to the corner, with no view of the approach): this long before the braking (or lift)
// point, at the car's speed there (≈ 85 m at 250 km/h, 40 m at 120 km/h)
const LEAD_S = 1.25;

/** Where to start looking at a corner: the earlier braking (or lift) point of the laps, else the
 *  corner zone's start, minus LEAD_S at the speed there. */
function viewStart(laps: Loaded[], number: number): number {
  const own = laps[0].corners.find((c) => c.number === number);
  if (!own) return 0;
  const points = laps.map((l) => l.corners.find((c) => c.number === number))
    .map((c) => c?.braking_point_m ?? c?.lift_point_m).filter((x): x is number => x != null && x >= own.start_m - 300 && x <= own.end_m);
  const b = points.length ? Math.min(...points) : own.start_m;
  const v = laps[0].t?.channels.speed_ms;
  const speed = v ? v[Math.max(0, Math.min(v.length - 1, Math.round(b)))] : 40;
  return Math.max(0, b - Math.max(15, speed) * LEAD_S);
}

async function loadLap(id: string): Promise<Loaded> {
  const res = await fetch(`/api/laps/${id}`);
  if (!res.ok) throw new Error(`lap ${id}: error ${res.status}`);
  const data = (await res.json()) as LapData;
  const t = data.trace ? decodeTrace(data.trace) : null;
  if (t) t.channels = withSteeringDeg(t.channels, data.car);
  return { ...data, t };
}

const DISCRETE = new Set(["gear", "valid", "tc_level", "tc2_level", "abs_level", "engine_map"]);

/** A lap moved onto another lap's distance grid. Sessions measure the track a little differently
 *  (Hungaroring 4,324 or 4,350 m): without this, metre i of two laps is up to ~25 m apart late in
 *  the lap, and the gap, the charts and the corner table compare different places. */
function alignTo(l: Loaded, a: Loaded): Loaded {
  if (!l.t || !a.t) return l;
  const n = a.t.dist.length, k = l.t.dist.length / n;
  if (Math.abs(k - 1) < 1e-4) return l;
  const channels: Record<string, Float64Array> = {};
  for (const [name, c] of Object.entries(l.t.channels)) {
    const out = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const p = Math.min(j * k, c.length - 1), i = Math.max(0, Math.min(Math.floor(p), c.length - 2)), f = p - i;
      out[j] = DISCRETE.has(name) ? c[f < 0.5 ? i : i + 1] : c[i] + (c[i + 1] - c[i]) * f;
    }
    channels[name] = out;
  }
  const m = (v: number | null) => (v == null ? null : v / k);
  return {
    ...l, t: { dist: a.t.dist, channels },
    corners: l.corners.map((c) => ({
      ...c, start_m: c.start_m / k, apex_m: c.apex_m / k, end_m: c.end_m / k, zero_m: m(c.zero_m), lift_point_m: m(c.lift_point_m),
      braking_point_m: m(c.braking_point_m), lap_apex_m: m(c.lap_apex_m), throttle_pickup_m: m(c.throttle_pickup_m),
      full_throttle_m: m(c.full_throttle_m),
    })),
  };
}

export default function LapView({ lapId, vsId, candidates, otherHref, corner, by: byParam = null, startReplay = false }: {
  lapId: string; vsId: string | null; candidates: Candidate[]; otherHref: string; corner?: [number, number] | null;
  by?: ZoneMode | null; startReplay?: boolean;
}) {
  const router = useRouter();
  const [loaded, setLaps] = useState<Loaded[] | null>(null);
  const laps = useMemo(() => (loaded ? loaded.map((l, i) => (i ? alignTo(l, loaded[0]) : l)) : null), [loaded]);
  const [error, setError] = useState<string | null>(null);
  // Corners or sections: from the link (?by=, or a section opened from the coach), else the viewer's
  // last choice (read on the client only: nothing depends on it before the laps are loaded)
  const [by, setBy] = useState<ZoneMode>(() => {
    if (byParam) return byParam;
    if (corner && corner[0] !== corner[1]) return "sections";
    try { return zoneMode(typeof window === "undefined" ? null : localStorage.getItem(ZONES_KEY)) ?? "corners"; } catch { return "corners"; }
  });
  const pickBy = useCallback((v: ZoneMode) => {
    setBy(v);
    try { localStorage.setItem(ZONES_KEY, v); } catch { /* private window: not remembered */ }
  }, []);
  // Sections from both laps (linked on either), then the zones in the chosen mode
  const sections = useMemo(() => !laps ? [] : sectionsOf(laps[0].corners.map((c) => c.number), laps.flatMap((l) => l.t?.channels.time_s ? [{
    time: l.t.channels.time_s,
    corners: l.corners.map((c) => ({ corner_number: c.number, lift_point_m: c.lift_point_m, full_throttle_m: c.full_throttle_m, apex_m: c.lap_apex_m, time_s: c.time_s })),
  }] : [])), [laps]);
  // Virtual distance boards before the corners the team brakes for (on this lap's line)
  const boards = useMemo(() => {
    const a = laps?.[0], x = a?.t?.channels.pos_x_m, z = a?.t?.channels.pos_z_m;
    return a && x && z ? a.corners.flatMap((c) => boardsOf(c, x, z)) : [];
  }, [laps]);
  const zones = useMemo<Zone[]>(() => {
    const cs = laps?.[0].corners ?? [];
    return (by === "sections" ? sections : cs.map((c) => [c.number])).flatMap((g) => {
      const part = cs.filter((c) => g.includes(c.number));
      if (!part.length) return [];
      const names = part.map((c) => c.name).filter(Boolean);
      return [{ key: g.join("-"), numbers: g, label: g.length > 1 ? `Turns ${g[0]}–${g[g.length - 1]}` : `Turn ${g[0]}`,
                name: names.length ? names.join(" / ") : null, start_m: part[0].start_m, end_m: part[part.length - 1].end_m,
                from_m: viewStart(laps!, part[0].number) }];
    });
  }, [laps, by, sections]);
  // The replay's checkpoints start at each zone's view start (LEAD_S before its braking zone)
  const checkpoints = useMemo(() => zones.map((z) => ({ ...z, start_m: z.from_m })), [zones]);
  const [range, setRange] = useState<Range>(null);
  const moveDots = useRef<(i: number | null) => void>(() => {});
  const zoom = useRef<(r: Range) => void>(() => {});
  const cursor = useRef<(d: number | null) => void>(() => {});
  const [replay, setReplay] = useState(startReplay);   // opened from the Telemetry page: replay shown at once
  const followCar = useCallback((d: number | null) => cursor.current(d), []);
  const closeReplay = useCallback(() => setReplay(false), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([lapId, ...(vsId ? [vsId] : [])].map(loadLap))
      .then((l) => {
        if (!cancelled) setLaps(l);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [lapId, vsId]);

  // Opened from the coaching summary: zoom on that corner or section (with the braking zone before it)
  const [zoomFirst, zoomLast] = corner ?? [null, null];
  useEffect(() => {
    const first = laps?.[0].corners.find((x) => x.number === zoomFirst);
    const last = laps?.[0].corners.find((x) => x.number === zoomLast);
    if (!first || !last) return;
    const timer = setTimeout(() => zoom.current([viewStart(laps!, first.number), last.end_m + 30]), 100);   // after the charts' first draw
    return () => clearTimeout(timer);
  }, [laps, zoomFirst, zoomLast]);

  if (error) return <p className="mt-6 text-red-400">{error}</p>;
  if (!laps) return <p className="mt-6 text-zinc-500">Loading lap…</p>;
  const [a, b] = laps;
  const positions = laps.every((l) => l.t?.channels.pos_x_m && l.t.channels.pos_z_m);

  return (
    <div>
      <div className="rise grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        {laps.map((l, i) => (
          <div key={l.id} className="card p-4" style={{ boxShadow: `inset 3px 0 0 0 ${COLORS[i]}` }}>
            <div className="text-xs uppercase tracking-wider text-zinc-500">{i === 0 ? "This lap" : "Reference"}</div>
            <h1 className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold" style={{ color: COLORS[i] }}>
              {l.driver} · L{l.number} <span className="tabular text-2xl">{lapTime(l.time_ms)}</span>
            </h1>
            <div className="mt-0.5 text-xs text-zinc-500">
              {prettyKey(l.car)} · {l.date}
              {!l.comparable && ` · ${l.excluded_reasons.map((r) => REASONS[r] ?? r).join(", ")}`}
            </div>
            {l.conditions && <div className="mt-1.5 text-xs [&_span]:text-xs"><Conditions c={l.conditions} /></div>}
          </div>
        ))}
        <div className={`card flex flex-col justify-center gap-2 p-4 ${b ? "" : "md:col-span-2"}`}>
          {b && (
            <div className="tabular text-sm text-zinc-400">
              Gap <span className={`text-xl font-bold ${a.time_ms <= b.time_ms ? "text-emerald-400" : "text-red-400"}`}>
                {a.time_ms > b.time_ms ? "+" : ""}{((a.time_ms - b.time_ms) / 1000).toFixed(3)} s
              </span>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <GitCompareArrows size={14} className="text-race" />
            <select
              value={vsId ?? ""}
              onChange={(e) => router.push(e.target.value === "other" ? otherHref : e.target.value ? `/laps/${lapId}?vs=${e.target.value}` : `/laps/${lapId}`)}
              className="input min-w-0 flex-1 py-1"
            >
              <option value="">Compare with…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
              {vsId && b && !candidates.some((c) => c.id === vsId) && (
                <option value={vsId}>{b.driver} · L{b.number} · {lapTime(b.time_ms)}</option>
              )}
              <option value="other">Choose another lap…</option>
            </select>
          </label>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Drag on a chart to zoom, double-click to reset; the Turn buttons zoom every chart on that corner, or on a whole section
        (corners driven as one) with Sections.
      </p>

      {a.t && replay && (
        <Replay laps={laps.flatMap((l, i) => (l.t ? [{ driver: `${l.driver} L${l.number}`, color: COLORS[i], t: l.t, car: l.car }] : []))}
                edges={a.edges} corners={a.corners} boards={boards} checkpoints={checkpoints} by={by} onBy={pickBy} onDistance={followCar} onClose={closeReplay}
                onTurn={(z) => zoom.current([z.start_m, z.end_m + 30])} />
      )}
      {a.t && <CornerChips zones={zones} by={by} onBy={pickBy} range={range} onSelect={(r) => zoom.current(r)} />}
      {!a.t ? (
        <p className="card mt-6 p-6 text-zinc-400">This lap has no trace (incomplete lap).</p>
      ) : (
        // With the replay open, the charts take the whole width under it (the small map would repeat it)
        <div className={`mt-4 grid gap-4 ${replay ? "" : "lg:grid-cols-[minmax(0,1fr)_380px]"}`}>
          <div className="card min-w-0 px-3 pb-3 pt-1">
            <Charts laps={laps} boards={boards} onCursor={(i) => moveDots.current(i)} onRange={setRange} zoomRef={zoom} cursorRef={cursor} />
          </div>
          <div className={`lg:sticky lg:top-20 lg:self-start ${replay ? "hidden" : ""}`}>
            <TrackMap laps={laps} boards={boards} range={range} moveRef={moveDots} />
            <div className="mt-2 flex items-center gap-4">
              {positions && !replay && (
                <button onClick={() => setReplay(true)} className="btn btn-primary">
                  <Play size={15} fill="currentColor" /> {b ? "Replay both laps" : "Replay this lap"}
                </button>
              )}
              {range && (
                <button onClick={() => zoom.current(null)} className="btn btn-ghost">
                  <Maximize2 size={14} /> Full lap
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <CornerTable laps={laps} zones={zones} by={by} onSelect={(r) => zoom.current(r)} />
    </div>
  );
}

// --- Turn buttons: zoom every chart on a corner or a section (stay under the top bar while scrolling)

function CornerChips({ zones, by, onBy, range, onSelect }: {
  zones: Zone[]; by: ZoneMode; onBy: (v: ZoneMode) => void; range: Range; onSelect: (r: Range) => void;
}) {
  if (!zones.length) return null;
  const same = (r: [number, number]) => range != null && Math.abs(range[0] - r[0]) < 1 && Math.abs(range[1] - r[1]) < 1;
  const chip = "shrink-0 rounded-md border px-2.5 py-1 text-left text-xs transition";
  const look = (on: boolean) => (on ? "border-race bg-race/25 text-white" : "border-white/10 bg-raised/60 text-zinc-300 hover:border-accent/60 hover:text-white");
  return (
    <div className="sticky top-[56px] z-20 mt-4 flex items-center gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-ink/85 px-2 py-1.5 backdrop-blur">
      <Segmented options={ZONE_OPTIONS} value={by} onChange={onBy} className="mr-1" />
      <button onClick={() => onSelect(null)} className={`${chip} ${look(!range)} font-semibold`}>Full lap</button>
      {zones.map((z) => (
        <button key={z.key} onClick={() => onSelect(cornerRange(z))} title={z.name ?? undefined}
                className={`${chip} ${look(same(cornerRange(z)))} font-semibold`}>
          {z.label}
        </button>
      ))}
    </div>
  );
}

// --- Charts: one uPlot per channel, shared cursor and zoom -------------------------------------

type Panel = {
  title: string;
  height: number;
  series: { data: ArrayLike<number | null>; color: string; readout?: boolean; label?: string; dash?: number[]; area?: boolean }[];
  range?: uPlot.Scale["range"];
  stepped?: boolean;
  format?: (v: number) => string;   // value shown in the title while hovering
};

const BOARDS_ON_CHARTS_M = 1500;   // the boards' lines show on the charts when zoomed in to this much track

function Charts({ laps, boards, onCursor, onRange, zoomRef, cursorRef }: {
  laps: Loaded[];
  boards: Board[];
  onCursor: (i: number | null) => void;
  onRange: (r: Range) => void;
  zoomRef: React.RefObject<(r: Range) => void>;
  cursorRef: React.RefObject<(d: number | null) => void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCursor, onRange });
  useEffect(() => {
    callbacks.current = { onCursor, onRange };
  });

  useEffect(() => {
    const el = box.current!;
    const traces = laps.map((l) => l.t).filter((t): t is Trace => t !== null);
    const n = Math.min(...traces.map((t) => t.dist.length));
    const x = traces[0].dist.subarray(0, n);
    const ch = (t: Trace, name: string, f = 1) => {
      const c = t.channels[name];
      if (!c) return null;
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = c[i] * f;
      return out;
    };
    // Reference lap drawn first, so this lap stays on top
    const both = (name: string, f = 1) =>
      traces.map((t, i) => ({ data: ch(t, name, f), color: COLORS[i], readout: true, area: true })).filter((s) => s.data).reverse() as Panel["series"];
    const gears = traces.map((t, i) => {
      const g = ch(t, "gear");
      return g ? { data: smoothGear(g), color: COLORS[i], readout: true, area: true } : null;
    }).filter((s) => s !== null).reverse();
    const steerDeg = traces.every((t) => t.channels.steering_deg);
    // ABS / TC intervention (recorded from app 0.1.1 / 0.1.3): the brake / throttle trace drawn again
    // where they work (≥ 5 % of the time around that metre: one ACC pulse is enough)
    const ASSIST_ON = 5;
    const overlay = (assist: string, input: string, colors: string[]) => traces.flatMap((t, i) => {
      const a = t.channels[assist], v = t.channels[input];
      if (!a || !v) return [];
      const data: (number | null)[] = new Array(n).fill(null);
      for (let j = 0; j < n; j++) if (a[j] >= ASSIST_ON || (j > 0 && a[j - 1] >= ASSIST_ON)) data[j] = v[j];
      return [{ data, color: colors[i] }];
    }).reverse();
    const absOverlay = overlay("abs_pct", "brake_clean_pct", ["#3b82f6", "#93c5fd"]);
    const tcOverlay = overlay("tc_pct", "throttle_clean_pct", ["#fb923c", "#fdba74"]);
    const lapName = (i: number) => `${laps[i].driver} L${laps[i].number}`;
    const missing = (ch: string) => traces.map((t, i) => (t.channels[ch] ? null : lapName(i))).filter(Boolean).join(", ");
    const noAbs = missing("abs_pct"), noTc = missing("tc_pct"), noLevels = missing("tc_level");
    // Electronics settings (app 0.1.3): this lap solid, the reference dashed
    const ELEC = [["tc_level", "TC", "#fb923c"], ["tc2_level", "TC2", "#c084fc"], ["abs_level", "ABS", "#38bdf8"]] as const;
    const electronics = traces.flatMap((t, i) => ELEC.flatMap(([key, label, color]) => {
      const d = ch(t, key);
      return d ? [{ data: d, color, readout: true, label: i === 0 ? label : `ref ${label}`, dash: i === 1 ? [4, 3] : undefined }] : [];
    })).reverse();

    const panels: Panel[] = [];
    if (traces.length === 2) {
      const ta = traces[0].channels.time_s, tb = traces[1].channels.time_s;
      const delta = new Float64Array(n);
      for (let i = 0; i < n; i++) delta[i] = ta[i] - tb[i];
      panels.push({ title: `Time gap (s): above 0 = ${laps[0].driver} behind`, height: 130,
                    series: [{ data: new Float64Array(n), color: "#ffffff30" }, { data: delta, color: "#ffffff", readout: true }],
                    range: (_u, min, max) => [Math.min(min, -0.05), Math.max(max, 0.05)],
                    format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(3)} s` });
    }
    panels.push(
      { title: "Speed (km/h)", height: 230, series: both("speed_ms", 3.6), format: (v) => `${Math.round(v)} km/h` },
      { title: `Throttle (%)${tcOverlay.length ? " · orange: TC working" : ""}${noTc && tcOverlay.length ? ` · TC not recorded for ${noTc}` : ""}`, height: 110,
        series: [...both("throttle_clean_pct"), ...tcOverlay], range: [0, 105], format: (v) => `${Math.round(v)} %` },
      { title: `Brake (%) · blue: ABS working${noAbs ? ` · ABS not recorded for ${noAbs} (app older than 0.1.1)` : ""}`, height: 110,
        series: [...both("brake_clean_pct"), ...absOverlay], range: [0, 105], format: (v) => `${Math.round(v)} %` },
      { title: steerDeg ? "Steering (°)" : "Steering (% of lock)", height: 120,
        series: steerDeg ? both("steering_deg") : both("steering_norm", 100), format: (v) => `${Math.round(v)}${steerDeg ? "°" : " %"}` },
      { title: "Gear", height: 90, series: gears, stepped: true, range: [0, 7],
        format: (v) => (v < 0 ? "R" : v === 0 ? "N" : String(Math.round(v))) },
    );
    if (electronics.length)
      panels.push({ title: `Electronics: TC · TC2 · ABS settings${traces.length > 1 ? " (reference dashed)" : ""}${noLevels ? ` · not recorded for ${noLevels} (app older than 0.1.3)` : ""}`,
                    height: 110, series: electronics, stepped: true, range: [0, 12], format: (v) => String(Math.round(v)) });

    el.innerHTML = "";
    const plots: uPlot[] = [];
    let syncing = false;
    const width = el.clientWidth;
    panels.forEach((p, k) => {
      const wrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "mt-2 text-xs text-zinc-500";
      title.textContent = p.title; // plain text: titles contain driver names
      // Values under the cursor, in each lap's colour (this lap first)
      const values = p.series.map((s, j) => ({ s, j: j + 1 })).filter(({ s }) => s.readout).reverse().map(({ s, j }) => {
        const span = document.createElement("span");
        span.className = "ml-3 font-medium tabular";
        span.style.color = s.color;
        title.appendChild(span);
        return { span, j, label: s.label };
      });
      wrap.appendChild(title);
      el.appendChild(wrap);
      const last = k === panels.length - 1;
      const opts: uPlot.Options = {
        width,
        height: p.height,
        legend: { show: false },
        cursor: { sync: { key: "lap" }, drag: { x: true, y: false }, y: false, points: { size: 5 } },
        scales: { x: { time: false }, y: p.range ? { range: p.range } : {} },
        axes: [
          { stroke: "#71717a", grid: { stroke: "#ffffff0d" }, ticks: { stroke: "#ffffff1a" },
            size: last ? 30 : 4, values: last ? (_u, v) => v.map((m) => `${m} m`) : () => [] },
          { stroke: "#71717a", grid: { stroke: "#ffffff0d" }, ticks: { stroke: "#ffffff1a" }, size: 46 },
        ],
        series: [{}, ...p.series.map((s) => ({
          // The laps' traces with a light fill under them (user's request, like Racemake)
          stroke: s.color, width: 1.25, ...(s.dash ? { dash: s.dash } : {}), ...(s.area ? { fill: `${s.color}10` } : {}),
          ...(p.stepped ? { paths: uPlot.paths.stepped!({ align: 1 }) } : {}),
        }))],
        hooks: {
          // Virtual boards: a dashed line at each one when zoomed in, its distance on the top chart
          draw: [(u) => {
            const { min, max } = u.scales.x;
            if (min == null || max == null || max - min > BOARDS_ON_CHARTS_M) return;
            const ctx = u.ctx, r = devicePixelRatio || 1;
            ctx.save();
            ctx.strokeStyle = "#ffffff38";
            ctx.setLineDash([4 * r, 4 * r]);
            ctx.fillStyle = "#e4e4e7";
            ctx.font = `600 ${10 * r}px sans-serif`;
            ctx.textAlign = "center";
            for (const b of boards) {
              if (b.d < min || b.d > max) continue;
              const px = u.valToPos(b.d, "x", true);
              ctx.beginPath();
              ctx.moveTo(px, u.bbox.top);
              ctx.lineTo(px, u.bbox.top + u.bbox.height);
              ctx.stroke();
              if (k === 0) ctx.fillText(b.label, px, u.bbox.top + 11 * r);
            }
            ctx.restore();
          }],
          setCursor: [(u) => {
            const i = u.cursor.idx;
            for (const { span, j, label } of values) {
              const v = i == null ? null : (u.data[j][i] as number | null);
              span.textContent = v == null || !p.format ? "" : `${label ? `${label} ` : ""}${p.format(v)}`;
            }
            if (k === 0) callbacks.current.onCursor(i ?? null);
          }],
          setScale: [(u, key) => {
            if (key !== "x" || syncing) return;
            syncing = true;
            const { min, max } = u.scales.x;
            plots.forEach((o) => o !== u && o.setScale("x", { min: min!, max: max! }));
            syncing = false;
            const full = min! <= x[0] && max! >= x[n - 1];
            callbacks.current.onRange(full ? null : [min!, max!]);
          }],
        },
      };
      plots.push(new uPlot(opts, [x, ...p.series.map((s) => s.data)] as uPlot.AlignedData, wrap));
    });
    zoomRef.current = (r) => plots[0]?.setScale("x", r ? { min: r[0], max: r[1] } : { min: x[0], max: x[n - 1] });
    // The replay moves the cursor (shared by every chart) to a distance
    cursorRef.current = (d) => plots.forEach((u) =>
      u.setCursor(d == null ? { left: -10, top: -10 } : { left: u.valToPos(d, "x"), top: 5 }));

    const resize = new ResizeObserver(() => plots.forEach((p) => p.setSize({ width: el.clientWidth, height: p.height })));
    resize.observe(el);
    return () => {
      resize.disconnect();
      plots.forEach((p) => p.destroy());
    };
  }, [laps, boards, zoomRef, cursorRef]);

  return <div ref={box} className="min-w-0" />;
}

// --- Track map: racing lines, corner labels, cursor position --------------------------------------

function TrackMap({ laps, boards, range, moveRef }: {
  laps: Loaded[]; boards: Board[]; range: Range; moveRef: React.RefObject<(i: number | null) => void>;
}) {
  const lines = useMemo(
    () => laps.map((l) => (l.t?.channels.pos_x_m && l.t.channels.pos_z_m ? { x: l.t.channels.pos_x_m, z: l.t.channels.pos_z_m } : null)),
    [laps],
  );
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const a = lines[0];
  const n = a ? a.x.length : 0;

  const view = useMemo(() => {
    if (!a) return null;
    const lo = range ? Math.max(0, Math.floor(range[0])) : 0;
    const hi = range ? Math.min(n - 1, Math.ceil(range[1])) : n - 1;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const l of lines) {
      if (!l) continue;
      for (let i = lo; i <= Math.min(hi, l.x.length - 1); i++) {
        x0 = Math.min(x0, l.x[i]); x1 = Math.max(x1, l.x[i]);
        z0 = Math.min(z0, l.z[i]); z1 = Math.max(z1, l.z[i]);
      }
    }
    const pad = Math.max(x1 - x0, z1 - z0) * 0.08 + 3;
    return { x: x0 - pad, z: z0 - pad, w: x1 - x0 + 2 * pad, h: z1 - z0 + 2 * pad };
  }, [a, lines, range, n]);

  const paths = useMemo(
    () => lines.map((l) => {
      if (!l) return "";
      const p: string[] = [];
      for (let i = 0; i < l.x.length; i += 2) p.push(`${l.x[i].toFixed(1)},${l.z[i].toFixed(1)}`);
      return p.join(" ");
    }),
    [lines],
  );

  useEffect(() => {
    moveRef.current = (i) => {
      lines.forEach((l, k) => {
        const dot = dots.current[k];
        if (!dot || !l) return;
        if (i == null || i >= l.x.length) return dot.setAttribute("visibility", "hidden");
        dot.setAttribute("cx", String(l.x[i]));
        dot.setAttribute("cy", String(l.z[i]));
        dot.setAttribute("visibility", "visible");
      });
    };
  }, [lines, moveRef]);

  if (!a || !view)
    return <p className="text-sm text-zinc-500">No car position in this lap (MoTeC import): racing lines need the recorder.</p>;
  const size = Math.max(view.w, view.h);
  // ACC: x and z horizontal; seen from above z points down, like SVG's y axis
  return (
    <svg viewBox={`${view.x} ${view.z} ${view.w} ${view.h}`} className="card h-auto max-h-[70vh] w-full">
      <TrackSurface edges={laps[0].edges} />
      {paths.map((p, k) => ({ p, k })).reverse().map(({ p, k }) => p && (
        <polyline key={k} points={p} fill="none" stroke={COLORS[k]} strokeWidth={range ? 2 : 1.5}
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity={0.9} />
      ))}
      {laps[0].corners.map((c) => {
        const i = Math.min(n - 1, Math.round(c.apex_m));
        const p = labelPoint(a.x, a.z, i, size / 30, 15);
        return (
          <text key={c.number} x={p.x} y={p.z} fontSize={size / 32} fill="#a1a1aa" textAnchor="middle" dominantBaseline="central">
            T{c.number}
          </text>
        );
      })}
      <rect x={a.x[0] - size / 120} y={a.z[0] - size / 120} width={size / 60} height={size / 60} fill="#e5e7eb" />
      {/* Distance boards when zoomed on a corner (the whole lap would be crowded with them) */}
      {range && range[1] - range[0] <= BOARDS_ON_CHARTS_M && <Boards boards={boards} size={size / 34} from={range[0]} to={range[1]} />}
      {lines.map((l, k) => l && (
        <circle key={k} ref={(el) => { dots.current[k] = el; }} r={size / 90} fill={COLORS[k]} stroke="#000" strokeWidth={size / 400} visibility="hidden" />
      ))}
    </svg>
  );
}

// --- Corner table ---------------------------------------------------------------------------------

const num = (v: number | null | undefined, digits = 0, unit = "") => (v == null ? "–" : `${v.toFixed(digits)}${unit}`);
const diff = (x: number | null | undefined, y: number | null | undefined, digits = 0, unit = "") =>
  x == null || y == null ? "–" : `${x - y > 0 ? "+" : ""}${(x - y).toFixed(digits)}${unit}`;

/** A braking point as drivers count it: metres before the corner's reference point (the team's
 *  turn-in, where the boards count down to); metres from the line when the corner has none yet. */
const brakeAt = (c: CornerRow, v: number | null | undefined) =>
  v == null ? "–" : c.zero_m == null ? `at ${Math.round(v)} m` : c.zero_m - v >= -0.5 ? `${Math.round(c.zero_m - v)} m` : `${Math.round(v - c.zero_m)} m after`;
/** A throttle point from the corner's apex: + after it, − before it. */
const fromApex = (c: CornerRow, v: number | null | undefined) => {
  if (v == null) return "–";
  const m = Math.round(v - c.apex_m);
  return `${m > 0 ? "+" : m < 0 ? "−" : ""}${Math.abs(m)} m`;
};
const gapClass = (gap: number | null) => (gap == null ? "" : gap > 0.02 ? "text-red-400" : gap < -0.02 ? "text-emerald-400" : "text-zinc-400");
const gapText = (gap: number | null, digits = 3) => (gap == null ? "–" : `${gap > 0 ? "+" : ""}${gap.toFixed(digits)}`);

function CornerTable({ laps, zones, by, onSelect }: { laps: Loaded[]; zones: Zone[]; by: ZoneMode; onSelect: (r: Range) => void }) {
  const [a, b] = laps;
  if (!a.corners.length) return null;
  const bc = new Map((b?.corners ?? []).map((c) => [c.number, c]));
  const compare = Boolean(b && b.corners.some((c) => c.time_s != null));
  if (by === "sections") return <SectionTable a={a} bc={bc} compare={compare} zones={zones} onSelect={onSelect} />;
  return (
    <div className="card rise mt-5 overflow-hidden">
      <div className="px-5 pt-4">
      <h2 className="display text-sm uppercase tracking-wider text-white">Corners</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {compare ? "Time and speed: this lap minus the reference. " : ""}
        Braking: metres before each corner&apos;s turn-in point (the team&apos;s, where the boards count down to). Throttle: metres
        from the apex, + after it. Click a row to zoom on the corner.
      </p>
      </div>
      <div className="overflow-x-auto">
      <table className="data-table mt-2">
        <thead>
          <tr>
            <th>Corner</th>
            {compare ? (
              <>
                <th className="text-right">Time</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Min speed</th>
                <th className="text-right">Braking (before)</th>
                <th className="text-right">Throttle (apex)</th>
                <th className="text-right">Full throttle (apex)</th>
              </>
            ) : (
              <>
                <th className="text-right">Time</th>
                <th className="text-right">Entry speed</th>
                <th className="text-right">Braking (before)</th>
                <th className="text-right">Min speed</th>
                <th className="text-right">Throttle (apex)</th>
                <th className="text-right">Full throttle (apex)</th>
                <th className="text-right">Coasting</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {a.corners.map((c) => {
            const r = bc.get(c.number);
            const gap = c.time_s != null && r?.time_s != null ? c.time_s - r.time_s : null;
            return (
              <tr key={c.number} onClick={() => onSelect([c.start_m, c.end_m])}
                  className="cursor-pointer">
                <td className="text-white">T{c.number}{c.name && <span className="ml-2 text-zinc-400">{c.name}</span>}</td>
                {compare ? (
                  <>
                    <td className="text-right">{num(c.time_s, 2, " s")}</td>
                    <td className={`text-right ${gapClass(gap)}`}>{gapText(gap)}</td>
                    <td className="text-right">
                      {num(c.min_speed_kmh)} <span className="text-zinc-500">({diff(c.min_speed_kmh, r?.min_speed_kmh)})</span>
                    </td>
                    <td className="whitespace-nowrap text-right">{brakeAt(c, c.braking_point_m)} <span className="text-zinc-500">(ref {brakeAt(c, r?.braking_point_m)})</span></td>
                    <td className="whitespace-nowrap text-right">{fromApex(c, c.throttle_pickup_m)} <span className="text-zinc-500">(ref {fromApex(c, r?.throttle_pickup_m)})</span></td>
                    <td className="whitespace-nowrap text-right">{fromApex(c, c.full_throttle_m)} <span className="text-zinc-500">(ref {fromApex(c, r?.full_throttle_m)})</span></td>
                  </>
                ) : (
                  <>
                    <td className="text-right">{num(c.time_s, 2, " s")}</td>
                    <td className="text-right">{num(c.entry_speed_kmh, 0, " km/h")}</td>
                    <td className="text-right">{brakeAt(c, c.braking_point_m)}</td>
                    <td className="text-right">{num(c.min_speed_kmh, 0, " km/h")}</td>
                    <td className="text-right">{fromApex(c, c.throttle_pickup_m)}</td>
                    <td className="text-right">{fromApex(c, c.full_throttle_m)}</td>
                    <td className="text-right">{num(c.coasting_s, 2, " s")}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** The table by section: time through each section (its corners' times added up), the gap, and
 *  how the gap splits between its corners (time traded between corners shows green and red). */
function SectionTable({ a, bc, compare, zones, onSelect }: {
  a: Loaded; bc: Map<number, CornerRow>; compare: boolean; zones: Zone[]; onSelect: (r: Range) => void;
}) {
  const own = new Map(a.corners.map((c) => [c.number, c]));
  const total = (m: Map<number, CornerRow>, ns: number[]) => {
    const ts = ns.map((n) => m.get(n)?.time_s);
    return ts.every((x): x is number => x != null) ? ts.reduce((s, x) => s + x, 0) : null;
  };
  return (
    <div className="card rise mt-5 overflow-hidden">
      <div className="px-5 pt-4">
        <h2 className="display text-sm uppercase tracking-wider text-white">Sections</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Corners driven as one are grouped: giving up time in one to be faster through the next shows in the split.
          {compare ? " Differences are this lap minus the reference." : ""} Click a row to zoom on the section.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>Section</th>
              <th className="text-right">Time</th>
              {compare && <th className="text-right">Gap</th>}
              <th>{compare ? "Gap per corner" : "Per corner"}</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const mine = total(own, z.numbers), theirs = compare ? total(bc, z.numbers) : null;
              const gap = mine != null && theirs != null ? mine - theirs : null;
              return (
                <tr key={z.key} onClick={() => onSelect([z.start_m, z.end_m])} className="cursor-pointer">
                  <td className="whitespace-nowrap text-white">
                    {z.numbers.length > 1 ? `T${z.numbers[0]}–T${z.numbers[z.numbers.length - 1]}` : `T${z.numbers[0]}`}
                    {z.name && <span className="ml-2 text-zinc-400">{z.name}</span>}
                  </td>
                  <td className="text-right">{num(mine, 2, " s")}</td>
                  {compare && <td className={`text-right font-semibold ${gapClass(gap)}`}>{gapText(gap)}</td>}
                  <td className="tabular whitespace-nowrap text-xs text-zinc-500">
                    {z.numbers.map((n, i) => {
                      const c = own.get(n), r = bc.get(n);
                      const g = compare && c?.time_s != null && r?.time_s != null ? c.time_s - r.time_s : null;
                      return (
                        <span key={n}>
                          {i > 0 && " · "}T{n}{" "}
                          {compare ? <span className={gapClass(g)}>{gapText(g, 2)}</span> : num(c?.time_s, 2, " s")}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
