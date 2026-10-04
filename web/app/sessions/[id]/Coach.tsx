import { ArrowUpRight, Flag, GraduationCap, Play, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import type { Coaching, CornerCoaching, Tone } from "@/lib/coaching";

const TONES: Record<Tone, { mark: string; color: string }> = {
  good: { mark: "✓", color: "text-emerald-400" },
  tip: { mark: "→", color: "text-accent" },
  warning: { mark: "!", color: "text-orange-400" },
};
const sec = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)} s`;

// The coaching summary of a session (lib/coaching.ts).
export default function Coach({ c }: { c: Coaching }) {
  const max = Math.max(0.01, ...c.losses.map((l) => l.loss_s));
  const compare = (corner?: CornerCoaching) =>
    c.lap && c.reference ? `/laps/${c.lap.id}?vs=${c.reference.id}${corner ? `&corner=${corner.number}` : ""}` : null;
  return (
    <section className="card card-red rise relative mt-5 overflow-hidden p-5" style={{ "--d": "60ms" } as React.CSSProperties}>
      <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-accent/5 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        <Sparkles size={18} className="text-race" />
        <span className="display text-sm uppercase tracking-wider text-white">Coach</span>
        {compare() && (
          <Link href={compare()!} className="btn btn-ghost ml-auto px-2.5 py-1 text-xs font-medium">
            Compare with the reference <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
      <p className="relative mt-3 text-lg text-white">{c.headline}</p>
      {c.phases && c.gap_s != null && c.gap_s > 0 && (
        <p className="tabular mt-1 text-sm text-zinc-400">
          Where the gap is made: braking and corner entry <span className="text-white">{sec(c.phases.entry_s)}</span> · exits and
          straights <span className="text-white">{sec(c.phases.exit_s)}</span>
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          {c.losses.length > 0 && (
            <>
              <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-zinc-400"><Flag size={14} className="text-race" /> Where you lose time</h3>
              <ul className="mt-2 space-y-4">
                {c.losses.map((l) => (
                  <li key={l.number}>
                    <div className="flex items-baseline gap-3">
                      <span className="font-medium text-white">T{l.number}{l.name && <span className="ml-1.5 font-normal text-zinc-400">{l.name}</span>}</span>
                      <span className="tabular text-sm text-red-400">{sec(l.loss_s)}</span>
                      {compare(l) && <Link href={compare(l)!} className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-accent">see it <ArrowUpRight size={12} /></Link>}
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-white/5" title="Entry / exit">
                      <div className="bg-orange-400" style={{ width: `${(Math.max(0, l.entry_s) / max) * 100}%` }} />
                      <div className="bg-sky-400" style={{ width: `${(Math.max(0, l.exit_s) / max) * 100}%` }} />
                    </div>
                    <p className="tabular mt-1 text-xs text-zinc-500">
                      <span className="text-orange-300">entry {sec(l.entry_s)}</span> · <span className="text-sky-300">exit {sec(l.exit_s)}</span>
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-300">
                      {l.advice.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                    {l.mentor && c.lap && (
                      <Link href={`/laps/${c.lap.id}?vs=${l.mentor.lap_id}&corner=${l.number}&replay=1`}
                            className="mt-2 flex items-center gap-2 rounded-lg border border-race/30 bg-race/[0.06] px-3 py-2 text-sm text-zinc-200 transition hover:border-race/60">
                        <GraduationCap size={16} className="shrink-0 text-race" />
                        <span><strong className="text-white">{l.mentor.driver}</strong> is {l.mentor.gain_s.toFixed(2)} s faster than you through T{l.number}: watch their replay</span>
                        <Play size={14} className="ml-auto shrink-0 text-accent" fill="currentColor" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          {c.focus.length > 0 && (
            <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-accent"><Target size={15} /> Focus for your next session</h3>
              <ol className="mt-3 space-y-2">
                {c.focus.map((f, i) => (
                  <li key={f} className="flex gap-3 text-sm text-zinc-200">
                    <span className="display grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-xs text-accent">{i + 1}</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.notes.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {c.notes.map((n) => (
                <li key={n.text} className="flex gap-2">
                  <span className={`w-4 shrink-0 text-center font-bold ${TONES[n.tone].color}`}>{TONES[n.tone].mark}</span>
                  <span className="text-zinc-300">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
