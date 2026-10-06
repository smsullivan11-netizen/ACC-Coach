"use client";

import { Gauge, Layers, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import TrendChart from "@/components/TrendChart";
import { ratingDomain } from "@/lib/chart";
import { RankBadge, ScaleNumber, SectionTitle, Segmented } from "@/components/ui";
import { lapTime, prettyKey } from "@/lib/format";
import { rankFor, rankLevel } from "@/lib/ranks";

export type TrackSession = { id: string; date: string; track: string; car_class: string | null; best_ms: number };
type Point = {
  id: string; session_id: string; date: string; track: string; rating: number; session_score: number;
  pace: number | null; consistency: number | null; clean: number | null; smoothness: number | null;
};
type PartKey = "pace" | "consistency" | "clean" | "smoothness";
const PARTS: { value: PartKey; label: string; help: string }[] = [
  { value: "pace", label: "Pace", help: "best lap against the reference" },
  { value: "consistency", label: "Consistency", help: "how close the laps are to each other" },
  { value: "clean", label: "Clean", help: "laps not lost to track limits" },
  { value: "smoothness", label: "Smooth", help: "steering corrections against the team" },
];
const PROVISIONAL = 3;

/** Lap time ticks: a round step giving at most 6 lines. */
function lapTicks(lo: number, hi: number) {
  const step = [100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => (hi - lo) / s <= 6) ?? 10000;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

export default function ProgressView({ history, sessions, teamBest }: {
  history: Point[]; sessions: TrackSession[]; teamBest: { key: string; ms: number }[];
}) {
  const [part, setPart] = useState<PartKey>("pace");
  // Tracks (and class), the most driven first
  const tracks = useMemo(() => {
    const m = new Map<string, TrackSession[]>();
    for (const s of sessions) {
      const k = `${s.track}|${s.car_class ?? ""}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [sessions]);
  const [track, setTrack] = useState<string | null>(null);
  const shown = tracks.find(([k]) => k === track) ?? tracks[0];

  if (!history.length && !sessions.length)
    return <p className="card p-6 text-zinc-400">Nothing yet: your progression starts with your first uploaded session.</p>;

  // 1. Rating
  const ratings = history.map((h) => h.rating);
  const labels = history.map((h) => h.date), details = history.map((h) => prettyKey(h.track));
  // A marker the first time each rank is reached (dropping back and regaining it is not marked again)
  const markers = history.flatMap((h, i) => i > 0 && rankLevel(h.rating) > Math.max(...history.slice(0, i).map((p) => rankLevel(p.rating)))
    ? [{ index: i, label: rankFor(h.rating).title, color: rankFor(h.rating).color }] : []);
  const now = ratings.at(-1) ?? null;
  const best = ratings.length >= PROVISIONAL ? Math.max(...ratings.slice(PROVISIONAL - 1)) : null;
  const since = ratings.length >= 2 ? ratings.at(-1)! - ratings[0] : null;

  // 2. Sub-rating
  const partValues = history.map((h) => h[part]);
  const partInfo = PARTS.find((p) => p.value === part)!;

  // 3. Lap times on the chosen track
  const laps = shown?.[1] ?? [];
  const team = shown ? teamBest.find((t) => t.key === shown[0])?.ms ?? null : null;
  const times = laps.map((s) => s.best_ms);
  const pbLine = times.map((_, i) => Math.min(...times.slice(0, i + 1)));   // the PB after each session
  const fastest = Math.min(...times, team ?? Infinity);
  const slowest = Math.min(Math.max(...times), Math.min(...times) * 1.06);   // very slow sessions (learning) leave the chart
  const pad = Math.max(150, (slowest - fastest) * 0.08);
  const lapDomain: [number, number] = [fastest - pad, slowest + pad];
  const [trackKey, carClass] = shown ? shown[0].split("|") : ["", ""];

  return (
    <div className="space-y-5">
      {/* 1. Rating after each session, on the rank bands */}
      <section className="card card-red rise p-5">
        <SectionTitle icon={Gauge}>Overall Driver Rating</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="now">{now != null ? <span className="text-accent">{now.toFixed(1)}</span> : "–"} {now != null && <RankBadge rating={now} />}</Figure>
          <Figure label="all-time best">{best != null ? best.toFixed(1) : "–"}</Figure>
          <Figure label="since your first session">
            {since == null ? "–" : <span className={since >= 0 ? "text-emerald-400" : "text-red-400"}>{since >= 0 ? "+" : ""}{since.toFixed(1)}</span>}
          </Figure>
          <Figure label="rated sessions">{history.length}</Figure>
        </div>
        <TrendChart values={ratings} labels={labels} details={details} domain={ratingDomain(ratings)} bands markers={markers} height={300} name="Rating" />
        <p className="mt-2 text-xs text-zinc-500">The rating after each rated session (your current form: best session per track in the last 60 days). ▲ a new rank.</p>
      </section>

      {/* 2. The four parts of the current form */}
      <section className="card rise p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SectionTitle icon={Layers}>Sub-ratings</SectionTitle>
          <Segmented options={PARTS} value={part} onChange={setPart} className="-mt-3" />
          <span className="-mt-3 ml-auto text-sm text-zinc-400">now <ScaleNumber v={partValues.at(-1)} className="text-lg font-bold" /></span>
        </div>
        <TrendChart key={part} values={partValues} labels={labels} details={details} domain={ratingDomain(partValues)} height={220} name={partInfo.label} />
        <p className="mt-2 text-xs text-zinc-500">{partInfo.label}: {partInfo.help}, in your current form after each session.</p>
      </section>

      {/* 3. Lap times per track: each session's best, the PB line, the team best */}
      <section className="card rise p-5">
        <SectionTitle icon={Timer}>Lap times</SectionTitle>
        {!shown ? <p className="text-sm text-zinc-500">No valid lap yet.</p> : (
          <>
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
              {tracks.map(([k, list]) => {
                const [t, c] = k.split("|");
                const on = k === shown[0];
                return (
                  <button key={k} onClick={() => setTrack(k)}
                          className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${on ? "border-race bg-race/25 text-white" : "border-white/10 bg-raised/60 text-zinc-300 hover:border-accent/60 hover:text-white"}`}>
                    {prettyKey(t)}{c && <span className="ml-1 font-normal text-zinc-400">{c}</span>} <span className="font-normal text-zinc-500">· {list.length}</span>
                  </button>
                );
              })}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="your PB"><span className="text-accent">{lapTime(pbLine.at(-1)!)}</span></Figure>
              <Figure label="since your first session">
                {times.length >= 2 ? <span className="text-emerald-400">−{((times[0] - pbLine.at(-1)!) / 1000).toFixed(3)} s</span> : "–"}
              </Figure>
              <Figure label="to the team best">{team != null ? (pbLine.at(-1)! <= team ? <span className="text-accent">team best</span> : `+${((pbLine.at(-1)! - team) / 1000).toFixed(3)} s`) : "–"}</Figure>
              <Figure label="sessions">{laps.length}</Figure>
            </div>
            <TrendChart key={shown[0]} kind="lap" invert values={times.map((t) => (t <= slowest ? t : null))} labels={laps.map((s) => s.date)}
                        domain={lapDomain} ticks={lapTicks(lapDomain[0], lapDomain[1])} scaleColors={false} color="#d4d4d8" hideMain name="Session best"
                        extras={[
                          { values: pbLine, color: "#ffd200", label: "PB", step: true },
                          ...(team != null ? [{ values: laps.map(() => team), color: "#a1a1aa", label: "Team best", dash: true }] : []),
                        ]}
                        height={260} />
            <p className="mt-2 text-xs text-zinc-500">
              {prettyKey(trackKey)}{carClass ? ` · ${carClass}` : ""}: dots = each session&apos;s best valid lap (faster is higher), yellow = your PB, dashed = the team best.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <div className="tabular flex items-center gap-2 text-xl font-bold text-white">{children}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
