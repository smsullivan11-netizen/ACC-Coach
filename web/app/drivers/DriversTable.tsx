"use client";

import { ArrowDown, ArrowUp, Info, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, PartBar, Position, RankIcon, ScaleNumber } from "@/components/ui";
import { rankFor } from "@/lib/ranks";

export type DriverRow = {
  id: string; name: string; avatar: string | null; rating: number | null; best: number | null; change: number | null;
  sessions: number; provisional: boolean; km: number;
  pace: number | null; consistency: number | null; clean: number | null; smoothness: number | null;
};
type Key = "rating" | "pace" | "consistency" | "clean" | "smoothness" | "change" | "km";

const COLUMNS: { key: Key; label: string; info: string }[] = [
  { key: "rating", label: "Rating", info: "Current form: each driver's best session on each track of the last 60 days (5+ valid laps), averaged over the tracks. After the slash: the all-time best. A session's score weighs pace, consistency, clean driving and smoothness, depending on the session type (practice, qualifying, race, mixed running)." },
  { key: "pace", label: "Pace", info: "Best lap against the reference (the car's target on the track, or the team's best in that car if faster), with the cost of the fuel above minimum fuel removed: 0 % slower = 100, 3 % = 50, 6 % or more = 0." },
  { key: "consistency", label: "Consistency", info: "How close the laps are to each other: on runs of 6+ laps, to the run's trend (fuel burn and tyre wear left out), otherwise to the best lap. 0.1 % = 100, 3 % or more = 0." },
  { key: "clean", label: "Clean driving", info: "Share of flying laps not lost to track limits." },
  { key: "smoothness", label: "Smoothness", info: "Steering corrections compared with the team on the same track and class: fewer = smoother." },
  { key: "change", label: "Trend", info: "How much the rating moved with the driver's last session." },
  { key: "km", label: "Distance", info: "Kilometres driven in every session uploaded, all laps counted." },
];

function InfoTip({ text, edge = false }: { text: string; edge?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex">
      <button type="button" aria-label="What is this?" title={text}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="grid h-4 w-4 place-items-center rounded-full text-zinc-500 hover:text-accent">
        <Info size={12} />
      </button>
      {open && (
        <span className={`absolute top-6 z-30 w-64 whitespace-normal rounded-lg border border-white/10 bg-raised p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-zinc-300 shadow-xl ${
                edge ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
          {text}
        </span>
      )}
    </span>
  );
}

// Parts: the number in the scale's colour at its value, the zoomed-in bar under it (components/ui.tsx)
function Part({ v }: { v: number | null }) {
  if (v == null) return <span className="text-zinc-600">–</span>;
  return (
    <div className="ml-auto w-16">
      <div className="text-right font-semibold"><ScaleNumber v={v} /></div>
      <PartBar v={v} className="mt-1 h-1" />
    </div>
  );
}

// The team ranking: position, driver, rating (current / all-time best) with its bar, the four parts
// of the rating, the trend and the distance driven. Every column sorts (click again to reverse);
// the gold, silver and bronze positions follow the sort.
export default function DriversTable({ rows, me }: { rows: DriverRow[]; me: string }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "rating", desc: true });
  const sorted = useMemo(() => {
    const val = (r: DriverRow) => r[sort.key];
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return a.name.localeCompare(b.name);
      if (x == null) return 1;
      if (y == null) return -1;
      return sort.desc ? y - x : x - y;
    });
  }, [rows, sort]);
  const click = (key: Key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }));
  let pos = 0;

  const head = (c: (typeof COLUMNS)[number], align = "text-right") => (
    <th key={c.key} className={align}>
      <span className={`inline-flex items-center gap-1 ${align === "text-right" ? "justify-end" : ""}`}>
        <button type="button" onClick={() => click(c.key)} className={`inline-flex items-center gap-1 uppercase hover:text-white ${sort.key === c.key ? "text-accent" : ""}`}>
          {c.label}{c.key === "km" ? " (km)" : ""}
          {sort.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
        </button>
        <InfoTip text={c.info} edge={c.key === "change" || c.key === "km" || c.key === "smoothness"} />
      </span>
    </th>
  );

  return (
    <div className="card card-red rise overflow-x-auto">
      <table className="data-table min-w-[980px]">
        <thead>
          <tr>
            <th className="w-12">#</th>
            <th>Driver</th>
            {head(COLUMNS[0], "text-left")}
            {COLUMNS.slice(1).map((c) => head(c))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const value = r[sort.key];
            const n = value != null ? ++pos : null;
            const rank = r.rating != null ? rankFor(r.rating) : null;
            return (
              <tr key={r.id} className={r.id === me ? "bg-accent/[0.06]" : ""}>
                <td>{n != null ? <Position n={n} /> : null}</td>
                <td>
                  <Link href={`/drivers/${r.id}`} className="flex items-center gap-3 text-white hover:underline">
                    <Avatar url={r.avatar} name={r.name} size={32} />
                    <span className="font-medium">{r.name}</span>
                    <RankIcon rating={r.rating} size={16} />
                  </Link>
                </td>
                <td>
                  {r.rating != null && rank ? (
                    <div className="w-44">
                      <div className="flex items-baseline gap-2 whitespace-nowrap">
                        {/* The rating in its rank's colour (user's request), the all-time best after it */}
                        <span className="tabular text-lg font-bold" style={{ color: rank.color }} title="Current rating / all-time best">
                          {r.rating.toFixed(1)}{r.best != null && <span className="text-sm font-semibold text-zinc-500">/{r.best.toFixed(1)}</span>}
                        </span>
                      </div>
                      <PartBar v={r.rating} className="mt-1 h-1.5" />
                      <div className="mt-1.5 flex items-center gap-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider">
                        <span className="rounded-full border px-2 py-0.5 leading-none"
                              style={{ color: rank.color, borderColor: `${rank.color}80`, background: `${rank.color}1a` }}>
                          {rank.title}
                        </span>
                        {r.provisional && <span className="text-zinc-500">provisional</span>}
                      </div>
                    </div>
                  ) : <span className="text-zinc-500">not rated yet</span>}
                </td>
                <td className="text-right"><Part v={r.pace} /></td>
                <td className="text-right"><Part v={r.consistency} /></td>
                <td className="text-right"><Part v={r.clean} /></td>
                <td className="text-right"><Part v={r.smoothness} /></td>
                <td className="text-right">
                  {r.change == null ? <span className="text-zinc-600">–</span>
                    : Math.abs(r.change) < 0.05 ? <span className="text-zinc-500">0.0</span>
                    : (
                      <span className={`inline-flex items-center gap-1 ${r.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {r.change > 0 ? "+" : ""}{r.change.toFixed(1)}
                      </span>
                    )}
                </td>
                <td className="tabular text-right text-zinc-300">{r.km ? Math.round(r.km).toLocaleString("en-GB") : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
