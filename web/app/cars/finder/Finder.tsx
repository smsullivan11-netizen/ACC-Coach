"use client";

import { ChevronDown, RotateCcw, Swords } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { Segmented } from "@/components/ui";
import { CAR_PARTS, CLASSES, type CarClass } from "@/lib/cars";
import {
  EXPERIENCES, MIN_COVERAGE, PACE_SHARE, presetWeights, score, SESSIONS, TRACK_TYPE, TRACK_TYPES,
  type Experience, type FinderCar, type Session, type TrackType, type Weights,
} from "@/lib/finder";
import { scaleColor } from "@/lib/ranks";

type Props = {
  cars: Record<string, FinderCar[]>;
  gaps: Record<string, Record<string, Record<string, number>>>;
  tracks: { key: string; name: string }[];
};

// The finder's choices and results (lib/finder.ts scores): class, session, track type or one track,
// experience → an importance per sub-rating (fine-tunable with sliders) → the 5 best matches, with
// their strongest points and links to the car and to a head to head against the first.
export default function Finder({ cars, gaps, tracks }: Props) {
  const [cls, setCls] = useState<CarClass>("GT3");
  const [session, setSession] = useState<Session>("race");
  const [type, setType] = useState<TrackType>("mixed");
  const [track, setTrack] = useState("");            // a specific track: its type, and its pace counts
  const [experience, setExperience] = useState<Experience>("intermediate");
  const [custom, setCustom] = useState<Weights | null>(null);   // hand-tuned importances
  const [open, setOpen] = useState(false);

  const trackType = track ? TRACK_TYPE[track] ?? "mixed" : type;
  const preset = presetWeights(session, trackType, experience);
  const w = custom ?? preset;
  const trackName = track ? tracks.find((t) => t.key === track)?.name ?? track : null;
  const results = useMemo(
    () => score(cars[cls] ?? [], w, track ? gaps[cls]?.[track] ?? null : null, trackName).slice(0, 5),
    [cars, cls, w, track, gaps, trackName],
  );
  // A preset change starts the fine-tuning over from its values
  const pick = <T,>(set: (v: T) => void) => (v: T) => { set(v); setCustom(null); };

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="card card-red rise space-y-4 p-5">
        <Row label="Class"><Segmented options={CLASSES.map((c) => ({ value: c, label: c }))} value={cls} onChange={setCls} /></Row>
        <Row label="Session" info="Qualy / hotlap: tyre wear does not matter.">
          <Segmented options={SESSIONS} value={session} onChange={pick(setSession)} />
        </Row>
        <Row label="Track" info={`A type of track sets which ratings matter. Pick a track and its reference times count too (${Math.round(PACE_SHARE * 100)} % of the match): how far each car is from the class's fastest there, default BoP.`}>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented options={TRACK_TYPES} value={track ? ("" as TrackType) : type} onChange={(v) => { setType(v); setTrack(""); setCustom(null); }} />
            <select value={track} onChange={(e) => pick(setTrack)(e.target.value)} className="input py-1 text-sm">
              <option value="">or a track…</option>
              {tracks.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>
          {track && <p className="mt-1 text-xs text-zinc-500">{trackName}: {TRACK_TYPES.find((t) => t.value === trackType)?.label.toLowerCase()} track</p>}
        </Row>
        <Row label="Experience" info="Beginner: easy cars first (driveability counts a lot). Alien: pure performance.">
          <Segmented options={EXPERIENCES} value={experience} onChange={pick(setExperience)} />
        </Row>

        <div className="border-t border-white/5 pt-3">
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-sm text-zinc-300 hover:text-white">
            <ChevronDown size={15} className={`transition ${open ? "rotate-180" : ""}`} /> Fine-tune what matters
            {custom && <span className="ml-auto text-xs text-accent">tuned</span>}
          </button>
          {open && (
            <div className="mt-3 space-y-2.5">
              {CAR_PARTS.map((p) => (
                <label key={p.key} className="block">
                  <span className="flex items-center justify-between text-xs text-zinc-400">
                    {p.label}<span className="tabular text-zinc-300">{w[p.key] === 0 ? "ignored" : w[p.key]}</span>
                  </span>
                  <input type="range" min={0} max={10} value={w[p.key]} aria-label={`${p.label} importance`}
                         onChange={(e) => setCustom({ ...w, [p.key]: Number(e.target.value) })}
                         style={{ "--fill": `${w[p.key] * 10}%` } as React.CSSProperties} className="range-lg w-full" />
                </label>
              ))}
              {custom && (
                <button type="button" onClick={() => setCustom(null)} className="btn btn-ghost mt-1 px-3 py-1 text-xs"><RotateCcw size={13} /> Back to the presets</button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {results.length === 0 && <p className="card p-6 text-zinc-400">No rated {cls} car yet: the admins rate the cars on their pages.</p>}
        {results.map((m, i) => (
          <div key={m.car.key} className="card rise flex flex-wrap items-center gap-4 p-4" style={{ "--d": `${i * 50}ms` } as React.CSSProperties}>
            <span className={`display grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg ${i === 0 ? "bg-accent text-ink" : "bg-white/5 text-zinc-300"}`}>{i + 1}</span>
            {m.car.side
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={m.car.side} alt="" width={160} height={44} className="h-auto w-28 shrink-0 sm:w-36 brightness-[1.25] contrast-[1.05]" />
              : <div className="h-10 w-36 shrink-0" />}
            <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <Link href={`/cars/${m.car.key}${session === "qualy" ? "?mode=qualy" : ""}`} className="font-medium text-white hover:underline">{m.car.name}</Link>
              <span className="ml-2 text-xs text-zinc-500">{m.car.year}</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.why.map((x) => <span key={x} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300">{x}</span>)}
                {m.coverage < MIN_COVERAGE && <span className="rounded-full border border-race/40 px-2 py-0.5 text-[11px] text-red-300" title="Few of the ratings you asked for are filled in for this car: the match is less sure, so it comes after the well-rated cars">few ratings</span>}
              </div>
            </div>
            <div className="ml-auto text-right sm:ml-0">
              <div className="tabular display text-2xl" style={{ color: scaleColor(m.score) }}>{Math.round(m.score)}<span className="text-sm text-zinc-500"> %</span></div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">match</div>
            </div>
            {i > 0 && (
              <Link href={`/cars/compare?a=${results[0].car.key}&b=${m.car.key}${session === "qualy" ? "&mode=qualy" : ""}`} className="btn btn-ghost order-last px-3 py-1.5 text-xs sm:order-none" title={`Head to head against ${results[0].car.name}`}>
                <Swords size={13} /> vs #1
              </Link>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}{info && <InfoTip text={info} side="left" />}</div>
      {children}
    </div>
  );
}
