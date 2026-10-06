"use client";

import { useEffect, useRef, useState } from "react";
import { lapTime } from "@/lib/format";
import { RANKS, scaleColor } from "@/lib/ranks";

// A line chart for values over sessions (rating, sub-ratings, lap times), drawn at the box's real
// width (text stays sharp): optional rank bands behind it, the line in the rank scale's colour at
// each height (or one colour), extra lines (PB, team best), markers (rank-ups) and a hover tooltip.
// Sessions are evenly spaced (several on one day stay readable); the x labels are their dates.

export type Extra = { values: (number | null)[]; color: string; label: string; dash?: boolean; step?: boolean; dots?: boolean };
export type Marker = { index: number; label: string; color: string };

export default function TrendChart({
  values, labels, details, domain, kind = "rating", height = 240, bands = false, scaleColors = true, color = "#ffd200",
  extras = [], markers = [], invert = false, ticks, name = "Value", hideMain = false,
}: {
  values: (number | null)[];
  labels: string[];                 // per point: its date
  details?: string[];               // per point: second line of the tooltip (track…)
  domain: [number, number];
  kind?: "rating" | "lap";         // 0-100 values, or lap times in ms
  height?: number;
  bands?: boolean;                  // rank bands (0-100 values)
  scaleColors?: boolean;            // the line and dots in the scale's colour at their value
  color?: string;                   // else this colour
  extras?: Extra[];
  markers?: Marker[];
  invert?: boolean;                 // lower is better (lap times): drawn higher
  ticks?: number[];
  name?: string;
  hideMain?: boolean;               // the main values only as dots (lap times: the PB line is the line)
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const format = (v: number, tick = false) => (kind === "lap" ? lapTime(Math.round(v)) : tick ? String(Math.round(v)) : v.toFixed(1));
  const n = values.length;
  if (n < 2) return <p className="rounded-lg bg-white/[0.03] px-3 py-10 text-center text-sm text-zinc-500">The chart appears after two sessions.</p>;
  const left = kind === "lap" ? 66 : 46, right = bands ? 92 : 14, top = 12, bottom = 24;
  const [lo, hi] = domain;
  const x = (i: number) => left + (i * (w - left - right)) / (n - 1);
  const y = (v: number) => {
    const f = (v - lo) / (hi - lo || 1);
    return top + (invert ? f : 1 - f) * (height - top - bottom);
  };
  const path = (vs: (number | null)[], step = false) => {
    let d = "", prev: number | null = null;
    vs.forEach((v, i) => {
      if (v == null) { prev = null; return; }
      if (prev == null) d += `M${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      else d += step ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      prev = v;
    });
    return d;
  };
  const tickValues = ticks ?? (() => {
    const span = hi - lo, stepV = span > 40 ? 10 : 5;
    const out: number[] = [];
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) out.push(v);
    return out;
  })();
  // The line's colour follows its height on the rank scale (a gradient in the chart's own units)
  const gid = `trend-${name.replace(/\W/g, "")}-${Math.round(lo)}-${Math.round(hi)}`;
  const stops = scaleColors ? Array.from({ length: 11 }, (_, k) => lo + ((hi - lo) * k) / 10) : [];
  const xLabels = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].filter((v, k, a) => a.indexOf(v) === k);
  const pick = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - left) / (w - left - right)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover;

  return (
    <div ref={box} className="relative w-full select-none" onMouseMove={(e) => pick(e.clientX)} onMouseLeave={() => setHover(null)}
         onTouchStart={(e) => pick(e.touches[0].clientX)} onTouchMove={(e) => pick(e.touches[0].clientX)}>
      <svg width={w} height={height} className="block">
        {scaleColors && (
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y(lo)} y2={y(hi)}>
              {stops.map((v, k) => <stop key={k} offset={`${k * 10}%`} stopColor={scaleColor(v)} />)}
            </linearGradient>
          </defs>
        )}
        {/* Rank bands: each rank's range in its colour, its name on the right */}
        {bands && RANKS.map((r, k) => {
          const top_ = Math.min(hi, k === 0 ? 100 : RANKS[k - 1].min), bot = Math.max(lo, r.min);
          if (top_ <= bot) return null;
          return (
            <g key={r.title}>
              <rect x={left} width={w - left - right} y={y(top_)} height={y(bot) - y(top_)} fill={r.color} opacity={0.07} />
              <line x1={left} x2={w - right} y1={y(bot)} y2={y(bot)} stroke={r.color} strokeOpacity={0.25} strokeDasharray="3 4" />
              {y(bot) - y(top_) >= 12 && (
                <text x={w - right + 8} y={(y(top_) + y(bot)) / 2 + 4} fontSize={11} fontWeight={600} fill={r.color}>{r.title}</text>
              )}
            </g>
          );
        })}
        {tickValues.map((v) => (
          <g key={v}>
            {!bands && <line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="#ffffff0f" />}
            <text x={left - 8} y={y(v) + 4} fontSize={11} fill="#71717a" textAnchor="end">{format(v, true)}</text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} x={x(i)} y={height - 6} fontSize={11} fill="#71717a" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{labels[i]}</text>
        ))}
        {extras.map((e) => (
          <g key={e.label}>
            <path d={path(e.values, e.step)} fill="none" stroke={e.color} strokeWidth={e.dash ? 1.2 : 2} strokeDasharray={e.dash ? "5 5" : undefined} strokeLinejoin="round" />
            {e.dots && e.values.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={e.color} />)}
          </g>
        ))}
        {!hideMain && <path d={path(values)} fill="none" stroke={scaleColors ? `url(#${gid})` : color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
        {values.map((v, i) => v != null && (
          <circle key={i} cx={x(i)} cy={y(v)} r={h === i ? 5 : hideMain ? 3.5 : n > 40 ? 0 : 2.8}
                  fill={hideMain ? "#0b0b0d" : scaleColors ? scaleColor(v) : color} stroke={hideMain ? (scaleColors ? scaleColor(v) : "#d4d4d8") : "#0b0b0d"} strokeWidth={1.5} />
        ))}
        {markers.map((m) => values[m.index] != null && (
          <g key={m.index}>
            <circle cx={x(m.index)} cy={y(values[m.index]!)} r={7} fill="none" stroke={m.color} strokeWidth={2} />
            <text x={x(m.index)} y={y(values[m.index]!) - 12} fontSize={10} fontWeight={700} fill={m.color} textAnchor="middle">▲ {m.label}</text>
          </g>
        ))}
        {h != null && <line x1={x(h)} x2={x(h)} y1={top} y2={height - bottom} stroke="#ffffff40" />}
      </svg>
      {h != null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-white/10 bg-ink/95 px-2.5 py-1.5 text-xs shadow-xl"
             style={x(h) > w / 2 ? { right: w - x(h) + 10 } : { left: x(h) + 10 }}>
          <div className="text-zinc-400">{labels[h]}{details?.[h] ? ` · ${details[h]}` : ""}</div>
          {values[h] != null && (
            <div className="tabular font-semibold" style={{ color: scaleColors ? scaleColor(values[h]!) : color }}>{name} {format(values[h]!)}</div>
          )}
          {extras.map((e) => e.values[h] != null && (
            <div key={e.label} className="tabular" style={{ color: e.color }}>{e.label} {format(e.values[h]!)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
