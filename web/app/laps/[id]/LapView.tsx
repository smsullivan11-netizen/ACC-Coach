"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import TrackSurface, { type Edges } from "@/components/TrackSurface";
import { lapTime, prettyKey, REASONS } from "@/lib/format";
import { labelPoint } from "@/lib/geometry";
import { decodeTrace, type EncodedTrace, type Trace } from "@/lib/trace";
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
  braking_point_m: number | null;
  min_speed_kmh: number | null;
  throttle_pickup_m: number | null;
  full_throttle_m: number | null;
  coasting_s: number | null;
  exit_speed_kmh: number | null;
};
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
};
type Loaded = LapData & { t: Trace | null };
type Range = [number, number] | null;

const COLORS = ["#ffd200", "#d4d4d8"]; // this lap: team yellow; reference: light grey

async function loadLap(id: string): Promise<Loaded> {
  const res = await fetch(`/api/laps/${id}`);
  if (!res.ok) throw new Error(`lap ${id}: error ${res.status}`);
  const data = (await res.json()) as LapData;
  return { ...data, t: data.trace ? decodeTrace(data.trace) : null };
}

export default function LapView({ lapId, vsId, candidates, corner }: {
  lapId: string; vsId: string | null; candidates: Candidate[]; corner?: number | null;
}) {
  const router = useRouter();
  const [laps, setLaps] = useState<Loaded[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(null);
  const moveDots = useRef<(i: number | null) => void>(() => {});
  const zoom = useRef<(r: Range) => void>(() => {});
  const cursor = useRef<(d: number | null) => void>(() => {});
  const [replay, setReplay] = useState(false);
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

  // Opened from the coaching summary: zoom on that corner (with the braking zone before it)
  useEffect(() => {
    const c = corner != null ? laps?.[0].corners.find((x) => x.number === corner) : null;
    if (!c) return;
    const timer = setTimeout(() => zoom.current([Math.max(0, c.start_m - 50), c.end_m + 30]), 100);   // after the charts' first draw
    return () => clearTimeout(timer);
  }, [laps, corner]);

  if (error) return <p className="mt-6 text-red-400">{error}</p>;
  if (!laps) return <p className="mt-6 text-zinc-500">Loading lap…</p>;
  const [a, b] = laps;
  const positions = laps.every((l) => l.t?.channels.pos_x_m && l.t.channels.pos_z_m);

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {laps.map((l, i) => (
          <h1 key={l.id} className="text-lg font-semibold" style={{ color: COLORS[i] }}>
            {l.driver} · L{l.number} · <span className="tabular">{lapTime(l.time_ms)}</span>
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {prettyKey(l.car)} · {l.date}
              {!l.comparable && ` · ${l.excluded_reasons.map((r) => REASONS[r] ?? r).join(", ")}`}
            </span>
          </h1>
        ))}
        <select
          value={vsId ?? ""}
          onChange={(e) => router.push(e.target.value ? `/laps/${lapId}?vs=${e.target.value}` : `/laps/${lapId}`)}
          className="ml-auto rounded border border-white/15 bg-zinc-900 px-2 py-1 text-sm"
        >
          <option value="">Compare with…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      {b && (
        <p className="tabular mt-1 text-sm text-zinc-400">
          Gap: {a.time_ms > b.time_ms ? "+" : ""}{((a.time_ms - b.time_ms) / 1000).toFixed(3)} s for{" "}
          <span style={{ color: COLORS[0] }}>{a.driver}</span>. Drag on a chart to zoom, double-click to reset;
          click a corner below to zoom on it.
        </p>
      )}

      {a.t && replay && (
        <Replay laps={laps.flatMap((l, i) => (l.t ? [{ driver: `${l.driver} L${l.number}`, color: COLORS[i], t: l.t }] : []))}
                edges={a.edges} corners={a.corners} onDistance={followCar} onClose={closeReplay} />
      )}
      {!a.t ? (
        <p className="mt-6 text-zinc-400">This lap has no trace (incomplete lap).</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Charts laps={laps} onCursor={(i) => moveDots.current(i)} onRange={setRange} zoomRef={zoom} cursorRef={cursor} />
          <div className="lg:sticky lg:top-4 lg:self-start">
            <TrackMap laps={laps} range={range} moveRef={moveDots} />
            <div className="mt-2 flex items-center gap-4">
              {positions && !replay && (
                <button onClick={() => setReplay(true)}
                        className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-110">
                  {b ? "Replay both laps" : "Replay this lap"}
                </button>
              )}
              {range && (
                <button onClick={() => zoom.current(null)} className="text-sm text-zinc-400 underline hover:text-white">
                  Show the full lap
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <CornerTable laps={laps} onSelect={(r) => zoom.current(r)} />
    </div>
  );
}

// --- Charts: one uPlot per channel, shared cursor and zoom -------------------------------------

type Panel = {
  title: string;
  height: number;
  series: { data: Float64Array; color: string }[];
  range?: uPlot.Scale["range"];
  stepped?: boolean;
};

function Charts({ laps, onCursor, onRange, zoomRef, cursorRef }: {
  laps: Loaded[];
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
      traces.map((t, i) => ({ data: ch(t, name, f), color: COLORS[i] })).filter((s) => s.data).reverse() as Panel["series"];
    const steerDeg = traces.every((t) => t.channels.steering_deg);

    const panels: Panel[] = [];
    if (traces.length === 2) {
      const ta = traces[0].channels.time_s, tb = traces[1].channels.time_s;
      const delta = new Float64Array(n);
      for (let i = 0; i < n; i++) delta[i] = ta[i] - tb[i];
      panels.push({ title: `Time gap (s): above 0 = ${laps[0].driver} behind`, height: 130,
                    series: [{ data: new Float64Array(n), color: "#ffffff30" }, { data: delta, color: "#ffffff" }],
                    range: (_u, min, max) => [Math.min(min, -0.05), Math.max(max, 0.05)] });
    }
    panels.push(
      { title: "Speed (km/h)", height: 230, series: both("speed_ms", 3.6) },
      { title: "Throttle (%)", height: 110, series: both("throttle_clean_pct"), range: [0, 105] },
      { title: "Brake (%)", height: 110, series: both("brake_clean_pct"), range: [0, 105] },
      { title: steerDeg ? "Steering (°)" : "Steering (% of lock)", height: 120,
        series: steerDeg ? both("steering_deg") : both("steering_norm", 100) },
      { title: "Gear", height: 90, series: both("gear"), stepped: true },
    );

    el.innerHTML = "";
    const plots: uPlot[] = [];
    let syncing = false;
    const width = el.clientWidth;
    panels.forEach((p, k) => {
      const wrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "mt-2 text-xs text-zinc-500";
      title.textContent = p.title; // plain text: titles contain driver names
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
          stroke: s.color, width: 1.25,
          ...(p.stepped ? { paths: uPlot.paths.stepped!({ align: 1 }) } : {}),
        }))],
        hooks: {
          setCursor: [(u) => callbacks.current.onCursor(u.cursor.idx ?? null)],
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
  }, [laps, zoomRef, cursorRef]);

  return <div ref={box} className="min-w-0" />;
}

// --- Track map: racing lines, corner labels, cursor position --------------------------------------

function TrackMap({ laps, range, moveRef }: { laps: Loaded[]; range: Range; moveRef: React.RefObject<(i: number | null) => void> }) {
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
    <svg viewBox={`${view.x} ${view.z} ${view.w} ${view.h}`} className="h-auto max-h-[70vh] w-full rounded-lg border border-white/10 bg-panel">
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

function CornerTable({ laps, onSelect }: { laps: Loaded[]; onSelect: (r: Range) => void }) {
  const [a, b] = laps;
  if (!a.corners.length) return null;
  const bc = new Map((b?.corners ?? []).map((c) => [c.number, c]));
  const compare = Boolean(b && b.corners.some((c) => c.time_s != null));
  return (
    <div className="mt-8">
      <h2 className="font-medium text-white">Corners</h2>
      <p className="text-sm text-zinc-500">
        {compare
          ? "Differences are this lap minus the reference. Distances: + = later on track."
          : "Distances are metres from the start/finish line."}{" "}
        Click a row to zoom on the corner.
      </p>
      <table className="tabular mt-2 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="py-2 font-normal">Corner</th>
            {compare ? (
              <>
                <th className="text-right font-normal">Time</th>
                <th className="text-right font-normal">Gap</th>
                <th className="text-right font-normal">Min speed</th>
                <th className="text-right font-normal">Braking point</th>
                <th className="text-right font-normal">Throttle pickup</th>
                <th className="text-right font-normal">Full throttle</th>
              </>
            ) : (
              <>
                <th className="text-right font-normal">Time</th>
                <th className="text-right font-normal">Entry speed</th>
                <th className="text-right font-normal">Braking at</th>
                <th className="text-right font-normal">Min speed</th>
                <th className="text-right font-normal">Throttle at</th>
                <th className="text-right font-normal">Full throttle at</th>
                <th className="text-right font-normal">Coasting</th>
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
                  className="cursor-pointer border-b border-white/5 hover:bg-white/5">
                <td className="py-2 text-white">T{c.number}{c.name && <span className="ml-2 text-zinc-400">{c.name}</span>}</td>
                {compare ? (
                  <>
                    <td className="text-right">{num(c.time_s, 2, " s")}</td>
                    <td className={`text-right ${gap == null ? "" : gap > 0.02 ? "text-red-400" : gap < -0.02 ? "text-emerald-400" : "text-zinc-400"}`}>
                      {gap == null ? "–" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`}
                    </td>
                    <td className="text-right">
                      {num(c.min_speed_kmh)} <span className="text-zinc-500">({diff(c.min_speed_kmh, r?.min_speed_kmh)})</span>
                    </td>
                    <td className="text-right">{diff(c.braking_point_m, r?.braking_point_m, 0, " m")}</td>
                    <td className="text-right">{diff(c.throttle_pickup_m, r?.throttle_pickup_m, 0, " m")}</td>
                    <td className="text-right">{diff(c.full_throttle_m, r?.full_throttle_m, 0, " m")}</td>
                  </>
                ) : (
                  <>
                    <td className="text-right">{num(c.time_s, 2, " s")}</td>
                    <td className="text-right">{num(c.entry_speed_kmh, 0, " km/h")}</td>
                    <td className="text-right">{num(c.braking_point_m, 0, " m")}</td>
                    <td className="text-right">{num(c.min_speed_kmh, 0, " km/h")}</td>
                    <td className="text-right">{num(c.throttle_pickup_m, 0, " m")}</td>
                    <td className="text-right">{num(c.full_throttle_m, 0, " m")}</td>
                    <td className="text-right">{num(c.coasting_s, 2, " s")}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
