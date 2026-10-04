"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TrackSurface, { type Edges } from "@/components/TrackSurface";
import { lapTime } from "@/lib/format";
import { labelPoint } from "@/lib/geometry";
import type { Trace } from "@/lib/trace";

// Replay of one or two laps on the track map, by elapsed time (like watching both cars on track at
// once): play/pause, speed, timeline, camera following a car, live speed / gear / inputs and gap.
// ABS (sessions recorded with app 0.1.1 or later): a flashing blue light at the front of the car,
// blue braking on the lines and the brake bar.
// Drawing happens outside React on every animation frame (refs and setAttribute).

export type ReplayLap = { driver: string; color: string; t: Trace };
type Corner = { number: number; apex_m: number };
type Car = {
  driver: string; color: string; n: number; step: number; end: number;
  time: Float64Array; x: Float64Array; z: Float64Array; v: Float64Array;
  thr: Float64Array | null; brk: Float64Array | null; gear: Float64Array | null; abs: Float64Array | null;
};

const RATES = [0.25, 0.5, 1, 2, 4];
const ZOOMS = { close: 120, medium: 250, wide: 500 } as const;   // view width in metres when following
const CAR_L = 4.6, CAR_W = 2.0;                                    // GT3 footprint (m)
const ASPECT = 9 / 16;
const INPUT_COLORS = { brake: "#ef4444", abs: "#2563eb", full: "#22c55e", partial: "#facc15", coast: "#a1a1aa" };
const ABS_ON = 5;   // % of the time with ABS working, per metre

function prepare(l: ReplayLap): Car | null {
  const c = l.t.channels;
  if (!c.time_s || !c.pos_x_m || !c.pos_z_m || !c.speed_ms) return null;
  const n = Math.min(c.time_s.length, c.pos_x_m.length);
  return {
    driver: l.driver, color: l.color, n, step: l.t.dist[1] - l.t.dist[0] || 1, end: c.time_s[n - 1],
    time: c.time_s, x: c.pos_x_m, z: c.pos_z_m, v: c.speed_ms,
    thr: c.throttle_clean_pct ?? null, brk: c.brake_clean_pct ?? null, gear: c.gear ?? null, abs: c.abs_pct ?? null,
  };
}

/** Where a car is at elapsed time t: index on its grid, fraction to the next point. */
function locate(car: Car, t: number) {
  const { time, n } = car;
  if (t <= time[0]) return { i: 0, f: 0 };
  if (t >= time[n - 1]) return { i: n - 1, f: 0 };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid; else hi = mid;
  }
  return { i: lo, f: (t - time[lo]) / Math.max(1e-6, time[hi] - time[lo]) };
}

function carState(car: Car, t: number) {
  const { i, f } = locate(car, t);
  const j = Math.min(i + 1, car.n - 1);
  const a = Math.max(0, i - 2), b = Math.min(car.n - 1, i + 3);
  return {
    i, d: (i + f) * car.step,
    x: car.x[i] + (car.x[j] - car.x[i]) * f,
    z: car.z[i] + (car.z[j] - car.z[i]) * f,
    angle: (Math.atan2(car.z[b] - car.z[a], car.x[b] - car.x[a]) * 180) / Math.PI,
  };
}

/** Elapsed time when a car reached distance d (m). */
function timeAt(car: Car, d: number) {
  const p = Math.min(Math.max(d / car.step, 0), car.n - 1);
  const i = Math.min(Math.floor(p), car.n - 2);
  return car.time[i] + (car.time[i + 1] - car.time[i]) * (p - i);
}

function inputCategory(car: Car, i: number): keyof typeof INPUT_COLORS {
  if (car.brk && car.brk[i] > 5) return car.abs && car.abs[i] > ABS_ON ? "abs" : "brake";
  const thr = car.thr ? car.thr[i] : 100;
  return thr >= 98 ? "full" : thr > 5 ? "partial" : "coast";
}

