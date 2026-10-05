"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TrackSurface, { type Edges } from "@/components/TrackSurface";
import { lapTime } from "@/lib/format";
import { labelPoint } from "@/lib/geometry";
import { smoothGear, type Trace } from "@/lib/trace";

// Replay of one or two laps on the track map, by elapsed time (like watching both cars on track at
// once): play/pause, speed, timeline, camera following a car, live speed / gear / inputs and gap.
// ABS (sessions recorded with app 0.1.1 or later): a flashing blue light at the front of the car,
// blue braking on the lines and the brake bar.
// Drawing happens outside React on every animation frame (refs and setAttribute).

export type ReplayLap = { driver: string; color: string; t: Trace };
type Corner = { number: number; apex_m: number; start_m: number; name: string | null };
type Car = {
  driver: string; color: string; n: number; step: number; end: number;
  time: Float64Array; x: Float64Array; z: Float64Array; v: Float64Array;
  thr: Float64Array | null; brk: Float64Array | null; gear: Float64Array | null; abs: Float64Array | null;
};

const RATES = [0.25, 0.5, 1, 2, 4];
const MIN_VIEW_M = 70;   // view width at 100 % zoom: about one corner
const CAR_L = 4.6, CAR_W = 2.0;                                    // GT3 footprint (m)
const ASPECT = 9 / 16;
const INPUT_COLORS = { brake: "#ef4444", abs: "#2563eb", full: "#22c55e", coast: "#71717a" };
const ABS_ON = 5;   // % of the time with ABS working, per metre
const GRAPH_S = 4, GRAPH_N = 80;   // input graphs: the last 4 s, 80 points

/** Throttle / brake / ABS-braking paths of the last GRAPH_S seconds (viewBox 0 0 400 100). */
function inputPaths(car: Car, t: number) {
  let thr = "", brk = "", abs = "", penUp = true;
  for (let k = 0; k < GRAPH_N; k++) {
    const ts = t - GRAPH_S + (k * GRAPH_S) / (GRAPH_N - 1);
    const x = ((k * 400) / (GRAPH_N - 1)).toFixed(1);
    if (ts < 0) { penUp = true; continue; }
    const { i } = locate(car, ts);
    const y = (v: number) => (100 - Math.max(0, Math.min(100, v))).toFixed(1);
    thr += `${thr ? "L" : "M"}${x},${y(car.thr ? car.thr[i] : 0)}`;
    const b = car.brk ? car.brk[i] : 0;
    brk += `${brk ? "L" : "M"}${x},${y(b)}`;
    if (car.abs && car.abs[i] >= ABS_ON && b > 5) { abs += `${penUp ? "M" : "L"}${x},${y(b)}`; penUp = false; } else penUp = true;
  }
  return { thr, brk, abs };
}

