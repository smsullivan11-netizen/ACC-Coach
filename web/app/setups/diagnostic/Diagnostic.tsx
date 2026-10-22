"use client";

import { Check, ChevronDown, Gauge, Lightbulb, Link2, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { Chip, SectionTitle } from "@/components/ui";
import { CLASSES, type CarClass } from "@/lib/cars";
import {
  balanceText, cellOf, CELLS, diagnose, DRIVING_TIPS, ISSUES, NO_AIDS, PHASES, SPEEDS, writeState, type Suggestion,
} from "@/lib/setup-doctor";

export type DiagnosticCar = { key: string; name: string; cls: CarClass; side: string | null; style: string | null };

const UNDER = "#38bdf8", OVER = "#f43f5e";   // understeer blue (pushing), oversteer red (loose)
const SHADE = [0.45, 0.72, 1];                // pip strength by severity

// The report (car, balance grid, other problems) on the left, the changes to try on the right
// (lib/setup-doctor.ts). Everything is computed here; the address keeps the report for sharing.
export default function Diagnostic({ cars, initial }: { cars: DiagnosticCar[]; initial: { car: string; cells: number[]; issues: string[] } }) {
  const [car, setCar] = useState(initial.car);
  const [cells, setCells] = useState(initial.cells);
  const [issues, setIssues] = useState(initial.issues);
  const [more, setMore] = useState(false);
  const [style, setStyle] = useState(false);
  const [copied, setCopied] = useState(false);

  const info = cars.find((c) => c.key === car);
  const cup = NO_AIDS.has(car);
  const result = useMemo(() => diagnose(cells, issues, cup), [cells, issues, cup]);
  const reported = cells.some((v) => v !== 0) || issues.length > 0;
  const tips = PHASES.flatMap((p, ph) => (["u", "o"] as const)
    .filter((t) => SPEEDS.some((_, sp) => (t === "u" ? cells[cellOf(sp, ph)] < 0 : cells[cellOf(sp, ph)] > 0)))
    .map((t) => DRIVING_TIPS[`${p.key}-${t}`]));

  // The report in the address: a link to this page shows the same diagnosis
  useEffect(() => {
    const q = new URLSearchParams();
    if (car) q.set("car", car);
    const st = writeState(cells, issues);
    if (st.b) q.set("b", st.b);
    if (st.i) q.set("i", st.i);
    const s = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  }, [car, cells, issues]);

  const setCell = (k: number, v: number) => setCells(cells.map((x, i) => (i === k ? v : x)));
  const toggle = (key: string) => setIssues(issues.includes(key) ? issues.filter((k) => k !== key) : [...issues, key]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard: the address bar has the link */ }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px] xl:grid-rows-[auto_1fr]">
      <div className="min-w-0">
        <section className="card card-red rise space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Car</span>
            <select value={car} onChange={(e) => { setCar(e.target.value); setStyle(false); }} className="input py-1 text-sm" aria-label="Car">
              <option value="">Any car</option>
              {CLASSES.map((cls) => (
                <optgroup key={cls} label={cls}>
                  {cars.filter((c) => c.cls === cls).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
            {info && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {info.side && <img src={info.side} alt="" width={112} height={31} className="h-auto w-24 brightness-[1.25] contrast-[1.05]" />}
                {info.style && (
                  <button type="button" onClick={() => setStyle(!style)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                    How it drives <ChevronDown size={13} className={`transition ${style ? "rotate-180" : ""}`} />
                  </button>
                )}
                <Link href={`/setups?car=${info.key}`} className="text-xs text-zinc-400 hover:text-white hover:underline">Team setups</Link>
                {cup && <Chip title="ACC's Porsche Cup cars have neither: those changes are left out">No TC or ABS</Chip>}
              </>
            )}
            {reported && (
              <button type="button" onClick={() => { setCells(Array(CELLS).fill(0)); setIssues([]); }} className="btn btn-ghost ml-auto px-3 py-1 text-xs">
                <RotateCcw size={13} /> Clear
              </button>
            )}
          </div>
          {info && style && <p className="text-sm leading-relaxed text-zinc-300">{info.style}</p>}

          <div>
            <SectionTitle info="Understeer: the front slides wide and the car turns less than you ask. Oversteer: the rear slides and it turns more than you ask. Click how much in each kind of corner and phase (the middle = fine; click again to clear)."
                          action={<span className="flex gap-3 text-[11px]"><span style={{ color: UNDER }}>◀ Understeer</span><span style={{ color: OVER }}>Oversteer ▶</span></span>}>
              Balance
            </SectionTitle>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-[7rem_repeat(3,minmax(0,1fr))] sm:gap-y-3">
              <div className="hidden sm:block" />
              {PHASES.map((p) => (
                <div key={p.key} className="hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 sm:flex">
                  {p.label}<InfoTip text={p.info} />
                </div>
              ))}
              {SPEEDS.map((s, sp) => (
                <div key={s.key} className="contents">
                  <div className="flex items-center gap-1 border-t border-white/5 pt-3 sm:block sm:border-0 sm:pt-0">
                    <div className="flex items-center gap-1 font-medium text-white">{s.label}<span className="sm:hidden"> corners</span><InfoTip text={s.info} side="left" /></div>
                    <div className="ml-2 text-xs text-zinc-500 sm:ml-0">{s.sub}</div>
                  </div>
                  {PHASES.map((p, ph) => (
                    <Meter key={p.key} value={cells[cellOf(sp, ph)]} onChange={(v) => setCell(cellOf(sp, ph), v)}
                           phase={p.label} label={`${s.label} corners, ${p.label.toLowerCase()}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle info="Anything else the car does: tick all that apply.">Other problems</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {ISSUES.map((i) => {
                const on = issues.includes(i.key);
                return (
                  <button key={i.key} type="button" aria-pressed={on} onClick={() => toggle(i.key)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${on ? "border-accent/60 bg-accent/10 text-accent" : "border-white/10 text-zinc-300 hover:border-white/25 hover:text-white"}`}>
                    {on && <Check size={14} />}{i.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <div className="min-w-0 xl:row-span-2 xl:sticky xl:top-24 xl:self-start">
        <section className="card card-red rise p-5" style={{ "--d": "60ms" } as React.CSSProperties}>
          <SectionTitle icon={Wrench}
                        info="Ranked by how much each change helps what you reported, minus what it would upset where the car is fine. Steps are typical sizes: a click is a different amount on every car. Change one thing at a time and drive 3 laps or more before judging; undo it if it does not help."
                        action={reported && (
                          <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-zinc-400 hover:text-white" title="Copy a link to this diagnosis, to send it to a teammate">
                            {copied ? <Check size={13} className="text-emerald-400" /> : <Link2 size={13} />} {copied ? "Copied" : "Copy link"}
                          </button>
                        )}>
            What to try
          </SectionTitle>
          {!reported ? (
            <p className="py-6 text-center text-sm text-zinc-500">Mark where the car misbehaves: the setup changes appear here.</p>
          ) : (
            <>
              <p className="mb-3 flex items-start gap-2 text-xs text-zinc-400">
                <Gauge size={14} className="mt-px shrink-0 text-accent" />
                <span>First, hot tyre pressures at 26.9 psi on all four (the app&apos;s race engineer shows them live).</span>
                <InfoTip text="Out of their window the tyres lose grip at that end whatever the setup: fix the pressures before anything else." edge />
              </p>
              {result.top.length === 0
                ? <p className="py-4 text-sm text-zinc-500">No setup change stands out for this: check the driving tips.</p>
                : <ol className="space-y-2.5">{result.top.map((s, i) => <Item key={s.setting.key} s={s} n={i + 1} />)}</ol>}
              {result.more.length > 0 && (
                <>
                  <button type="button" onClick={() => setMore(!more)} className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                    <ChevronDown size={13} className={`transition ${more ? "rotate-180" : ""}`} /> {more ? "Fewer options" : `${result.more.length} more option${result.more.length === 1 ? "" : "s"}`}
                  </button>
                  {more && <ol className="mt-2.5 space-y-2.5">{result.more.map((s, i) => <Item key={s.setting.key} s={s} n={result.top.length + i + 1} />)}</ol>}
                </>
              )}
              <p className="mt-3 text-xs text-zinc-500">One change at a time, then 3 laps or more.</p>
            </>
          )}
        </section>
      </div>
      {tips.length > 0 && (
        <section className="card rise min-w-0 p-5 xl:self-start" style={{ "--d": "120ms" } as React.CSSProperties}>
          <SectionTitle icon={Lightbulb} info="Many balance problems come from the driving rather than the setup: try these first, and keep them in mind while you test a change.">
            Driving first?
          </SectionTitle>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {tips.map((t) => <li key={t} className="flex gap-2"><span className="text-zinc-600">•</span>{t}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/** One cell of the grid: 3 understeer steps, fine, 3 oversteer steps. */
function Meter({ value, onChange, phase, label }: { value: number; onChange: (v: number) => void; phase: string; label: string }) {
  const color = value < 0 ? UNDER : value > 0 ? OVER : undefined;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-400 sm:hidden">{phase}<span style={{ color }}>{balanceText(value)}</span></div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-7 gap-1">
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => {
          const on = k === 0 ? value === 0 : k < 0 ? value <= k : value >= k;
          const c = k < 0 ? UNDER : OVER;
          return (
            <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={balanceText(k)} title={balanceText(k)}
                    onClick={() => onChange(k === value ? 0 : k)}
                    className={`h-6 rounded-sm transition ${on ? "" : "bg-white/[0.06] hover:bg-white/15"} ${k === 0 ? "mx-auto w-2" : ""}`}
                    style={on ? { background: k === 0 ? "rgb(255 255 255 / 0.7)" : c, opacity: k === 0 ? 1 : SHADE[Math.abs(k) - 1] } : undefined} />
          );
        })}
      </div>
      <div className="mt-1 hidden text-xs sm:block" style={{ color: color ?? "rgb(113 113 122)" }}>{balanceText(value)}</div>
    </div>
  );
}

function Item({ s, n }: { s: Suggestion; n: number }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-start gap-3">
        <span className={`display grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm ${n === 1 ? "bg-accent text-ink" : "bg-white/5 text-zinc-300"}`}>{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-white">{s.setting.name}</span>
            <InfoTip text={`${s.dir.why} Watch for: ${s.dir.watch}`} edge />
            <span className="ml-auto"><Chip>{s.setting.tab}</Chip></span>
          </div>
          <div className="mt-0.5 font-semibold text-accent">{s.step} {s.dir.label}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {s.fixes.map((f) => <Chip key={f} tone="green" icon={Check}>{f}</Chip>)}
            {s.worsens.map((f) => <Chip key={f} tone="red" icon={TriangleAlert} title="It makes this other reported problem worse">{f}</Chip>)}
            {s.setting.live && <Chip tone="yellow" title="Changed from the cockpit: try it on the next lap">From the cockpit</Chip>}
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-500">{s.setting.scope}</div>
        </div>
      </div>
    </li>
  );
}