/** The line as polylines: one per lap, or split by inputs (brake / full / partial throttle / coasting). */
function linePaths(car: Car, byInputs: boolean) {
  const out: { points: string; color: string }[] = [];
  let cur: { points: string[]; color: string } | null = null;
  for (let i = 0; i < car.n; i += 2) {
    const color = byInputs ? INPUT_COLORS[inputCategory(car, i)] : car.color;
    const pt = `${car.x[i].toFixed(1)},${car.z[i].toFixed(1)}`;
    if (!cur || cur.color !== color) {
      if (cur) { cur.points.push(pt); out.push({ points: cur.points.join(" "), color: cur.color }); }
      cur = { points: [pt], color };
    } else cur.points.push(pt);
  }
  if (cur) out.push({ points: cur.points.join(" "), color: cur.color });
  return out;
}

export default function Replay({ laps, edges, corners, onDistance, onClose }: {
  laps: ReplayLap[];
  edges: Edges;
  corners: Corner[];
  onDistance: (d: number | null) => void;
  onClose: () => void;
}) {
  const cars = useMemo(() => laps.map(prepare).filter((c): c is Car => c !== null), [laps]);
  const maxT = Math.max(...cars.map((c) => c.end));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [camera, setCamera] = useState<string>("0");     // index of the followed car, or "track"
  const [zoom, setZoom] = useState<keyof typeof ZOOMS>("medium");
  const [byInputs, setByInputs] = useState(false);

  const elapsed = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const dirty = useRef(true);
  const svg = useRef<SVGSVGElement>(null);
  const carEls = useRef<(SVGGElement | null)[]>([]);
  const absEls = useRef<(SVGRectElement | null)[]>([]);
  const hud = useRef<Record<string, HTMLElement | null>>({});
  const slider = useRef<HTMLInputElement>(null);
  const lastSync = useRef(0);
  useEffect(() => { playingRef.current = playing; rateRef.current = rate; }, [playing, rate]);
  useEffect(() => { dirty.current = true; }, [camera, zoom, byInputs]);

  const bbox = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of cars) for (let i = 0; i < c.n; i += 5) {
      x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]);
    }
    const pad = Math.max(x1 - x0, z1 - z0) * 0.05 + 10;
    let w = x1 - x0 + 2 * pad, h = z1 - z0 + 2 * pad;
    if (h / w > ASPECT) w = h / ASPECT; else h = w * ASPECT;   // fill the 16:9 view
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w, h };
  }, [cars]);

  const follow = camera !== "track";
  const viewW = follow ? ZOOMS[zoom] : bbox.w;
  const carScale = Math.max(1, viewW / 140);                    // cars stay visible when zoomed out
  const paths = useMemo(() => cars.map((c) => linePaths(c, byInputs)), [cars, byInputs]);
  const labels = useMemo(() => {
    const a = cars[0];
    if (!a) return [];
    return corners.map((c) => {
      const i = Math.min(a.n - 1, Math.max(0, Math.round(c.apex_m / a.step)));
      return { n: c.number, ...labelPoint(a.x, a.z, i, viewW / 22, 15) };
    });
  }, [cars, corners, viewW]);

  const draw = useCallback(() => {
    const t = elapsed.current;
    const states = cars.map((c) => carState(c, t));
    states.forEach((s, k) => {
      carEls.current[k]?.setAttribute("transform", `translate(${s.x} ${s.z}) rotate(${s.angle}) scale(${carScale})`);
      const h = hud.current, car = cars[k];
      const abs = car.abs != null && car.abs[s.i] > ABS_ON;
      // Flashes while playing (about 6 times a second), steady when paused
      const flash = !playingRef.current || Math.floor(performance.now() / 80) % 2 === 0;
      absEls.current[k]?.setAttribute("opacity", abs ? (flash ? "1" : "0.15") : "0");
      const set = (key: string, text: string) => { const el = h[`${key}${k}`]; if (el && el.textContent !== text) el.textContent = text; };
      set("speed", `${Math.round(car.v[s.i] * 3.6)} km/h`);
      set("gear", car.gear ? (car.gear[s.i] <= 0 ? (car.gear[s.i] < 0 ? "R" : "N") : `gear ${Math.round(car.gear[s.i])}`) : "");
      const thrEl = h[`thr${k}`], brkEl = h[`brk${k}`];
      if (thrEl) thrEl.style.width = `${car.thr ? car.thr[s.i] : 0}%`;
      if (brkEl) {
        brkEl.style.width = `${car.brk ? car.brk[s.i] : 0}%`;
        brkEl.style.background = abs ? INPUT_COLORS.abs : "";
      }
    });

    // Camera
    if (svg.current) {
      let cx = bbox.cx, cz = bbox.cz, w = bbox.w, h = bbox.h;
      if (follow) {
        const k = Number(camera), me = states[k] ?? states[0], other = states[1 - k];
        w = ZOOMS[zoom]; h = w * ASPECT;
        cx = me.x; cz = me.z;
        if (other && Math.hypot(other.x - me.x, other.z - me.z) < w * 0.6) { cx = (me.x + other.x) / 2; cz = (me.z + other.z) / 2; }
      }
      svg.current.setAttribute("viewBox", `${cx - w / 2} ${cz - h / 2} ${w} ${h}`);
    }

    // Clock and gap
    const h = hud.current;
    if (h.clock) h.clock.textContent = `${lapTime(Math.round(t * 1000))} / ${lapTime(Math.round(maxT * 1000))}`;
    if (slider.current && document.activeElement !== slider.current) slider.current.value = String(t);
    if (h.gap && cars.length === 2) {
      const [a, b] = states;
      const lead = a.d >= b.d ? 0 : 1, back = 1 - lead;
      const gapS = t - timeAt(cars[lead], states[back].d);
      const done = t >= cars[0].end && t >= cars[1].end;
      h.gap.textContent = done
        ? `Finished: ${cars[cars[0].end <= cars[1].end ? 0 : 1].driver} by ${Math.abs(cars[0].end - cars[1].end).toFixed(3)} s`
        : `${cars[lead].driver} ahead by ${Math.max(0, gapS).toFixed(3)} s · ${Math.round(Math.abs(a.d - b.d))} m`;
      h.gap.style.color = cars[lead].color;
    }

    // Charts follow the first car (a few times per second is enough)
    const now = performance.now();
    if (now - lastSync.current > 60) { lastSync.current = now; onDistance(states[0]?.d ?? null); }
  }, [cars, carScale, bbox, follow, camera, zoom, maxT, onDistance]);

  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        elapsed.current = Math.min(maxT, elapsed.current + dt * rateRef.current);
        dirty.current = true;
        if (elapsed.current >= maxT) { playingRef.current = false; setPlaying(false); }
      }
      if (dirty.current) { dirty.current = false; draw(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, maxT]);
  useEffect(() => () => onDistance(null), [onDistance]);

  const toggle = useCallback(() => {
    if (!playingRef.current && elapsed.current >= maxT) elapsed.current = 0;
    setPlaying((p) => !p);
  }, [maxT]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input, select, textarea, button")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle]);

  if (!cars.length) return <p className="text-sm text-zinc-500">No car positions in this lap (MoTeC import): the replay needs the recorder.</p>;
  const select = "rounded border border-white/15 bg-zinc-900 px-2 py-1 text-sm";

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { elapsed.current = 0; dirty.current = true; }} title="Back to the start"
                className="rounded border border-white/15 px-2.5 py-1 text-sm hover:bg-white/5">⏮</button>
        <button onClick={toggle} className="w-20 rounded bg-accent px-3 py-1 text-sm font-semibold text-ink hover:brightness-110">
          {playing ? "Pause" : "Play"}
        </button>
        <input ref={slider} type="range" min={0} max={maxT} step={0.01} defaultValue={0} aria-label="Timeline"
               onInput={(e) => { elapsed.current = Number(e.currentTarget.value); dirty.current = true; }}
               className="min-w-40 flex-1 accent-[#ffd200]" />
        <span ref={(el) => { hud.current.clock = el; }} className="tabular w-36 text-right text-sm text-zinc-300" />
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={select} aria-label="Speed">
          {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        <select value={camera} onChange={(e) => setCamera(e.target.value)} className={select} aria-label="Camera">
          {cars.map((c, k) => <option key={k} value={String(k)}>Follow {c.driver}</option>)}
          <option value="track">Whole track</option>
        </select>
        {follow && (
          <select value={zoom} onChange={(e) => setZoom(e.target.value as keyof typeof ZOOMS)} className={select} aria-label="Zoom">
            <option value="close">Close</option><option value="medium">Medium</option><option value="wide">Wide</option>
          </select>
        )}
        <select value={byInputs ? "inputs" : "drivers"} onChange={(e) => setByInputs(e.target.value === "inputs")} className={select} aria-label="Line colours">
          <option value="drivers">Lines: driver colours</option>
          <option value="inputs">Lines: brake / throttle</option>
        </select>
        <button onClick={onClose} className="ml-auto text-sm text-zinc-400 underline hover:text-white">Close replay</button>
      </div>

      <svg ref={svg} viewBox={`${bbox.cx - bbox.w / 2} ${bbox.cz - bbox.h / 2} ${bbox.w} ${bbox.h}`}
           className="mt-3 aspect-video w-full rounded-md bg-[#0b0b0d]">
        <TrackSurface edges={edges} />
        {paths.map((p, k) => ({ p, k })).reverse().map(({ p, k }) => p.map((seg, j) => (
          <polyline key={`${k}-${j}`} points={seg.points} fill="none" stroke={seg.color} vectorEffect="non-scaling-stroke"
                    strokeWidth={k === 0 ? 2.5 : byInputs ? 1.5 : 2} strokeOpacity={k === 0 ? 1 : 0.75} strokeLinejoin="round" />
        )))}
        {labels.map((l) => (
          <text key={l.n} x={l.x} y={l.z} fontSize={viewW / 30} fill="#a1a1aa" textAnchor="middle" dominantBaseline="central">T{l.n}</text>
        ))}
        {cars.map((c, k) => ({ c, k })).reverse().map(({ c, k }) => (
          <g key={k} ref={(el) => { carEls.current[k] = el; }}>
            <rect x={-CAR_L / 2} y={-CAR_W / 2} width={CAR_L} height={CAR_W} rx={0.6} fill={c.color} stroke="#000" strokeWidth={0.2} />
            <rect x={0.2} y={-CAR_W / 2 + 0.25} width={1.1} height={CAR_W - 0.5} rx={0.2} fill="#000" opacity={0.6} />
            <rect ref={(el) => { absEls.current[k] = el; }} x={CAR_L / 2 - 0.55} y={-CAR_W / 2 + 0.1} width={0.5} height={CAR_W - 0.2} rx={0.15}
                  fill="#1d4ed8" stroke="#93c5fd" strokeWidth={0.12} opacity={0} />
          </g>
        ))}
      </svg>

      <div className={`mt-3 grid gap-3 ${cars.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {cars.map((c, k) => (
          <div key={k} className="rounded-md border border-white/10 px-3 py-2">
            <div className="flex items-baseline gap-3 text-sm">
              <span className="font-semibold" style={{ color: c.color }}>{c.driver}</span>
              <span ref={(el) => { hud.current[`speed${k}`] = el; }} className="tabular text-white" />
              <span ref={(el) => { hud.current[`gear${k}`] = el; }} className="text-zinc-400" />
            </div>
            <div className="mt-2 grid grid-cols-[56px_1fr] items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span>Throttle</span>
              <div className="h-2 rounded bg-white/10"><div ref={(el) => { hud.current[`thr${k}`] = el; }} className="h-2 rounded bg-green-500" /></div>
              <span>Brake</span>
              <div className="h-2 rounded bg-white/10"><div ref={(el) => { hud.current[`brk${k}`] = el; }} className="h-2 rounded bg-red-500" /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {cars.length === 2 && <span ref={(el) => { hud.current.gap = el; }} className="tabular font-medium" />}
        {byInputs && (
          <span className="flex gap-3 text-xs text-zinc-400">
            {Object.entries({ Braking: INPUT_COLORS.brake, "ABS working": INPUT_COLORS.abs, "Full throttle": INPUT_COLORS.full, "Part throttle": INPUT_COLORS.partial, Coasting: INPUT_COLORS.coast })
              .filter(([label]) => label !== "ABS working" || cars.some((car) => car.abs))
              .map(([label, color]) => <span key={label} className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: color }} />{label}</span>)}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">
          Space: play / pause. Both cars are placed by elapsed time; the charts follow {cars[0].driver}.
          {cars.some((c) => c.abs) ? " Blue light at the front: ABS working." : ""}
        </span>
      </div>
    </section>
  );
}