function prepare(l: ReplayLap): Car | null {
  const c = l.t.channels;
  if (!c.time_s || !c.pos_x_m || !c.pos_z_m || !c.speed_ms) return null;
  const n = Math.min(c.time_s.length, c.pos_x_m.length);
  return {
    driver: l.driver, color: l.color, n, step: l.t.dist[1] - l.t.dist[0] || 1, end: c.time_s[n - 1],
    time: c.time_s, x: c.pos_x_m, z: c.pos_z_m, v: c.speed_ms,
    thr: c.throttle_clean_pct ?? null, brk: c.brake_clean_pct ?? null, gear: c.gear ? smoothGear(c.gear) : null, abs: c.abs_pct ?? null,
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

const BASE_GREY = [113, 113, 122], GREEN = [34, 197, 94], RED = [239, 68, 68], BLUE = [37, 99, 235];
const mix = (to: number[], k: number) => {
  const q = Math.round(Math.max(0, Math.min(1, k)) * 10) / 10;   // 10 steps: fewer segments to draw
  return `rgb(${BASE_GREY.map((g, j) => Math.round(g + (to[j] - g) * q)).join(",")})`;
};

/** Colour of the line at metre i (like Racemake): grey with nothing pressed, green as strong as the
 *  throttle, red as strong as the brake, blue while the ABS works. */
function inputColor(car: Car, i: number) {
  const brk = car.brk ? car.brk[i] : 0;
  if (brk > 2) return car.abs && car.abs[i] >= ABS_ON ? mix(BLUE, Math.max(0.6, brk / 100)) : mix(RED, brk / 100);
  return mix(GREEN, (car.thr ? car.thr[i] : 0) / 100);
}

/** The line as polylines: one per lap, or split where its input colour changes (every metre). */
function linePaths(car: Car, byInputs: boolean) {
  const out: { points: string; color: string }[] = [];
  let cur: { points: string[]; color: string } | null = null;
  const step = byInputs ? 1 : 2;
  for (let i = 0; i < car.n; i += step) {
    const color = byInputs ? inputColor(car, i) : car.color;
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
  const [camera, setCamera] = useState(0);               // index of the followed car
  const [zoom, setZoom] = useState(0);                   // 0 = whole track … 1 = one corner (mouse wheel)
  const [byInputs, setByInputs] = useState(false);

  const elapsed = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const dirty = useRef(true);
  const svg = useRef<SVGSVGElement>(null);
  const carEls = useRef<(SVGGElement | null)[]>([]);
  const absEls = useRef<(SVGRectElement | null)[]>([]);
  const graphEls = useRef<{ thr?: SVGPathElement | null; brk?: SVGPathElement | null; abs?: SVGPathElement | null }[]>([]);
  const hud = useRef<Record<string, HTMLElement | null>>({});
  const slider = useRef<HTMLInputElement>(null);
  const turnEls = useRef<(HTMLButtonElement | null)[]>([]);
  const activeTurn = useRef(-2);
  const lastSync = useRef(0);
  useEffect(() => { playingRef.current = playing; rateRef.current = rate; }, [playing, rate]);
  useEffect(() => { dirty.current = true; }, [camera, zoom, byInputs]);
  // Mouse wheel zoom on the map (a native listener: React's wheel events cannot prevent page scrolling)
  // over the whole map, checkpoints included, except a checkpoint list that has to scroll (long tracks)
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const list = (e.target as HTMLElement).closest("[data-turns]");
      if (list && list.scrollHeight > list.clientHeight) return;
      e.preventDefault();
      setZoom((z) => Math.max(0, Math.min(1, z - Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.08)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  // When each corner starts for the first car (for the checkpoints)
  const turnTimes = useMemo(() => (cars[0] ? corners.map((c) => timeAt(cars[0], Math.max(0, c.start_m))) : []), [cars, corners]);
  const jumpTo = (i: number) => { elapsed.current = Math.min(maxT, turnTimes[i] + 0.02); dirty.current = true; };
  const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

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

  // View width: from the whole track (0 %) to about one corner (100 %), on a log scale so each wheel
  // step zooms by the same factor; the camera moves from the track's centre to the followed car
  const viewW = bbox.w * Math.pow(Math.min(1, MIN_VIEW_M / bbox.w), zoom);
  const followShare = Math.min(1, zoom / 0.2);
  const carScale = Math.max(1, viewW / 140);                    // cars stay visible when zoomed out
  const paths = useMemo(() => cars.map((c) => linePaths(c, byInputs)), [cars, byInputs]);
  const labels = useMemo(() => {
    const a = cars[0];
    if (!a) return [];
    return corners.map((c) => {
      const i = Math.min(a.n - 1, Math.max(0, Math.round(c.apex_m / a.step)));
      return { n: c.number, ...labelPoint(a.x, a.z, i, viewW / 45, 15) };
    });
  }, [cars, corners, viewW]);

  const draw = useCallback(() => {
    const t = elapsed.current;
    const states = cars.map((c) => carState(c, t));
    states.forEach((s, k) => {
      carEls.current[k]?.setAttribute("transform", `translate(${s.x} ${s.z}) rotate(${s.angle}) scale(${carScale})`);
      const h = hud.current, car = cars[k];
      const abs = car.abs != null && car.abs[s.i] >= ABS_ON;
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
      const g = inputPaths(car, t);
      graphEls.current[k]?.thr?.setAttribute("d", g.thr);
      graphEls.current[k]?.brk?.setAttribute("d", g.brk);
      graphEls.current[k]?.abs?.setAttribute("d", g.abs);
    });

    // Camera
    if (svg.current) {
      const w = viewW, h = w * ASPECT;
      const me = states[camera] ?? states[0], other = states[1 - camera];
      let fx = me.x, fz = me.z;
      if (other && Math.hypot(other.x - me.x, other.z - me.z) < w * 0.6) { fx = (me.x + other.x) / 2; fz = (me.z + other.z) / 2; }
      const cx = bbox.cx + (fx - bbox.cx) * followShare, cz = bbox.cz + (fz - bbox.cz) * followShare;
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
    // Corner checkpoints: the one the first car is in
    const d0 = states[0]?.d ?? 0;
    let current = -1;
    corners.forEach((c, i) => { if (d0 >= c.start_m - 1) current = i; });
    if (current !== activeTurn.current) {
      activeTurn.current = current;
      turnEls.current.forEach((el, i) => el?.setAttribute("data-active", String(i === current)));
    }
  }, [cars, carScale, bbox, camera, viewW, followShare, corners, maxT, onDistance]);

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
  const select = "input py-1";

  return (
    <section className="card card-red rise mt-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { elapsed.current = 0; dirty.current = true; }} title="Back to the start"
                className="btn btn-ghost px-2.5 py-1">⏮</button>
        <button onClick={toggle} className="btn btn-primary w-24 justify-center py-1">
          {playing ? "Pause" : "Play"}
        </button>
        <input ref={slider} type="range" min={0} max={maxT} step={0.01} defaultValue={0} aria-label="Timeline"
               onInput={(e) => { elapsed.current = Number(e.currentTarget.value); dirty.current = true; }}
               className="min-w-40 flex-1 accent-[#ffd200]" />
        <span ref={(el) => { hud.current.clock = el; }} className="tabular w-36 text-right text-sm text-zinc-300" />
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={select} aria-label="Speed">
          {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        {cars.length > 1 && (
          <select value={camera} onChange={(e) => setCamera(Number(e.target.value))} className={select} aria-label="Camera">
            {cars.map((c, k) => <option key={k} value={k}>Follow {c.driver}</option>)}
          </select>
        )}
        <select value={byInputs ? "inputs" : "drivers"} onChange={(e) => setByInputs(e.target.value === "inputs")} className={select} aria-label="Line colours">
          <option value="drivers">Lines: driver colours</option>
          <option value="inputs">Lines: brake / throttle</option>
        </select>
        <button onClick={onClose} className="ml-auto text-sm text-zinc-400 underline hover:text-white">Close replay</button>
      </div>

      <div ref={stage} className="relative mt-3">
      <svg ref={svg} viewBox={`${bbox.cx - bbox.w / 2} ${bbox.cz - bbox.h / 2} ${bbox.w} ${bbox.h}`}
           className="aspect-video w-full cursor-zoom-in rounded-md bg-[#0b0b0d]">
        <TrackSurface edges={edges} />
        {paths.map((p, k) => ({ p, k })).reverse().map(({ p, k }) => p.map((seg, j) => (
          <polyline key={`${k}-${j}`} points={seg.points} fill="none" stroke={seg.color} vectorEffect="non-scaling-stroke"
                    strokeWidth={k === 0 ? 2.5 : byInputs ? 1.5 : 2} strokeOpacity={k === 0 ? 1 : 0.75} strokeLinejoin="round" />
        )))}
        {labels.map((l) => (
          <text key={l.n} x={l.x} y={l.z} fontSize={viewW / 60} fill="#a1a1aa" textAnchor="middle" dominantBaseline="central">T{l.n}</text>
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
      {/* Corner checkpoints: click to jump there; the corner the car is in is highlighted */}
      {corners.length > 0 && (
        <div data-turns className="absolute bottom-2 left-2 top-2 hidden w-28 flex-col gap-1 overflow-y-auto pr-1 sm:flex">
          {corners.map((c, i) => (
            <button key={c.number} ref={(el) => { turnEls.current[i] = el; }} onClick={() => jumpTo(i)} data-active="false"
                    title={c.name ?? undefined}
                    className="shrink-0 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-left backdrop-blur transition hover:border-accent/60 data-[active=true]:border-race data-[active=true]:bg-race/25">
              <div className="flex items-baseline justify-between gap-1 text-[11px] font-semibold text-white">
                Turn {c.number}<span className="tabular font-normal text-zinc-400">{clock(turnTimes[i])}</span>
              </div>
              {c.name && <div className="truncate text-[10px] text-zinc-400">{c.name}</div>}
            </button>
          ))}
        </div>
      )}
      {/* Zoom: mouse wheel, or these buttons */}
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-white/10 bg-black/65 px-1.5 py-1 text-xs text-zinc-300 backdrop-blur">
        <button onClick={() => setZoom((z) => Math.max(0, z - 0.1))} className="px-1.5 hover:text-white" aria-label="Zoom out">−</button>
        <span className="tabular w-10 text-center">{Math.round(zoom * 100)} %</span>
        <button onClick={() => setZoom((z) => Math.min(1, z + 0.1))} className="px-1.5 hover:text-white" aria-label="Zoom in">+</button>
      </div>
      </div>

      <div className={`mt-3 grid gap-3 ${cars.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {cars.map((c, k) => (
          <div key={k} className="rounded-lg border border-white/10 bg-raised/50 px-3 py-2">
            <div className="flex items-baseline gap-3 text-sm">
              <span className="font-semibold" style={{ color: c.color }}>{c.driver}</span>
              <span ref={(el) => { hud.current[`speed${k}`] = el; }} className="tabular text-white" />
              <span ref={(el) => { hud.current[`gear${k}`] = el; }} className="text-zinc-400" />
            </div>
            <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="mt-2 h-14 w-full rounded bg-black/40"
                 aria-label={`${c.driver}: throttle and brake over the last ${GRAPH_S} seconds`}>
              {[25, 50, 75].map((y) => <line key={y} x1={0} x2={400} y1={y} y2={y} stroke="#ffffff10" vectorEffect="non-scaling-stroke" />)}
              <path ref={(el) => { (graphEls.current[k] ??= {}).thr = el; }} fill="none" stroke={INPUT_COLORS.full} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <path ref={(el) => { (graphEls.current[k] ??= {}).brk = el; }} fill="none" stroke={INPUT_COLORS.brake} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <path ref={(el) => { (graphEls.current[k] ??= {}).abs = el; }} fill="none" stroke={INPUT_COLORS.abs} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
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
            {[["Throttle", "linear-gradient(90deg, rgb(113,113,122), rgb(34,197,94))"], ["Brake", "linear-gradient(90deg, rgb(113,113,122), rgb(239,68,68))"],
              ["ABS working", INPUT_COLORS.abs], ["Nothing pressed", INPUT_COLORS.coast]]
              .filter(([label]) => label !== "ABS working" || cars.some((car) => car.abs))
              .map(([label, bg]) => <span key={label} className="flex items-center gap-1"><span className={`h-2 rounded-sm ${bg.startsWith("linear") ? "w-8" : "w-3"}`} style={{ background: bg }} />{label}{bg.startsWith("linear") ? " 0→100 %" : ""}</span>)}
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">
          Space: play / pause. Mouse wheel on the map: zoom (0 % = whole track, 100 % = one corner). Both cars are placed by elapsed time; the charts follow {cars[0].driver}.
          {cars.some((c) => c.abs) ? " Blue light at the front: ABS working." : ""}
        </span>
      </div>
    </section>
  );
}
